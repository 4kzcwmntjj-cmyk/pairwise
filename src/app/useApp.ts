import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocalStore, type Snapshot } from '../store/store';
import { loadCatalogueFile, mergeCatalogue } from '../anilist/catalogueFile';
import { fit as fitModel, type Fit } from '../rank/solver';
import { nextPair, pairKey, type Pair } from '../rank/pairs';
import { DEFAULT_SETTINGS, type Item, type Mark, type Outcome, type Settings, type Status, type Vote } from '../types';

export const store = new LocalStore();

type UndoEntry =
  | { kind: 'vote'; voteId: number; pair: Pair }
  | { kind: 'mark'; itemId: string; prev?: Mark; pair?: Pair | null }
  | { kind: 'skip'; itemId: string };

export interface Moved {
  title: string;
  from: number;
  to: number;
}

export function displayTitle(item: Item, settings: Settings) {
  return settings.titleLanguage === 'romaji'
    ? item.titleRomaji ?? item.title
    : item.titleEnglish ?? item.titleRomaji ?? item.title;
}

export function useApp() {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map());
  const [votes, setVotes] = useState<Vote[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [catalogueAt, setCatalogueAt] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [pair, setPair] = useState<Pair | null>(null);
  const [skippedPairs, setSkippedPairs] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Moved | null>(null);
  const warm = useRef<Map<string, number> | undefined>(undefined);

  const applySnapshot = useCallback((s: Snapshot) => {
    setItems(s.items);
    // "Want to watch" was removed; those titles go back to unsorted.
    const dropped = s.marks.filter((m) => (m.status as string) === 'want');
    for (const m of dropped) store.deleteMark(m.itemId).catch(() => undefined);
    setMarks(new Map(s.marks.filter((m) => !dropped.includes(m)).map((m) => [m.itemId, m])));
    setVotes(s.votes);
    setSettingsState(s.settings);
    setSkipped((s.meta.skipped as string[]) ?? []);
    setCatalogueAt((s.meta.catalogueGeneratedAt as string) ?? null);
    setUndoStack([]);
    setPair(null);
  }, []);

  useEffect(() => {
    store
      .loadAll()
      .then(applySnapshot)
      .finally(() => setReady(true));
  }, [applySnapshot]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const seenIds = useMemo(
    () => [...marks.values()].filter((m) => m.status === 'seen' && itemById.has(m.itemId)).map((m) => m.itemId),
    [marks, itemById],
  );

  const fit: Fit = useMemo(() => {
    const f = fitModel({ ids: seenIds, anchors: {}, votes, warm: warm.current });
    warm.current = f.theta;
    return f;
  }, [seenIds, marks, votes]);

  const rankOf = useMemo(() => new Map(fit.order.map((id, i) => [id, i + 1])), [fit]);

  // Keep a valid duel ready.
  useEffect(() => {
    if (!ready) return;
    const valid = pair && rankOf.has(pair.a) && rankOf.has(pair.b);
    if (!valid) setPair(nextPair({ fit, recent: votes, skipped: skippedPairs }));
  }, [ready, pair, fit, rankOf, votes, skippedPairs]);

  const pushUndo = (e: UndoEntry) => setUndoStack((s) => [...s.slice(-99), e]);

  const markItem = useCallback(
    async (itemId: string, status: Status) => {
      const prev = marks.get(itemId);
      const mark: Mark = { itemId, status, updatedAt: Date.now() };
      setMarks((m) => new Map(m).set(itemId, mark));
      pushUndo({ kind: 'mark', itemId, prev, pair });
      await store.setMark(mark);
    },
    [marks, pair],
  );

  const clearMark = useCallback(
    async (itemId: string) => {
      const prev = marks.get(itemId);
      if (!prev) return;
      setMarks((m) => {
        const n = new Map(m);
        n.delete(itemId);
        return n;
      });
      pushUndo({ kind: 'mark', itemId, prev, pair });
      await store.deleteMark(itemId);
    },
    [marks, pair],
  );

  const skipSort = useCallback(
    async (itemId: string) => {
      const next = [...skipped.filter((id) => id !== itemId), itemId];
      setSkipped(next);
      pushUndo({ kind: 'skip', itemId });
      await store.setMeta('skipped', next);
    },
    [skipped],
  );

  const vote = useCallback(
    async (outcome: Outcome) => {
      if (!pair) return;
      const winner = outcome === 'a' ? pair.a : outcome === 'b' ? pair.b : null;
      const before = winner ? rankOf.get(winner) : undefined;
      const v: Vote = { a: pair.a, b: pair.b, outcome, mode: pair.mode, at: Date.now() };
      const id = await store.addVote(v);
      const saved = { ...v, id };
      const nextVotes = [...votes, saved];
      setVotes(nextVotes);
      pushUndo({ kind: 'vote', voteId: id, pair });
      if (winner && before !== undefined) {
        const after = fitModel({ ids: seenIds, anchors: {}, votes: nextVotes, warm: warm.current });
        const to = after.order.indexOf(winner) + 1;
        setMoved({ title: displayTitle(itemById.get(winner)!, settings), from: before, to });
      } else setMoved(null);
      setPair(null);
    },
    [pair, rankOf, votes, seenIds, marks, itemById, settings],
  );

  const skipPair = useCallback(() => {
    if (!pair) return;
    setSkippedPairs((s) => new Set(s).add(pairKey(pair.a, pair.b)));
    setMoved(null);
    setPair(null);
  }, [pair]);

  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    setMoved(null);
    if (last.kind === 'vote') {
      setVotes((vs) => vs.filter((v) => v.id !== last.voteId));
      setPair(last.pair);
      await store.deleteVote(last.voteId);
    } else if (last.kind === 'mark') {
      if (last.prev) {
        const prev = last.prev;
        setMarks((m) => new Map(m).set(last.itemId, prev));
        await store.setMark(prev);
      } else {
        setMarks((m) => {
          const n = new Map(m);
          n.delete(last.itemId);
          return n;
        });
        await store.deleteMark(last.itemId);
      }
      if (last.pair !== undefined) setPair(last.pair);
    } else {
      const next = skipped.filter((id) => id !== last.itemId);
      setSkipped(next);
      await store.setMeta('skipped', next);
    }
  }, [undoStack, skipped]);

  const setSettings = useCallback(async (s: Settings) => {
    setSettingsState(s);
    await store.setSettings(s);
  }, []);

  const saveItems = useCallback(async (next: Item[]) => {
    setItems((cur) => {
      const map = new Map(cur.map((i) => [i.id, i]));
      for (const i of next) map.set(i.id, i);
      return [...map.values()];
    });
    await store.putItems(next);
  }, []);

  /**
   * Brings in the catalogue shipped with the site. Without `force`, does
   * nothing unless the shipped file is newer than the one last merged.
   * Returns how many titles were new to this device.
   */
  const syncCatalogue = useCallback(
    async (force = false) => {
      const file = await loadCatalogueFile();
      if (!force && catalogueAt && file.generatedAt <= catalogueAt) return 0;
      const known = new Set(items.map((i) => i.id));
      const merged = mergeCatalogue(items, file.items);
      await saveItems(merged);
      await store.setMeta('catalogueGeneratedAt', file.generatedAt);
      setCatalogueAt(file.generatedAt);
      return merged.filter((i) => !known.has(i.id)).length;
    },
    [items, catalogueAt, saveItems],
  );

  const replaceAll = useCallback(
    async (s: Snapshot) => {
      await store.replaceAll(s);
      applySnapshot(await store.loadAll());
    },
    [applySnapshot],
  );

  const resetAll = useCallback(async () => {
    await store.clearAll();
    warm.current = undefined;
    applySnapshot({ items: [], marks: [], votes: [], settings, meta: {} });
  }, [applySnapshot, settings]);

  const snapshot = useCallback(
    (): Snapshot => ({
      items,
      marks: [...marks.values()],
      votes,
      settings,
      meta: { skipped, ...(catalogueAt ? { catalogueGeneratedAt: catalogueAt } : {}) },
    }),
    [items, marks, votes, settings, skipped, catalogueAt],
  );

  return {
    ready,
    items,
    itemById,
    marks,
    votes,
    settings,
    skipped,
    fit,
    rankOf,
    pair,
    moved,
    canUndo: undoStack.length > 0,
    lastUndoKind: undoStack[undoStack.length - 1]?.kind,
    markItem,
    clearMark,
    skipSort,
    vote,
    skipPair,
    undo,
    setSettings,
    saveItems,
    syncCatalogue,
    catalogueAt,
    replaceAll,
    resetAll,
    snapshot,
    title: (item: Item) => displayTitle(item, settings),
  };
}

export type AppState = ReturnType<typeof useApp>;

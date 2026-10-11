import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocalStore, toExport, type Snapshot } from '../store/store';
import { saveCopy } from './saveCopy';
import { loadCatalogueFile, mergeCatalogue } from '../anilist/catalogueFile';
import { fit as fitModel, type Fit } from '../rank/solver';
import { nextPair, pairKey, type Pair } from '../rank/pairs';
import { applyGroupOps, resolveMarks, resolveVotes, splitId, type GroupOp } from '../anilist/overrides';
import { isMangaOnly } from '../anilist/group';
import { DEFAULT_SETTINGS, type Item, type Mark, type Outcome, type Settings, type Status, type Vote } from '../types';

export const store = new LocalStore();

/** When the list was last saved to a file, how much was in it then, and when to stop reminding. */
export interface BackupNote {
  at: number;
  size: number;
  snoozeUntil?: number;
}
/** Remind after this many new marks and duels since the last copy (or since the start, if never saved)... */
export const BACKUP_AFTER_CHANGES = 150;
/** ...or after this long, if anything changed at all. */
export const BACKUP_AFTER_DAYS = 14;

/** Each screen undoes only what was done on it. Grouping changes are undone from Settings. */
export type UndoScope = 'duel' | 'sort';

type UndoEntry = { scope: UndoScope } & (
  | { kind: 'vote'; voteId: number; pair: Pair }
  | { kind: 'mark'; itemId: string; prev?: Mark; pair?: Pair | null }
  | { kind: 'skip'; itemId: string }
);

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
  // What is stored: the catalogue as built, your marks and votes as recorded, and your grouping changes.
  const [baseItems, setItems] = useState<Item[]>([]);
  const [rawMarks, setMarks] = useState<Map<string, Mark>>(new Map());
  const [rawVotes, setVotes] = useState<Vote[]>([]);
  const [groupOps, setGroupOps] = useState<GroupOp[]>([]);
  const [backup, setBackup] = useState<BackupNote | null>(null);
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
    setGroupOps((s.meta.groupOps as GroupOp[]) ?? []);
    setBackup((s.meta.backup as BackupNote) ?? null);
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

  // What the app works with: titles after your grouping changes, with marks and votes following them.
  const grouping = useMemo(() => applyGroupOps(baseItems, groupOps), [baseItems, groupOps]);
  const items = useMemo(
    () => (settings.manga ? grouping.items : grouping.items.filter((i) => !isMangaOnly(i))),
    [grouping, settings.manga],
  );
  const marks = useMemo(() => resolveMarks(rawMarks.values(), grouping.resolve), [rawMarks, grouping]);
  const votes = useMemo(() => resolveVotes(rawVotes, grouping.resolve), [rawVotes, grouping]);
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
    async (itemId: string, status: Status, scope: UndoScope = 'sort') => {
      const prev = rawMarks.get(itemId);
      const mark: Mark = { itemId, status, updatedAt: Date.now() };
      setMarks((m) => new Map(m).set(itemId, mark));
      pushUndo({ scope, kind: 'mark', itemId, prev, pair });
      await store.setMark(mark);
    },
    [rawMarks, pair],
  );

  const clearMark = useCallback(
    async (itemId: string, scope: UndoScope = 'sort') => {
      // Marks left on titles that were joined into this one count for it too, so clear those as well.
      const keys = [...rawMarks.keys()].filter((k) => grouping.resolve(k) === itemId);
      if (keys.length === 0) return;
      setMarks((m) => {
        const n = new Map(m);
        for (const k of keys) n.delete(k);
        return n;
      });
      pushUndo({ scope, kind: 'mark', itemId, prev: rawMarks.get(itemId) ?? marks.get(itemId), pair });
      await Promise.all(keys.map((k) => store.deleteMark(k)));
    },
    [rawMarks, marks, grouping, pair],
  );

  const skipSort = useCallback(
    async (itemId: string) => {
      const next = [...skipped.filter((id) => id !== itemId), itemId];
      setSkipped(next);
      pushUndo({ scope: 'sort', kind: 'skip', itemId });
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
      setVotes((vs) => [...vs, saved]);
      pushUndo({ scope: 'duel', kind: 'vote', voteId: id, pair });
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

  const undo = useCallback(async (scope: UndoScope) => {
    const at = undoStack.map((e) => e.scope).lastIndexOf(scope);
    if (at < 0) return;
    const last = undoStack[at];
    setUndoStack((s) => s.filter((_, i) => i !== at));
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
      const known = new Set(baseItems.map((i) => i.id));
      const merged = mergeCatalogue(baseItems, file.items);
      await saveItems(merged);
      await store.setMeta('catalogueGeneratedAt', file.generatedAt);
      setCatalogueAt(file.generatedAt);
      return merged.filter((i) => !known.has(i.id)).length;
    },
    [baseItems, catalogueAt, saveItems],
  );

  const replaceAll = useCallback(
    async (s: Snapshot) => {
      await store.replaceAll(s);
      applySnapshot(await store.loadAll());
      // A list loaded from a file is, by definition, saved in that file.
      const note: BackupNote = { at: Date.now(), size: s.marks.length + s.votes.length };
      setBackup(note);
      await store.setMeta('backup', note);
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
      items: baseItems,
      marks: [...rawMarks.values()],
      votes: rawVotes,
      settings,
      meta: { skipped, groupOps, ...(catalogueAt ? { catalogueGeneratedAt: catalogueAt } : {}) },
    }),
    [baseItems, rawMarks, rawVotes, settings, skipped, groupOps, catalogueAt],
  );

  const size = rawMarks.size + rawVotes.length;
  const backupDue = (() => {
    if (!ready || size === 0) return false;
    if (backup?.snoozeUntil && Date.now() < backup.snoozeUntil) return false;
    const changed = size - (backup?.size ?? 0);
    if (changed <= 0) return false;
    if (!backup) return changed >= BACKUP_AFTER_CHANGES / 3;
    return changed >= BACKUP_AFTER_CHANGES || Date.now() - backup.at > BACKUP_AFTER_DAYS * 86_400_000;
  })();

  /** Saves a copy of everything to a file (the share sheet on phones). */
  const saveBackup = async () => {
    const name = `shobu-${new Date().toISOString().slice(0, 10)}.json`;
    const result = await saveCopy(name, JSON.stringify(toExport(snapshot())));
    if (result !== 'cancelled') {
      const note: BackupNote = { at: Date.now(), size };
      setBackup(note);
      await store.setMeta('backup', note);
    }
    return result;
  };

  const snoozeBackup = async () => {
    const note: BackupNote = { at: backup?.at ?? 0, size: backup?.size ?? 0, snoozeUntil: Date.now() + 3 * 86_400_000 };
    setBackup(note);
    await store.setMeta('backup', note);
  };

  const saveOps = async (next: GroupOp[]) => {
    setGroupOps(next);
    await store.setMeta('groupOps', next);
  };

  async function writeMark(itemId: string, mark: Mark | null) {
    setMarks((m) => {
      const n = new Map(m);
      if (mark) n.set(itemId, mark);
      else n.delete(itemId);
      return n;
    });
    if (mark) await store.setMark(mark);
    else await store.deleteMark(itemId);
  }

  /**
   * Joins `otherId` into `keepId`. The joined title's duels count for the one kept; duels between
   * the two are set aside. If either was marked seen, the result is seen.
   */
  const joinItems = async (keepId: string, otherId: string) => {
    const keep = itemById.get(keepId);
    const other = itemById.get(otherId);
    if (!keep || !other || keepId === otherId) return;
    const now = Date.now();
    const keepMark = rawMarks.get(keepId);
    const otherMark = rawMarks.get(otherId) ?? null;
    const op: GroupOp = {
      kind: 'join',
      keep: keep.entryIds[0],
      other: other.entryIds[0],
      at: now,
      otherMark,
      keepMark: keepMark ?? null,
      label: `${displayTitle(other, settings)} into ${displayTitle(keep, settings)}`,
    };
    const either = [marks.get(keepId)?.status, marks.get(otherId)?.status];
    const status: Status | null = either.includes('seen') ? 'seen' : either.includes('unseen') ? 'unseen' : null;
    if (status && status !== keepMark?.status) await writeMark(keepId, { itemId: keepId, status, updatedAt: now });
    if (otherMark) await writeMark(otherId, null);
    setMoved(null);
    await saveOps([...groupOps, op]);
  };

  /** Moves the given entries of a title into a title of their own, unmarked. Returns its id. */
  const splitItem = async (itemId: string, entryIds: number[]) => {
    const item = itemById.get(itemId);
    if (!item || entryIds.length === 0 || entryIds.length >= item.entryIds.length) return null;
    const id = splitId(entryIds, (x) => itemById.has(x) || groupOps.some((o) => o.kind === 'split' && o.id === x));
    const names = (item.entries ?? []).filter((e) => entryIds.includes(e.id)).map((e) => e.titleEnglish ?? e.titleRomaji);
    const op: GroupOp = {
      kind: 'split',
      entryIds,
      id,
      at: Date.now(),
      label: `${names[0] ?? 'Part'}${names.length > 1 ? ` and ${names.length - 1} more` : ''} out of ${displayTitle(item, settings)}`,
    };
    setMoved(null);
    await saveOps([...groupOps, op]);
    return id;
  };

  /** Takes a grouping change back out. A joined title gets its old mark back. */
  async function removeGroupOp(op: GroupOp) {
    const next = groupOps.filter((o) => o !== op && !(o.at === op.at && o.kind === op.kind));
    await saveOps(next);
    if (op.kind === 'join') {
      if (op.otherMark && !rawMarks.has(op.otherMark.itemId)) await writeMark(op.otherMark.itemId, op.otherMark);
      // The kept title's mark goes back to what it was before the join, unless it was changed since.
      const keepId = [...baseItems].find((i) => i.entryIds.includes(op.keep))?.id;
      if (keepId && op.keepMark !== undefined && rawMarks.get(keepId)?.updatedAt === op.at) await writeMark(keepId, op.keepMark);
    }
  }

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
    canUndo: (scope: UndoScope) => undoStack.some((e) => e.scope === scope),
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
    baseItems,
    groupOps,
    backup,
    backupDue,
    saveBackup,
    snoozeBackup,
    resolveId: grouping.resolve,
    joinItems,
    splitItem,
    removeGroupOp,
  };
}

export type AppState = ReturnType<typeof useApp>;

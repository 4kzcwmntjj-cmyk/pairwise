import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocalStore, toExport, type Snapshot } from '../store/store';
import { saveCopy } from './saveCopy';
import { loadCatalogueFile, mergeCatalogue } from '../anilist/catalogueFile';
import { fit as fitModel, type Fit } from '../rank/solver';
import { newcomerShare, nextPair, pairKey, replaceSide, type Newcomer, type Pair } from '../rank/pairs';
import { seenModel } from '../rank/seen';
import { applyGroupOps, resolveMarks, resolveVotes, splitId, type GroupOp } from '../anilist/overrides';
import { lookOf, sideFor, type Look } from '../rank/look';
import { applyAnswer, clearIn, formUnknown, formsOf, hasBoth, inView, knownIn, projectMarks, type Answer } from '../rank/medium';
import { DEFAULT_SETTINGS, type Item, type Mark, type Outcome, type Settings, type Status, type View, type Vote } from '../types';

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
  /** A newcomer duel: the vote and the mark that came with it, undone together. */
  | { kind: 'newcomer'; voteId: number; itemIds: string[]; pair: Pair }
);

export interface Moved {
  title: string;
  from: number;
  to: number;
  /** A title that just joined your list from a newcomer duel. */
  isNew?: boolean;
  /** Two titles joined at once (the first duel of a new list). */
  both?: boolean;
}

/** Newcomer outcomes kept for working out how often to bring one in. */
const NEWCOMER_LOG = 20;

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
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [catalogueAt, setCatalogueAt] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [pair, setPair] = useState<Pair | null>(null);
  const [skippedPairs, setSkippedPairs] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Moved | null>(null);
  /** Whether each recent newcomer was a title you'd seen. */
  const [newcomerLog, setNewcomerLog] = useState<boolean[]>([]);
  /** Newcomers skipped this session. */
  const [passed, setPassed] = useState<Set<string>>(new Set());
  /** Newcomers picked in the both view whose form (watched or read) is still to be asked, oldest first. */
  const [formAsks, setFormAsks] = useState<string[]>([]);
  const warm = useRef<Map<string, number> | undefined>(undefined);
  /** Goes up whenever all data is replaced, so slow background work can tell its data is gone. */
  const generation = useRef(0);

  const applySnapshot = useCallback((s: Snapshot) => {
    setItems(s.items);
    // "Want to watch" was removed; those titles go back to unsorted.
    const dropped = s.marks.filter((m) => (m.status as string) === 'want');
    for (const m of dropped) store.deleteMark(m.itemId).catch(() => undefined);
    setMarks(new Map(s.marks.filter((m) => !dropped.includes(m)).map((m) => [m.itemId, m])));
    setVotes(s.votes);
    // The "Include manga" switch became the anime / manga / both view.
    const legacy = s.settings as Settings & { manga?: boolean };
    const view: View = legacy.view ?? (legacy.manga === false ? 'anime' : 'both');
    const { manga: _manga, ...rest } = legacy;
    setSettingsState({ ...rest, view });
    setSkipped((s.meta.skipped as string[]) ?? []);
    setDismissed((s.meta.dismissed as string[]) ?? []);
    setNewcomerLog((s.meta.newcomerLog as boolean[]) ?? []);
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
  const allItems = grouping.items;
  const allMarks = useMemo(() => resolveMarks(rawMarks.values(), grouping.resolve), [rawMarks, grouping]);
  const votes = useMemo(() => resolveVotes(rawVotes, grouping.resolve), [rawVotes, grouping]);
  const itemById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);

  // The view (anime, manga or both) decides which titles show, and how marks read: in the anime view,
  // a title you've only read counts as not seen.
  const view = settings.view;
  const items = useMemo(() => allItems.filter((i) => inView(i, view)), [allItems, view]);
  const marks = useMemo(() => projectMarks(items, allMarks, view), [items, allMarks, view]);
  /** How a title is shown in this view: the side of it you know. */
  const look = useCallback((item: Item): Look => lookOf(item, sideFor(item, view, allMarks.get(item.id))), [view, allMarks]);

  // One ranking over everything you've seen in any form; each view shows its part of it.
  const seenIds = useMemo(
    () => [...projectMarks(allItems, allMarks, 'both').values()].filter((m) => m.status === 'seen').map((m) => m.itemId),
    [allItems, allMarks],
  );

  const fullFit: Fit = useMemo(() => {
    const f = fitModel({ ids: seenIds, anchors: {}, votes, warm: warm.current });
    warm.current = f.theta;
    return f;
  }, [seenIds, votes]);

  const inViewSeen = useCallback((id: string) => marks.get(id)?.status === 'seen', [marks]);
  const fit: Fit = useMemo(() => ({ ...fullFit, order: fullFit.order.filter(inViewSeen) }), [fullFit, inViewSeen]);

  const rankOf = useMemo(() => new Map(fit.order.map((id, i) => [id, i + 1])), [fit]);

  /** The chance you've seen each unsorted title in this view. Sort's queue and newcomer duels both use it. */
  const seenGuess = useMemo(() => seenModel(items, marks), [items, marks]);

  /** Unsorted titles you've probably seen, likeliest first: candidates for newcomer duels. */
  const newcomers: Newcomer[] = useMemo(() => {
    const later = new Set(skipped);
    return [...seenGuess.probability.entries()]
      .filter(([id]) => !marks.has(id) && !later.has(id) && !passed.has(id))
      .map(([id, p]) => ({ id, p }))
      .sort((x, y) => y.p - x.p)
      .slice(0, 20);
  }, [seenGuess, marks, skipped, passed]);

  // Keep a valid duel ready.
  const isValid = useCallback(
    (p: Pair | null) =>
      !!p &&
      [p.a, p.b].every((id) => (p.fresh?.includes(id) ? !marks.has(id) && itemById.has(id) : rankOf.has(id))),
    [marks, itemById, rankOf],
  );
  useEffect(() => {
    if (!ready || isValid(pair)) return;
    setPair(
      nextPair({ fit, recent: votes, skipped: skippedPairs, newcomers, newcomerShare: newcomerShare(newcomerLog) }),
    );
  }, [ready, pair, isValid, fit, votes, skippedPairs, newcomers, newcomerLog]);

  const logNewcomer = useCallback(
    async (hit: boolean) => {
      const next = [...newcomerLog, hit].slice(-NEWCOMER_LOG);
      setNewcomerLog(next);
      await store.setMeta('newcomerLog', next);
    },
    [newcomerLog],
  );

  const pushUndo = (e: UndoEntry) => setUndoStack((s) => [...s.slice(-99), e]);

  /** Writes a mark (or removes it) and records how to undo it. */
  const putMark = useCallback(
    async (itemId: string, next: Mark | undefined, scope: UndoScope, pairNow: Pair | null) => {
      const prev = rawMarks.get(itemId);
      setMarks((m) => {
        const n = new Map(m);
        if (next) n.set(itemId, next);
        else n.delete(itemId);
        return n;
      });
      pushUndo({ scope, kind: 'mark', itemId, prev, pair: pairNow });
      if (next) await store.setMark(next);
      else await store.deleteMark(itemId);
    },
    [rawMarks],
  );

  /**
   * Records an answer about a title: watched and/or read, or not. For a title with one form only the
   * status is kept; for a title with both, the answer is merged with what was known.
   */
  const answer = useCallback(
    async (itemId: string, ans: Answer, scope: UndoScope = 'sort') => {
      const item = itemById.get(itemId);
      if (!item) return;
      await putMark(itemId, applyAnswer(item, allMarks.get(itemId), ans, Date.now()), scope, pair);
    },
    [itemById, allMarks, putMark, pair],
  );

  /** Seen or not, as the current view means it: in the anime view, "seen" means watched. */
  const markItem = useCallback(
    async (itemId: string, status: Status, scope: UndoScope = 'sort') => {
      const item = itemById.get(itemId);
      if (item && hasBoth(item) && view !== 'both') return answer(itemId, { [view]: status === 'seen' }, scope);
      await putMark(itemId, { itemId, status, updatedAt: Date.now() }, scope, pair);
    },
    [itemById, view, answer, putMark, pair],
  );

  const clearMark = useCallback(
    async (itemId: string, scope: UndoScope = 'sort', everything = false) => {
      const item = itemById.get(itemId);
      // In the anime or manga view, clearing a title with both forms clears only that form.
      const partial = item && !everything ? clearIn(item, allMarks.get(itemId), view, Date.now()) : undefined;
      if (partial) return putMark(itemId, partial, scope, pair);
      // Marks left on titles that were joined into this one count for it too, so clear those as well.
      const keys = [...rawMarks.keys()].filter((k) => grouping.resolve(k) === itemId);
      if (keys.length === 0) return;
      setMarks((m) => {
        const n = new Map(m);
        for (const k of keys) n.delete(k);
        return n;
      });
      pushUndo({ scope, kind: 'mark', itemId, prev: rawMarks.get(itemId) ?? allMarks.get(itemId), pair });
      await Promise.all(keys.map((k) => store.deleteMark(k)));
    },
    [itemById, allMarks, view, putMark, rawMarks, grouping, pair],
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

  /** The mark for a newcomer you picked in a duel: seen, in the form the view means. */
  const newcomerMark = (item: Item): Mark => {
    const at = Date.now();
    if (view !== 'both') return applyAnswer(item, allMarks.get(item.id), { [view]: true }, at);
    // In the both view a title with both forms could be either; ask afterwards.
    if (hasBoth(item)) return { itemId: item.id, status: 'seen', updatedAt: at };
    return applyAnswer(item, allMarks.get(item.id), { anime: true, manga: true }, at);
  };

  const vote = useCallback(
    async (outcome: Outcome) => {
      if (!pair) return;
      if (pair.fresh?.length) {
        const fresh = pair.fresh.map((id) => itemById.get(id)).filter((i): i is Item => !!i);
        if (fresh.length !== pair.fresh.length) return;
        const newMarks = fresh.map(newcomerMark);
        setMarks((m) => {
          const n = new Map(m);
          for (const mk of newMarks) n.set(mk.itemId, mk);
          return n;
        });
        await Promise.all(newMarks.map((mk) => store.setMark(mk)));
        const v: Vote = { a: pair.a, b: pair.b, outcome, mode: pair.mode, at: Date.now() };
        const id = await store.addVote(v);
        const saved = { ...v, id };
        const nextVotes = [...votes, saved];
        setVotes((vs) => [...vs, saved]);
        pushUndo({ scope: 'duel', kind: 'newcomer', voteId: id, itemIds: fresh.map((i) => i.id), pair });
        logNewcomer(true);
        const freshIds = new Set(fresh.map((i) => i.id));
        const after = fitModel({ ids: [...seenIds, ...freshIds], anchors: {}, votes: nextVotes, warm: warm.current });
        const order = after.order.filter((x) => freshIds.has(x) || inViewSeen(x));
        // The one that joined; with two new titles, the winner (or the first, on a tie).
        const shown = fresh.length === 1 ? fresh[0] : (fresh.find((i) => i.id === (outcome === 'a' ? pair.a : pair.b)) ?? fresh[0]);
        const to = order.indexOf(shown.id) + 1;
        setMoved({
          title: fresh.length === 2 ? `${displayTitle(fresh[0], settings)} and ${displayTitle(fresh[1], settings)}` : displayTitle(shown, settings),
          from: to,
          to,
          isNew: true,
          both: fresh.length === 2,
        });
        const ask = view === 'both' ? fresh.filter(hasBoth).map((i) => i.id) : [];
        if (ask.length) setFormAsks((q) => [...q.filter((x) => !ask.includes(x)), ...ask]);
        setPair(null);
        return;
      }
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
        const to = after.order.filter(inViewSeen).indexOf(winner) + 1;
        setMoved({ title: displayTitle(itemById.get(winner)!, settings), from: before, to });
      } else setMoved(null);
      setPair(null);
    },
    [pair, rankOf, votes, seenIds, inViewSeen, itemById, settings, view, allMarks, logNewcomer],
  );

  /**
   * "Haven't seen" on one side of a duel. The other side stays where it is and gets a new partner, so a title
   * you could answer about doesn't disappear with the one you couldn't.
   */
  const notSeenInDuel = useCallback(
    async (itemId: string) => {
      if (!pair) return;
      if (pair.fresh?.includes(itemId)) logNewcomer(false);
      // Set the next duel first; the mark below records this one for undo.
      setPair(replaceSide({ fit, recent: votes, skipped: skippedPairs, newcomers }, pair, itemId));
      setMoved(null);
      await markItem(itemId, 'unseen', 'duel');
    },
    [pair, fit, votes, skippedPairs, newcomers, logNewcomer, markItem],
  );

  /**
   * Newcomers picked in the both view that have an anime and a manga, still waiting for "watched or read?".
   * Duel asks about them a few at a time rather than after every pick.
   */
  const formPending = useMemo(
    () => formAsks.filter((id) => formUnknown(itemById.get(id) ?? { formats: [] }, allMarks.get(id))),
    [formAsks, itemById, allMarks],
  );
  /** Answer for one title, or `null` to leave them all for later (they stay "watched or read?" in the Library). */
  const answerForm = useCallback(
    async (id: string | null, ans: Answer | null) => {
      if (!id || !ans) return setFormAsks([]);
      setFormAsks((q) => q.filter((x) => x !== id));
      await answer(id, ans, 'duel');
    },
    [answer],
  );

  const skipPair = useCallback(() => {
    if (!pair) return;
    if (pair.fresh) {
      const fresh = pair.fresh;
      setPassed((s) => new Set([...s, ...fresh]));
    }
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
    } else if (last.kind === 'newcomer') {
      setVotes((vs) => vs.filter((v) => v.id !== last.voteId));
      setMarks((m) => {
        const n = new Map(m);
        for (const id of last.itemIds) n.delete(id);
        return n;
      });
      setFormAsks((q) => q.filter((x) => !last.itemIds.includes(x)));
      setPair(last.pair);
      await store.deleteVote(last.voteId);
      await Promise.all(last.itemIds.map((id) => store.deleteMark(id)));
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

  /** Hide a title from For you. Stored by entry ids so it survives regrouping. */
  const dismiss = useCallback(
    async (itemId: string, hide: boolean) => {
      const entryIds = itemById.get(itemId)?.entryIds ?? [];
      const keys = entryIds.map(String);
      const next = hide ? [...new Set([...dismissed, ...keys])] : dismissed.filter((k) => !keys.includes(k));
      setDismissed(next);
      await store.setMeta('dismissed', next);
    },
    [dismissed, itemById],
  );

  const setSettings = useCallback(async (s: Settings) => {
    setSettingsState(s);
    await store.setSettings(s);
  }, []);

  const saveItems = useCallback(async (next: Item[]) => {
    // Stored first: on first launch this is the whole catalogue, and showing it before the write finishes
    // lets your first answers queue behind it for a few seconds.
    await store.putItems(next);
    setItems((cur) => {
      const map = new Map(cur.map((i) => [i.id, i]));
      for (const i of next) map.set(i.id, i);
      return [...map.values()];
    });
  }, []);

  /**
   * Brings in the catalogue shipped with the site. Without `force`, does
   * nothing unless the shipped file is newer than the one last merged.
   * Returns how many titles were new to this device.
   */
  const syncCatalogue = useCallback(
    async (force = false) => {
      const gen = generation.current;
      const file = await loadCatalogueFile();
      if (!force && catalogueAt && file.generatedAt <= catalogueAt) return 0;
      // A copy was loaded or everything deleted while the file downloaded: this merge is for data that's gone.
      if (gen !== generation.current) return 0;
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
      generation.current++;
      // Bring the copy's titles up to date with the catalogue this site ships, so an older copy gets
      // the newer titles (and manga) straight away.
      let snapshot = s;
      try {
        const file = await loadCatalogueFile();
        if (!s.meta.catalogueGeneratedAt || file.generatedAt > (s.meta.catalogueGeneratedAt as string)) {
          const merged = mergeCatalogue(s.items, file.items);
          const byId = new Map(s.items.map((i) => [i.id, i]));
          for (const i of merged) byId.set(i.id, i);
          snapshot = { ...s, items: [...byId.values()], meta: { ...s.meta, catalogueGeneratedAt: file.generatedAt } };
        }
      } catch {
        // Offline: keep the copy as it is; the next launch brings the catalogue in.
      }
      await store.replaceAll(snapshot);
      applySnapshot(await store.loadAll());
      // A list loaded from a file is, by definition, saved in that file.
      const note: BackupNote = { at: Date.now(), size: s.marks.length + s.votes.length };
      setBackup(note);
      await store.setMeta('backup', note);
    },
    [applySnapshot],
  );

  const resetAll = useCallback(async () => {
    generation.current++;
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
      meta: { skipped, dismissed, newcomerLog, groupOps, ...(catalogueAt ? { catalogueGeneratedAt: catalogueAt } : {}) },
    }),
    [baseItems, rawMarks, rawVotes, settings, skipped, dismissed, newcomerLog, groupOps, catalogueAt],
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

  // Saved before the screen changes, so whoever asked for the change can show its result in the same update.
  const saveOps = async (next: GroupOp[]) => {
    await store.setMeta('groupOps', next);
    setGroupOps(next);
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
  /**
   * Moves groups of a title's entries into titles of their own (one new title per group). Returns their ids.
   * Past duels stay with the original. A new title that is all anime or all manga takes its mark from what
   * you said about that form of the original, if anything; otherwise it starts unmarked.
   */
  const splitItem = async (itemId: string, groups: number[][]) => {
    const item = itemById.get(itemId);
    const moving = groups.flat();
    if (!item || moving.length === 0 || moving.length >= item.entryIds.length || groups.some((g) => g.length === 0)) return [];
    const parentMark = allMarks.get(itemId);
    const taken = new Set(groupOps.flatMap((o) => (o.kind === 'split' ? [o.id] : [])));
    const ops: GroupOp[] = [];
    const ids: string[] = [];
    const now = Date.now();
    for (const [n, entryIds] of groups.entries()) {
      const id = splitId(entryIds, (x) => itemById.has(x) || taken.has(x));
      taken.add(id);
      ids.push(id);
      const names = (item.entries ?? []).filter((e) => entryIds.includes(e.id)).map((e) => e.titleEnglish ?? e.titleRomaji);
      ops.push({
        kind: 'split',
        entryIds,
        id,
        at: now + n,
        label: `${names[0] ?? 'Part'}${names.length > 1 ? ` and ${names.length - 1} more` : ''} out of ${displayTitle(item, settings)}`,
      });
      const formats = (item.entries ?? []).filter((e) => entryIds.includes(e.id)).map((e) => e.format);
      const forms = formsOf({ formats });
      if (forms.anime !== forms.manga) {
        const known = knownIn(item, parentMark, forms.anime ? 'anime' : 'manga');
        if (known !== undefined && parentMark && (parentMark.anime !== undefined || parentMark.manga !== undefined)) {
          await writeMark(id, { itemId: id, status: known ? 'seen' : 'unseen', updatedAt: now });
        }
      }
    }
    setMoved(null);
    await saveOps([...groupOps, ...ops]);
    return ids;
  };

  /** Takes a grouping change back out. A joined title gets its old mark back. */
  async function removeGroupOp(op: GroupOp) {
    const next = groupOps.filter((o) => o !== op && !(o.at === op.at && o.kind === op.kind && (o.kind !== 'split' || o.id === (op as { id?: string }).id)));
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
    answer,
    allItems,
    allMarks,
    view,
    seenIds,
    clearMark,
    skipSort,
    seenGuess,
    notSeenInDuel,
    formPending,
    answerForm,
    dismissed,
    dismiss,
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
    look,
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

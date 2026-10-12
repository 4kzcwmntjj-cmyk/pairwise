import type { Entry, Item, Mark, Side, Vote } from '../types';
import { isManga, isMangaOnly, summarise } from './group';

/**
 * Your own corrections to how the catalogue groups entries into franchises.
 *
 * The catalogue's grouping is the base. Your changes are kept as a list of
 * operations, applied in order on top of it each time the app loads, so they
 * survive monthly catalogue rebuilds. Operations name AniList entries, not
 * franchise ids, so they still find their target if the catalogue regroups.
 *
 * Nothing in the vote log is rewritten. When a title disappears (joined into
 * another), its id is mapped to the title that absorbed it, and votes and
 * marks follow that mapping. Removing the operation brings the title back
 * with its own duels.
 */
export type GroupOp =
  | {
      kind: 'join';
      /** An entry of the title that stays. */
      keep: number;
      /** An entry of the title that is joined into it. */
      other: number;
      at: number;
      /** The joined title's mark before the join, restored if the join is removed. */
      otherMark?: Mark | null;
      /** The kept title's mark before the join. */
      keepMark?: Mark | null;
      /** Titles at the time, for the list in Settings. */
      label?: string;
    }
  | {
      kind: 'split';
      /** Entries that become a title of their own. */
      entryIds: number[];
      /** Id of the new title. */
      id: string;
      at: number;
      label?: string;
    }
  | {
      /**
       * Rank a title's anime and manga apart. Every manga entry of the title holding `of` (an anime
       * entry) moves to the title `id`; the anime keeps the original id. Duels on the original follow
       * the side the card showed: manga duels go to the manga part, the rest stay with the anime.
       *
       * Ranking them together again sets `together` rather than deleting the operation, so the manga
       * part's id points back at the title and its duels count there.
       */
      kind: 'forms';
      of: number;
      id: string;
      at: number;
      together?: boolean;
      label?: string;
    };

export interface Grouping {
  items: Item[];
  /** Maps an id that no longer exists to the title that took its place. Ids that exist map to themselves. */
  resolve: (id: string) => string;
  /**
   * Like `resolve`, for one side of a duel: a duel fought on a title's manga side goes to its manga part
   * when the anime and manga are ranked apart.
   */
  resolveSide: (id: string, side?: Side) => string;
  /** For titles ranked apart: the anime part's id to the manga part's, and back. */
  apart: Map<string, string>;
}

const noApart = new Map<string, string>();

const MAX_RECS = 12;

export function applyGroupOps(base: Item[], ops: GroupOp[]): Grouping {
  if (ops.length === 0) return { items: base, resolve: (id) => id, resolveSide: (id) => id, apart: noApart };

  const baseById = new Map(base.map((i) => [i.id, i]));
  const entryData = new Map<number, Entry>();
  const baseOfEntry = new Map<number, string>();
  type Group = { id: string; entries: Set<number> };
  const groups = new Map<string, Group>();
  const owner = new Map<number, Group>();
  for (const item of base) {
    const g: Group = { id: item.id, entries: new Set(item.entryIds) };
    groups.set(item.id, g);
    for (const e of item.entryIds) {
      owner.set(e, g);
      baseOfEntry.set(e, item.id);
    }
    for (const e of item.entries ?? []) entryData.set(e.id, e);
  }

  const alias = new Map<string, string>();
  /** Titles ranked apart: the id the anime kept, to the manga part's id. */
  const mangaOf = new Map<string, string>();
  const splitIds = new Set(ops.flatMap((o) => (o.kind === 'split' ? [o.id] : [])));
  const retire = (g: Group, into: string) => {
    groups.delete(g.id);
    alias.set(g.id, into);
  };

  for (const op of ops) {
    if (op.kind === 'join') {
      const keep = owner.get(op.keep);
      const other = owner.get(op.other);
      if (!keep || !other || keep === other) continue;
      for (const e of other.entries) {
        keep.entries.add(e);
        owner.set(e, keep);
      }
      retire(other, keep.id);
    } else if (op.kind === 'forms') {
      const from = owner.get(op.of);
      if (!from || from.id === op.id) continue;
      if (op.together) {
        // Ranked together again: the manga part's duels and marks count for the title.
        if (!groups.has(op.id)) alias.set(op.id, from.id);
        continue;
      }
      const moving = [...from.entries].filter((e) => {
        const d = entryData.get(e);
        return d !== undefined && isManga(d.format);
      });
      if (moving.length === 0 || moving.length === from.entries.size || groups.has(op.id)) continue;
      const target: Group = { id: op.id, entries: new Set(moving) };
      groups.set(op.id, target);
      alias.delete(op.id);
      for (const e of moving) {
        from.entries.delete(e);
        owner.set(e, target);
      }
      mangaOf.set(from.id, op.id);
    } else {
      const moving = op.entryIds.filter((e) => owner.has(e));
      if (moving.length === 0) continue;
      let target = groups.get(op.id);
      if (!target) {
        target = { id: op.id, entries: new Set() };
        groups.set(op.id, target);
        alias.delete(op.id);
      }
      for (const e of moving) {
        const from = owner.get(e)!;
        if (from === target) continue;
        from.entries.delete(e);
        target.entries.add(e);
        owner.set(e, target);
        if (from.entries.size === 0) retire(from, target.id);
      }
    }
  }

  const resolve = (id: string) => {
    let x = id;
    for (let i = 0; i < 100 && alias.has(x); i++) x = alias.get(x)!;
    return x;
  };
  const resolveSide = (id: string, side?: Side) => {
    if (side !== 'manga' || mangaOf.size === 0) return resolve(id);
    // Follow the id through joins; the first title on the way that was ranked apart takes the duel on its manga part.
    let x = id;
    for (let i = 0; i < 100; i++) {
      const m = mangaOf.get(x);
      if (m !== undefined) return resolve(m);
      const next = alias.get(x);
      if (next === undefined) break;
      x = next;
    }
    return resolve(id);
  };
  const apart = new Map<string, string>();
  for (const [a, m] of mangaOf) {
    if (!groups.has(a) || !groups.has(m)) continue;
    apart.set(a, m);
    apart.set(m, a);
  }

  const items: Item[] = [];
  for (const g of groups.values()) {
    const b = baseById.get(g.id);
    if (b && b.entryIds.length === g.entries.size && b.entryIds.every((e) => g.entries.has(e))) {
      items.push(b);
      continue;
    }
    items.push(rebuild(g.id, [...g.entries].sort((x, y) => x - y), b));
  }

  function rebuild(id: string, entryIds: number[], own: Item | undefined): Item {
    // The title's own base entry, and any base title most of whose entries ended up here, pass on
    // their recommendation links and fallbacks.
    const counts = new Map<string, number>();
    for (const e of entryIds) counts.set(baseOfEntry.get(e)!, (counts.get(baseOfEntry.get(e)!) ?? 0) + 1);
    const parents = [...counts]
      .filter(([bid, n]) => bid === id || n * 2 > baseById.get(bid)!.entryIds.length)
      .map(([bid]) => baseById.get(bid)!)
      .sort((x, y) => Number(y === own) - Number(x === own) || y.popularity - x.popularity);

    const data = entryIds.map((e) => entryData.get(e)).filter((e): e is Entry => !!e);
    let item: Item;
    if (data.length > 0) {
      item = { ...summarise(data), id, entryIds };
      const sameCover = parents.find((p) => p.cover === item.cover);
      if (sameCover?.coverLarge) item.coverLarge = sameCover.coverLarge;
      if (sameCover?.coverColor) item.coverColor = sameCover.coverColor;
    } else {
      // Entries without details (an older catalogue): fall back to the titles they came from.
      const first = parents[0] ?? baseById.get(baseOfEntry.get(entryIds[0])!)!;
      const years = parents.flatMap((p) => [p.startYear, p.endYear]).filter((y): y is number => y !== undefined);
      const genres = [...new Set(parents.flatMap((p) => p.genres ?? []))].slice(0, 6);
      item = {
        ...first,
        id,
        entryIds,
        formats: parents.flatMap((p) => p.formats),
        startYear: years.length ? Math.min(...years) : first.startYear,
        endYear: years.length ? Math.max(...years) : first.endYear,
        popularity: Math.max(...parents.map((p) => p.popularity), first.popularity),
        ...(genres.length ? { genres } : {}),
      };
      delete item.entries;
    }
    const recs = new Map<string, number>();
    for (const p of parents) for (const [t, w] of p.recs ?? []) recs.set(t, (recs.get(t) ?? 0) + w);
    if (recs.size) item.recs = [...recs];
    else delete item.recs;
    return item;
  }

  // Recommendation links point at ids; follow them to where those titles are now.
  const out = items.map((item) => {
    if (!item.recs) return item;
    const totals = new Map<string, number>();
    for (const [t, w] of item.recs) {
      const to = resolve(t);
      if (to === item.id || !groups.has(to)) continue;
      totals.set(to, (totals.get(to) ?? 0) + w);
    }
    const recs = [...totals].sort((a, b) => b[1] - a[1]).slice(0, MAX_RECS);
    return { ...item, recs };
  });

  // Splitting the manga out of a franchise leaves two titles with one name; mark the manga one.
  const titles = new Map<string, number>();
  for (const i of out) titles.set(i.title, (titles.get(i.title) ?? 0) + 1);
  const tagged = (i: Item, form: string) => {
    const tag = (t?: string) => (t ? `${t} (${form})` : t);
    return { ...i, title: `${i.title} (${form})`, titleEnglish: tag(i.titleEnglish), titleRomaji: tag(i.titleRomaji) };
  };
  const named = out.map((i) => {
    // Titles ranked apart are always named by form.
    if (apart.has(i.id)) return tagged(i, mangaOf.has(i.id) ? 'anime' : 'manga');
    if (!splitIds.has(i.id) || !isMangaOnly(i) || (titles.get(i.title) ?? 0) < 2) return i;
    return tagged(i, 'manga');
  });
  return { items: named, resolve, resolveSide, apart };
}

/**
 * Votes with ids mapped to current titles. A duel between two titles that are now one is set aside.
 * Given the side each card showed, a duel on a title's manga goes to its manga part when the two are ranked apart.
 */
export function resolveVotes(votes: Vote[], resolve: (id: string, side?: Side) => string): Vote[] {
  const out: Vote[] = [];
  for (const v of votes) {
    const a = resolve(v.a, v.sideA);
    const b = resolve(v.b, v.sideB);
    if (a === b) continue;
    out.push(a === v.a && b === v.b ? v : { ...v, a, b });
  }
  return out;
}

/**
 * Marks keyed by current title. A mark made on the title itself wins over marks
 * left on titles joined into it; among those, seen wins, then the newer.
 */
export function resolveMarks(marks: Iterable<Mark>, resolve: (id: string) => string): Map<string, Mark> {
  const out = new Map<string, Mark>();
  const direct = new Set<string>();
  for (const m of marks) {
    const id = resolve(m.itemId);
    if (id === m.itemId) {
      out.set(id, m);
      direct.add(id);
      continue;
    }
    if (direct.has(id)) continue;
    const mark = { ...m, itemId: id };
    const prev = out.get(id);
    if (
      !prev ||
      (mark.status === 'seen' && prev.status !== 'seen') ||
      (mark.status === prev.status && mark.updatedAt > prev.updatedAt)
    ) {
      out.set(id, mark);
    }
  }
  return out;
}

/** A fresh id for a split-off title. */
export function splitId(entryIds: number[], taken: (id: string) => boolean): string {
  const base = `s-${Math.min(...entryIds)}`;
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

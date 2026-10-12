import { isManga } from '../anilist/group';
import type { Item, Mark, Medium, View } from '../types';
import { hasBoth, knownIn } from './medium';
import type { Recommendation } from './recommend';

/**
 * The rows on For you: groups of suggestions, each with its own reason.
 *
 * Rows are built from the same scored suggestions as the list below them
 * (`recommend`), so the two never disagree about what is worth seeing. A title
 * appears in at most one row, the first that claims it.
 */

/** A row needs this many titles to be shown. */
export const MIN_ROW = 3;
/** Most titles in one row. */
export const MAX_ROW = 12;
/** How many of your top titles get a "Because you rank X highly" row. */
export const BECAUSE_ROWS = 3;
/** A hidden gem is outside this many of the most popular titles in the view. */
export const GEM_POPULARITY_RANK = 300;
/** A hidden gem with a known AniList score needs at least this one. */
export const GEM_MIN_SCORE = 70;

export interface RowPick {
  item: Item;
  /** Small line under the title, when the row has something to say about it. */
  note?: string;
}

export interface SuggestionRow {
  id: string;
  kind: 'because' | 'gems' | 'manga' | 'anime';
  heading: string;
  /** For a "because" row, the title it is about. */
  source?: Item;
  picks: RowPick[];
}

export interface RowInput {
  /** Titles in the view. */
  items: Item[];
  /** Your ranking in the view, best first. */
  order: string[];
  /** Scored suggestions for the view (see `recommend`), best first, without the ones you hid. */
  recs: Recommendation[];
  /** Whether a title was hidden with Not interested. */
  isHidden: (item: Item) => boolean;
  /** Marks as the view reads them. */
  marks: Map<string, Mark>;
  /** Every title and every mark, whatever the view, for the manga row. */
  allItems: Item[];
  allMarks: Map<string, Mark>;
  /** Your whole ranking, anime and manga together, best first. */
  fullOrder: string[];
  /** The view you're in: Read the manga shows in Anime and Both, Watch the anime in Manga and Both. */
  view: View;
  /** Your rank in the view, for captions. */
  rankOf: Map<string, number>;
  title: (item: Item) => string;
}

/** Rank of each title by AniList popularity within a set, 1 = most popular. */
export function popularityRanks(items: Item[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => b.popularity - a.popularity);
  return new Map(sorted.map((i, k) => [i.id, k + 1]));
}

/**
 * Titles that suggestions link to from one of your top ranked titles,
 * in the order that title's AniList recommendations list them.
 */
export function becauseRow(source: Item, byId: Map<string, Item>, allowed: Set<string>, taken: Set<string>): RowPick[] {
  const picks: RowPick[] = [];
  for (const [target] of source.recs ?? []) {
    if (!allowed.has(target) || taken.has(target)) continue;
    const item = byId.get(target);
    if (item) picks.push({ item });
    if (picks.length === MAX_ROW) break;
  }
  return picks;
}

/**
 * Suggestions with strong links from what you rank highly, that few people have
 * seen: outside the most popular titles of the view, and not poorly scored.
 */
export function hiddenGems(recs: Recommendation[], popularityRank: Map<string, number>, taken: Set<string>): RowPick[] {
  const linked = recs.filter((r) => r.links > 0);
  if (!linked.length) return [];
  // "Strong" is relative: at or above the middle link score of the linked suggestions.
  const sorted = linked.map((r) => r.links).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return linked
    .filter(
      (r) =>
        !taken.has(r.item.id) &&
        r.links >= median &&
        (popularityRank.get(r.item.id) ?? 0) > GEM_POPULARITY_RANK &&
        (r.item.averageScore === undefined || r.item.averageScore >= GEM_MIN_SCORE),
    )
    .sort((a, b) => b.links - a.links)
    .slice(0, MAX_ROW)
    .map((r) => ({ item: r.item }));
}

/**
 * Titles with an anime and a manga that you know in one form and have ruled
 * out in the other, ranked in the top third of your list, best first. `known`
 * is the form you know: 'anime' gives the titles to read, 'manga' the ones to watch.
 */
export function otherForm(
  allItems: Item[],
  allMarks: Map<string, Mark>,
  fullOrder: string[],
  isHidden: (item: Item) => boolean,
  known: Medium,
): Item[] {
  const other: Medium = known === 'anime' ? 'manga' : 'anime';
  const byId = new Map(allItems.map((i) => [i.id, i]));
  const limit = Math.max(10, Math.ceil(fullOrder.length / 3));
  const out: Item[] = [];
  for (const id of fullOrder.slice(0, limit)) {
    const item = byId.get(id);
    if (!item || isHidden(item)) continue;
    // Needs the other form's own entries to show its cover.
    if (!hasBoth(item) || !item.entries?.some((e) => isManga(e.format) === (other === 'manga'))) continue;
    const mark = allMarks.get(id);
    if (knownIn(item, mark, known) !== true || knownIn(item, mark, other) !== false) continue;
    out.push(item);
    if (out.length === MAX_ROW) break;
  }
  return out;
}

export function buildRows(input: RowInput): SuggestionRow[] {
  const { items, order, recs, isHidden, marks, allItems, allMarks, fullOrder, view, rankOf, title } = input;
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows: SuggestionRow[] = [];
  const taken = new Set<string>();
  const claim = (picks: RowPick[]) => picks.forEach((p) => taken.add(p.item.id));

  // Titles worth suggesting at all: not seen, not hidden.
  const allowed = new Set(
    items.filter((i) => marks.get(i.id)?.status !== 'seen' && !isHidden(i)).map((i) => i.id),
  );

  for (const id of order.slice(0, BECAUSE_ROWS)) {
    const source = byId.get(id);
    if (!source) continue;
    const picks = becauseRow(source, byId, allowed, taken);
    if (picks.length < MIN_ROW) continue;
    claim(picks);
    rows.push({ id: `because-${id}`, kind: 'because', heading: `Because you rank ${title(source)} highly`, source, picks });
  }

  const gems = hiddenGems(recs, popularityRanks(items), taken);
  if (gems.length >= MIN_ROW) {
    claim(gems);
    rows.push({ id: 'gems', kind: 'gems', heading: 'Hidden gems', picks: gems });
  }

  const cross: [Medium, 'manga' | 'anime', string][] = [
    ['anime', 'manga', 'Read the manga'],
    ['manga', 'anime', 'Watch the anime'],
  ];
  for (const [known, kind, heading] of cross) {
    // A row recommends the form you don't know, so it makes no sense in that form's own view:
    // no Read the manga in the Manga view, no Watch the anime in the Anime view.
    if (view === kind) continue;
    const found = otherForm(allItems, allMarks, fullOrder, isHidden, known);
    if (!found.length) continue;
    rows.push({
      id: kind,
      kind,
      heading,
      picks: found.map((item) => ({ item, note: `You rank it #${rankOf.get(item.id) ?? fullOrder.indexOf(item.id) + 1}` })),
    });
  }
  return rows;
}

/** A small seeded random number generator, so a day's pick stays the same on reload. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number for today's date in the person's own time zone, e.g. 20261012. */
export const dayNumber = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** How many of the best suggestions Tonight's pick draws from. */
export const PICK_POOL = 30;

/**
 * The order Tonight's pick goes through: the best suggestions shuffled, with
 * better ones likelier to come early. The same seed gives the same order.
 */
export function tonightOrder(recs: Recommendation[], seed: number, pool = PICK_POOL): Recommendation[] {
  const rand = seededRandom(seed);
  const left = recs.slice(0, pool).map((r) => ({ r, w: Math.max(r.score, 0.05) ** 2 }));
  const out: Recommendation[] = [];
  while (left.length) {
    const total = left.reduce((a, x) => a + x.w, 0);
    let t = rand() * total;
    let k = 0;
    while (k < left.length - 1 && t >= left[k].w) {
      t -= left[k].w;
      k++;
    }
    out.push(left[k].r);
    left.splice(k, 1);
  }
  return out;
}

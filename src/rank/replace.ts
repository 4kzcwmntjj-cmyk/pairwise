import type { Vote } from '../types';
import { pairKey, PLACED_AFTER, type Pair } from './pairs';
import type { Fit } from './solver';

/**
 * Re-placing a title: its earlier duels are set aside (stored, but left out of the fit), then a short round of duels
 * finds its place by binary search over the rest of the ranking.
 *
 * Round duels are stored as ordinary placement duels (mode 'place'); the round reads its own from the title and the
 * start time.
 *
 * Each title has at most one cut-off time. Re-placing again moves it to now; counting the old duels again removes it,
 * and every duel the title has played counts once more.
 */
export type Resets = Record<string, number>;

/** The duels that count: those of a re-placed title from before its cut-off are left out (for both titles in them). */
export function countedVotes<V extends Pick<Vote, 'a' | 'b' | 'at'>>(votes: V[], resets: Resets): V[] {
  if (Object.keys(resets).length === 0) return votes;
  return votes.filter((v) => !((resets[v.a] ?? 0) > v.at || (resets[v.b] ?? 0) > v.at));
}

/** How many of a title's duels are set aside by its cut-off. */
export function setAsideCount(votes: Pick<Vote, 'a' | 'b' | 'at'>[], resets: Resets, id: string): number {
  const cut = resets[id];
  if (cut === undefined) return 0;
  return votes.filter((v) => (v.a === id || v.b === id) && v.at < cut).length;
}

/**
 * A placement round under way: the title, when it started, its rank in the view before it started, and the rest of
 * the ranking as it stood then. The search runs over that fixed order: each duel moves the opponent a little in the
 * live ranking, and searching the live order would keep shifting the range.
 */
export interface Placement {
  id: string;
  since: number;
  from?: number;
  others: string[];
}

/** A round never runs longer than this, whatever the list size. */
export const PLACE_MAX = 14;

export interface PlacementStatus {
  /** Duels answered in the round. */
  asked: number;
  /** Duels the round will take in all, at the current pace (asked plus what is left). */
  total: number;
  done: boolean;
  /** The open range, as indexes into the ranking without the title: it belongs after `lo` titles and before index `hi`. */
  lo: number;
  hi: number;
  /** Opponents already met in the round. */
  met: Set<string>;
  /**
   * After the search: duels still wanted on one side to even out the round's record (+ wins over titles just below,
   * − losses to titles just above). See placementStatus.
   */
  even: number;
}

/** Duels a round usually adds after the search to even out its record (see placementStatus). */
export const EVEN_GUESS = 2;

/** Duels needed to place a title among `open` + 1 possible spots. */
export const stepsFor = (open: number) => (open <= 0 ? 0 : Math.ceil(Math.log2(open + 1)));

/**
 * Where the round stands, read from its duels (so undoing one steps the round back). The title belongs below every
 * title it lost to in the round and above every title it beat, in the order the round started from; the round ends
 * when no title is left between those, at a tie, at PLACE_MAX duels, or when the title is no longer in `order` (the
 * ranking in the view).
 */
export function placementStatus(p: Placement, order: string[], votes: Pick<Vote, 'a' | 'b' | 'outcome' | 'mode' | 'at'>[]): PlacementStatus {
  const index = new Map(p.others.map((id, i) => [id, i]));
  let lo = 0;
  let hi = p.others.length;
  let asked = 0;
  let wins = 0;
  let losses = 0;
  let tied = false;
  const met = new Set<string>();
  for (const v of votes) {
    if (v.mode !== 'place' || v.at < p.since || (v.a !== p.id && v.b !== p.id)) continue;
    asked++;
    const other = v.a === p.id ? v.b : v.a;
    met.add(other);
    if (v.outcome === 'tie') {
      tied = true;
      continue;
    }
    const at = index.get(other);
    if (at === undefined) continue;
    const won = (v.outcome === 'a') === (v.a === p.id);
    if (won) {
      hi = Math.min(hi, at);
      wins++;
    } else {
      lo = Math.max(lo, at + 1);
      losses++;
    }
  }
  const open = Math.max(0, hi - lo);
  // A search often ends lopsided (say one win and five losses), and the ranking, which treats titles close together
  // as near-even, would then put the title well below where the search found it. So once the range is closed, a
  // duel or two against the nearest titles on the short side evens the record to within one.
  const gap = losses - wins;
  const roomBelow = p.others.length - Math.max(lo, hi) - [...met].filter((id) => (index.get(id) ?? -1) >= Math.max(lo, hi)).length;
  const roomAbove = Math.min(lo, hi) - [...met].filter((id) => (index.get(id) ?? Infinity) < Math.min(lo, hi)).length;
  const even = open > 0 || Math.abs(gap) <= 1 ? 0 : gap > 0 ? Math.min(gap - 1, roomBelow) : -Math.min(-gap - 1, roomAbove);
  const done = tied || (open === 0 && even === 0) || asked >= PLACE_MAX || !index.size || !order.includes(p.id);
  // While searching, the evening out is not known yet; it averages one or two duels, so count two.
  const left = open > 0 ? stepsFor(open) + EVEN_GUESS : Math.abs(even);
  return { asked, total: done ? asked : Math.min(PLACE_MAX, asked + left), done, lo, hi, met, even };
}

/**
 * The next duel of the round: the title against the most settled title near the middle of the open range (smallest
 * standard error, then nearest the middle), one it hasn't met in this round. The title is always on the right.
 * Null when the round is over or nobody suitable is left.
 */
export function placementPair(p: Placement, fit: Fit, status: PlacementStatus, skipped?: Set<string>): Pair | null {
  if (status.done) return null;
  const others = p.others;
  const ranked = new Set(fit.order);
  const { lo, hi } = status;
  if (status.even !== 0) {
    // Evening out: the nearest title on the short side (just below the gap for a win, just above for a loss).
    const step = status.even > 0 ? 1 : -1;
    for (let i = status.even > 0 ? Math.max(lo, hi) : Math.min(lo, hi) - 1; i >= 0 && i < others.length; i += step) {
      const id = others[i];
      if (ranked.has(id) && !status.met.has(id) && !(skipped?.has(pairKey(id, p.id)) ?? false)) return { a: id, b: p.id, mode: 'place' };
    }
    return null;
  }
  const mid = Math.floor((lo + hi) / 2);
  const ok = (i: number) => {
    const id = others[i];
    return ranked.has(id) && !status.met.has(id) && !(skipped?.has(pairKey(id, p.id)) ?? false);
  };
  const settled = (i: number) => (fit.duels.get(others[i]) ?? 0) >= PLACED_AFTER;
  const pick = (from: number, to: number, needSettled: boolean) => {
    let best = -1;
    let bestScore = Infinity;
    for (let i = Math.max(lo, from); i <= Math.min(hi - 1, to); i++) {
      if (!ok(i) || (needSettled && !settled(i))) continue;
      // Standard error first; distance from the middle breaks near-ties.
      const score = (fit.se.get(others[i]) ?? 1) + 0.01 * Math.abs(i - mid);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  };
  // Within a sixteenth of the range either side of the middle, so each duel still roughly halves it.
  const near = Math.max(1, Math.round((hi - lo) / 16));
  let i = pick(mid - near, mid + near, true);
  if (i < 0) i = pick(lo, hi - 1, true);
  if (i < 0) i = pick(lo, hi - 1, false);
  if (i < 0) return null;
  return { a: others[i], b: p.id, mode: 'place' };
}

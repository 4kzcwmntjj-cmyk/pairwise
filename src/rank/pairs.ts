import type { DuelMode, Vote } from '../types';
import { winProbability, type Fit } from './solver';

export interface Pair {
  a: string;
  b: string;
  mode: DuelMode;
  /** In a newcomer duel: the side you haven't sorted yet. */
  newcomer?: string;
}

export interface Newcomer {
  id: string;
  /** Chance you've seen it, from the "probably seen" model. */
  p: number;
}

export interface PairContext {
  fit: Fit;
  /** Every vote so far, newest last. */
  recent: (Pick<Vote, 'a' | 'b'> & { at?: number })[];
  /** Pairs skipped recently, as unordered keys. */
  skipped?: Set<string>;
  /** Unsorted titles you've probably seen, most likely first. */
  newcomers?: Newcomer[];
  /** Share of duels (outside placement) that bring in a newcomer, from `newcomerShare`. */
  newcomerShare?: number;
  now?: number;
  random?: () => number;
}

/** A title needs this many duels before it counts as placed. */
export const PLACED_AFTER = 3;
const EXPLORE_SHARE = 0.1;
const NEIGHBOURS = 8;
const RECENT_PAIRS = 40;
/** A pair duelled this often is settled: two results say where they stand, even if they disagree. */
const PAIR_SETTLED_AFTER = 2;
/** ...until this long after its last duel, when taste may have moved. */
const REMATCH_AFTER_MS = 120 * 86_400_000;
/** Newcomers below this chance of having been seen stay in the library. */
export const NEWCOMER_MIN_P = 0.4;

/**
 * How often to bring in a newcomer, from how your recent newcomers went
 * (true = you'd seen it). Starts around one duel in three; drops towards one
 * in seven if you keep pressing "Haven't seen", rises to about half if you
 * keep knowing them.
 */
export function newcomerShare(log: boolean[]): number {
  const recent = log.slice(-12);
  const hits = recent.filter(Boolean).length;
  const rate = (hits + 2) / (recent.length + 3);
  return 0.1 + 0.4 * rate;
}

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Chooses the next duel.
 *
 * 1. Placement: a title with few duels meets the placed title closest to
 *    its current strength, which behaves like a binary search through the list.
 * 2. Newcomer: an unsorted title you've probably seen meets a title from the
 *    middle of your list. Picking either side marks it seen and starts its
 *    placement. How often this happens follows `newcomerShare`; it is also
 *    the fallback when refinement has nothing left to ask.
 * 3. Exploration: one duel in ten is a random pair.
 * 4. Refinement: an uncertain title, weighted towards the top of the list,
 *    meets the neighbour whose result is hardest to predict. A pair that has
 *    met twice is left alone until a few months have passed, so the top of
 *    the list doesn't keep replaying the same close calls.
 */
export function nextPair(ctx: PairContext): Pair | null {
  const { fit } = ctx;
  const rnd = ctx.random ?? Math.random;
  const ids = fit.order;
  if (ids.length < 2) return null;

  const recentKeys = new Set<string>();
  const recentByItem = new Map<string, Set<string>>();
  for (const v of ctx.recent.slice(-RECENT_PAIRS)) {
    recentKeys.add(pairKey(v.a, v.b));
    if (!recentByItem.has(v.a)) recentByItem.set(v.a, new Set());
    if (!recentByItem.has(v.b)) recentByItem.set(v.b, new Set());
    recentByItem.get(v.a)!.add(v.b);
    recentByItem.get(v.b)!.add(v.a);
  }
  const blocked = (x: string, y: string) =>
    x === y || recentKeys.has(pairKey(x, y)) || (ctx.skipped?.has(pairKey(x, y)) ?? false);
  const shuffle = (x: string, y: string, mode: DuelMode): Pair =>
    rnd() < 0.5 ? { a: x, b: y, mode } : { a: y, b: x, mode };

  // 1. Placement.
  const unplaced = ids.filter((id) => (fit.duels.get(id) ?? 0) < PLACED_AFTER);
  if (unplaced.length > 0) {
    const fewest = Math.min(...unplaced.map((id) => fit.duels.get(id) ?? 0));
    const pool = unplaced.filter((id) => (fit.duels.get(id) ?? 0) === fewest);
    const newcomer = pool[Math.floor(rnd() * pool.length)];
    const placed = ids.filter((id) => id !== newcomer && (fit.duels.get(id) ?? 0) >= PLACED_AFTER);
    const opponents = (placed.length > 0 ? placed : ids.filter((id) => id !== newcomer)).filter(
      (id) => !blocked(newcomer, id) && !recentByItem.get(newcomer)?.has(id),
    );
    if (opponents.length > 0) {
      const t = fit.theta.get(newcomer)!;
      opponents.sort((x, y) => Math.abs(fit.theta.get(x)! - t) - Math.abs(fit.theta.get(y)! - t));
      const pick = opponents[Math.floor(rnd() * Math.min(3, opponents.length))];
      return shuffle(newcomer, pick, 'place');
    }
  }

  const newcomers = (ctx.newcomers ?? []).filter((c) => c.p >= NEWCOMER_MIN_P && !(fit.theta.has(c.id)));
  const newcomerPair = (): Pair | null => {
    if (newcomers.length === 0) return null;
    // Mostly the likeliest, with some spread so one stubborn title doesn't block the rest.
    const c = newcomers[Math.floor(rnd() * Math.min(3, newcomers.length))];
    const placed = ids.filter((id) => (fit.duels.get(id) ?? 0) >= PLACED_AFTER);
    const pool = placed.length >= 2 ? placed : ids;
    // The middle of the list: the first step of a binary search.
    const lo = Math.floor(pool.length * 0.3);
    const hi = Math.max(lo + 1, Math.ceil(pool.length * 0.7));
    const middle = pool.slice(lo, hi).filter((id) => !blocked(c.id, id));
    if (middle.length === 0) return null;
    const opponent = middle[Math.floor(rnd() * middle.length)];
    return { ...shuffle(c.id, opponent, 'new'), newcomer: c.id };
  };

  // 2. Newcomer.
  if (rnd() < (ctx.newcomerShare ?? 0)) {
    const p = newcomerPair();
    if (p) return p;
  }

  // 3. Exploration.
  if (rnd() < EXPLORE_SHARE) {
    for (let tries = 0; tries < 20; tries++) {
      const x = ids[Math.floor(rnd() * ids.length)];
      const y = ids[Math.floor(rnd() * ids.length)];
      if (!blocked(x, y)) return shuffle(x, y, 'explore');
    }
  }

  // 4. Refinement.
  const now = ctx.now ?? Date.now();
  const met = new Map<string, { n: number; last: number }>();
  for (const v of ctx.recent) {
    const k = pairKey(v.a, v.b);
    const m = met.get(k) ?? { n: 0, last: 0 };
    met.set(k, { n: m.n + 1, last: Math.max(m.last, v.at ?? now) });
  }
  const settledPair = (x: string, y: string) => {
    const m = met.get(pairKey(x, y));
    return !!m && m.n >= PAIR_SETTLED_AFTER && now - m.last < REMATCH_AFTER_MS;
  };
  const rank = new Map(ids.map((id, i) => [id, i] as const));
  const weightOf = (id: string) => {
    const r = rank.get(id)!;
    return (fit.se.get(id) ?? 1) * (1 + 2 * Math.exp(-r / 15));
  };
  let best: { x: string; y: string; score: number } | null = null;
  // Sample a handful of focus titles by weight, then score their neighbours.
  const weights = ids.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  for (let sample = 0; sample < 12; sample++) {
    let r = rnd() * total;
    let fi = 0;
    while (fi < ids.length - 1 && r > weights[fi]) r -= weights[fi++];
    const x = ids[fi];
    const lo = Math.max(0, fi - NEIGHBOURS);
    const hi = Math.min(ids.length - 1, fi + NEIGHBOURS);
    for (let j = lo; j <= hi; j++) {
      const y = ids[j];
      if (blocked(x, y) || settledPair(x, y)) continue;
      const p = winProbability(fit, x, y);
      const score = p * (1 - p) * (weightOf(x) + weightOf(y)) * (0.9 + 0.2 * rnd());
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (best) return shuffle(best.x, best.y, 'refine');

  // Nothing left worth refining: bring in someone new if there is anyone.
  const fallback = newcomerPair();
  if (fallback) return fallback;

  // Everything nearby was shown recently: fall back to any unblocked pair.
  for (let tries = 0; tries < 50; tries++) {
    const x = ids[Math.floor(rnd() * ids.length)];
    const y = ids[Math.floor(rnd() * ids.length)];
    if (x !== y && !(ctx.skipped?.has(pairKey(x, y)) ?? false)) return shuffle(x, y, 'explore');
  }
  return null;
}

import type { DuelMode, Vote } from '../types';
import { winProbability, type Fit } from './solver';

export interface Pair {
  a: string;
  b: string;
  mode: DuelMode;
}

export interface PairContext {
  fit: Fit;
  /** Recent votes, newest last. */
  recent: Pick<Vote, 'a' | 'b'>[];
  /** Pairs skipped recently, as unordered keys. */
  skipped?: Set<string>;
  random?: () => number;
}

/** A title needs this many duels before it counts as placed. */
export const PLACED_AFTER = 3;
const EXPLORE_SHARE = 0.1;
const NEIGHBOURS = 8;
const RECENT_PAIRS = 40;

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Chooses the next duel.
 *
 * 1. Placement: a title with few duels meets the placed title closest to
 *    its current strength, which behaves like a binary search through the list.
 * 2. Exploration: one duel in ten is a random pair.
 * 3. Refinement: an uncertain title, weighted towards the top of the list,
 *    meets the neighbour whose result is hardest to predict.
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

  // 2. Exploration.
  if (rnd() < EXPLORE_SHARE) {
    for (let tries = 0; tries < 20; tries++) {
      const x = ids[Math.floor(rnd() * ids.length)];
      const y = ids[Math.floor(rnd() * ids.length)];
      if (!blocked(x, y)) return shuffle(x, y, 'explore');
    }
  }

  // 3. Refinement.
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
      if (blocked(x, y)) continue;
      const p = winProbability(fit, x, y);
      const score = p * (1 - p) * (weightOf(x) + weightOf(y)) * (0.9 + 0.2 * rnd());
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (best) return shuffle(best.x, best.y, 'refine');

  // Everything nearby was shown recently: fall back to any unblocked pair.
  for (let tries = 0; tries < 50; tries++) {
    const x = ids[Math.floor(rnd() * ids.length)];
    const y = ids[Math.floor(rnd() * ids.length)];
    if (x !== y && !(ctx.skipped?.has(pairKey(x, y)) ?? false)) return shuffle(x, y, 'explore');
  }
  return null;
}

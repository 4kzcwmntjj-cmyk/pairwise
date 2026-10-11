import type { Item, Mark } from '../types';

/**
 * Estimates, for each unsorted title, the chance you've already seen it, so
 * Sort can ask about likely titles first instead of going by popularity.
 *
 * Features per title:
 * - popularity (log scale, standardised across the catalogue);
 * - links to titles you've marked seen, and to titles you've marked
 *   haven't seen. AniList recommendation links are written by people who
 *   watched both shows, so they stand in for "watched together";
 * - distance in years from the middle of what you've seen.
 *
 * A logistic model turns these into a probability. It starts from fixed
 * weights and, once you've marked enough titles, refits the weights to your
 * own marks, pulled towards the starting weights so a few odd answers can't
 * swing it.
 */

export interface SeenModel {
  /** Probability of having seen each unsorted title. */
  probability: Map<string, number>;
  /** Expected number of seen titles still among the unsorted ones. */
  expectedRemaining: number;
  /** Whether the weights were fitted to your marks (false = starting weights). */
  fitted: boolean;
}

type Vec = [number, number, number, number, number];
/** intercept, popularity, links to seen, links to haven't seen, years from your middle */
const DEFAULT_WEIGHTS: Vec = [-1.2, 1.1, 0.9, -0.6, -0.25];
const MIN_TO_FIT = 30;
const MIN_PER_CLASS = 8;
const PRIOR_STRENGTH = 2;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function seenModel(items: Item[], marks: Map<string, Mark>): SeenModel {
  // Undirected link weights between titles.
  const links = new Map<string, Map<string, number>>();
  const link = (a: string, b: string, w: number) => {
    if (!links.has(a)) links.set(a, new Map());
    const m = links.get(a)!;
    m.set(b, Math.max(m.get(b) ?? 0, w));
  };
  for (const it of items) {
    for (const [target, rating] of it.recs ?? []) {
      const w = Math.log1p(rating);
      link(it.id, target, w);
      link(target, it.id, w);
    }
  }

  const logPops = items.map((i) => Math.log1p(i.popularity));
  const mean = logPops.reduce((a, b) => a + b, 0) / Math.max(1, logPops.length);
  const sd = Math.sqrt(logPops.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, logPops.length)) || 1;

  const seenYears = items
    .filter((i) => marks.get(i.id)?.status === 'seen' && i.startYear)
    .map((i) => i.startYear!)
    .sort((a, b) => a - b);
  const middleYear = seenYears.length ? seenYears[Math.floor(seenYears.length / 2)] : undefined;

  const features = (it: Item): Vec => {
    let pos = 0;
    let neg = 0;
    for (const [other, w] of links.get(it.id) ?? []) {
      const s = marks.get(other)?.status;
      if (s === 'seen') pos += w;
      else if (s === 'unseen') neg += w;
    }
    const years = middleYear && it.startYear ? Math.abs(it.startYear - middleYear) / 10 : 0;
    // Square roots keep a heavily linked title from dominating.
    return [1, (Math.log1p(it.popularity) - mean) / sd, Math.sqrt(pos), Math.sqrt(neg), years];
  };

  // Fit to the titles already marked, if there are enough of each kind.
  let weights: Vec = [...DEFAULT_WEIGHTS];
  let fitted = false;
  const training: [Vec, number][] = [];
  for (const it of items) {
    const s = marks.get(it.id)?.status;
    if (s) training.push([features(it), s === 'seen' ? 1 : 0]);
  }
  const positives = training.filter(([, y]) => y === 1).length;
  if (training.length >= MIN_TO_FIT && positives >= MIN_PER_CLASS && training.length - positives >= MIN_PER_CLASS) {
    weights = fitLogistic(training, DEFAULT_WEIGHTS, PRIOR_STRENGTH);
    fitted = true;
  }

  const probability = new Map<string, number>();
  let expectedRemaining = 0;
  for (const it of items) {
    if (marks.has(it.id)) continue;
    const x = features(it);
    const p = sigmoid(x.reduce((a, v, k) => a + v * weights[k], 0));
    probability.set(it.id, p);
    expectedRemaining += p;
  }
  return { probability, expectedRemaining, fitted };
}

/** Logistic regression by gradient ascent, with a Gaussian prior centred on `prior`. */
export function fitLogistic(data: [Vec, number][], prior: Vec, strength: number): Vec {
  const w: Vec = [...prior];
  const n = data.length;
  for (let iter = 0; iter < 300; iter++) {
    const grad: Vec = [0, 0, 0, 0, 0];
    for (const [x, y] of data) {
      const p = sigmoid(x.reduce((a, v, k) => a + v * w[k], 0));
      for (let k = 0; k < 5; k++) grad[k] += (y - p) * x[k];
    }
    let moved = 0;
    for (let k = 0; k < 5; k++) {
      const step = (0.5 * (grad[k] - strength * (w[k] - prior[k]))) / n;
      w[k] += step;
      moved = Math.max(moved, Math.abs(step));
    }
    if (moved < 1e-6) break;
  }
  return w;
}

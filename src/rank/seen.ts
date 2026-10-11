import { isMangaOnly } from '../anilist/group';
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
 * - distance in years from the middle of what you've seen;
 * - whether the title is manga with no anime. Popularity is standardised
 *   within anime and within manga separately, since AniList's numbers run
 *   lower for manga; this flag then learns how much manga you read.
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
  weights: number[];
}

type Vec = [number, number, number, number, number, number];
/** intercept, popularity, seen share of linked titles, amount of link evidence, years from your middle, manga only */
const DEFAULT_WEIGHTS: Vec = [-1.2, 1.1, 0.8, 0, -0.25, -0.8];
const MIN_TO_FIT = 30;
const MIN_PER_CLASS = 8;
/**
 * How firmly each weight is held to its starting value. Popularity is held
 * hard: the titles you've sorted are mostly popular ones (that's the order
 * Sort asks in), so they say little about how popularity matters across the
 * long tail, and a free fit would underrate it there.
 */
const PRIOR_STRENGTH: Vec = [2, 200, 2, 2, 5, 2];

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

  const scale = (group: Item[]) => {
    const logs = group.map((i) => Math.log1p(i.popularity));
    const mean = logs.reduce((a, b) => a + b, 0) / Math.max(1, logs.length);
    const sd = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, logs.length)) || 1;
    return { mean, sd };
  };
  const mangaOnly = new Set(items.filter(isMangaOnly).map((i) => i.id));
  const animeScale = scale(items.filter((i) => !mangaOnly.has(i.id)));
  const mangaScale = scale(items.filter((i) => mangaOnly.has(i.id)));

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
    // The share of a title's marked neighbours that you've seen, as log-odds with a weak
    // half-and-half start; and how much evidence that share rests on. Using a share rather
    // than a count keeps heavily linked (popular) titles from scoring high just for having
    // many links.
    const share = Math.log((pos + 1) / (neg + 1));
    const manga = mangaOnly.has(it.id);
    const { mean, sd } = manga ? mangaScale : animeScale;
    return [1, (Math.log1p(it.popularity) - mean) / sd, share, Math.sqrt(pos + neg), years, manga ? 1 : 0];
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
  return { probability, expectedRemaining, fitted, weights };
}

/**
 * Logistic regression by Newton's method (iteratively reweighted least
 * squares), with a Gaussian prior of the given strength centred on `prior`.
 * Six weights, so each step solves a 6x6 system.
 */
export function fitLogistic(data: [Vec, number][], prior: Vec, strength: Vec): Vec {
  const K = prior.length;
  let w: Vec = [...prior];
  for (let iter = 0; iter < 25; iter++) {
    const g = new Array(K).fill(0);
    const H = Array.from({ length: K }, () => new Array(K).fill(0));
    for (const [x, y] of data) {
      const p = sigmoid(x.reduce((a, v, k) => a + v * w[k], 0));
      const v = p * (1 - p);
      for (let a = 0; a < K; a++) {
        g[a] += (y - p) * x[a];
        for (let b = 0; b < K; b++) H[a][b] += v * x[a] * x[b];
      }
    }
    for (let a = 0; a < K; a++) {
      g[a] -= strength[a] * (w[a] - prior[a]);
      H[a][a] += strength[a];
    }
    const step = solve(H, g);
    // Halve the step until it improves the penalised likelihood (plain Newton can overshoot).
    const before = objective(data, w, prior, strength);
    let scale = 1;
    let next = w;
    for (let tries = 0; tries < 30; tries++) {
      next = w.map((v, k) => v + scale * step[k]) as Vec;
      if (objective(data, next, prior, strength) >= before - 1e-12) break;
      scale /= 2;
    }
    const moved = Math.max(...next.map((v, k) => Math.abs(v - w[k])));
    w = next;
    if (moved < 1e-8) break;
  }
  return w;
}

/** Penalised log-likelihood that the fit maximises. */
function objective(data: [Vec, number][], w: Vec, prior: Vec, strength: Vec): number {
  let ll = 0;
  for (const [x, y] of data) {
    const z = x.reduce((a, v, k) => a + v * w[k], 0);
    // log sigmoid(z) for y = 1, log(1 - sigmoid(z)) for y = 0, computed stably.
    ll += y === 1 ? -Math.log1p(Math.exp(-z)) : -Math.log1p(Math.exp(z));
  }
  for (let k = 0; k < prior.length; k++) ll -= (strength[k] / 2) * (w[k] - prior[k]) ** 2;
  return ll;
}

/** Solves A x = b by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let k = r + 1; k < n; k++) sum -= M[r][k] * x[k];
    x[r] = sum / M[r][r];
  }
  return x;
}

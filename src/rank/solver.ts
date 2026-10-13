import type { Outcome } from '../types';

export interface FitVote {
  a: string;
  b: string;
  outcome: Outcome;
}

export interface FitInput {
  /** Items to rank. Votes involving other ids are ignored. */
  ids: string[];
  /** Prior log-strength per item (from its tier). Missing ids default to 0. */
  anchors: Record<string, number>;
  votes: FitVote[];
  /** How many virtual tied games each item plays against its anchor. */
  priorWeight?: number;
  /** Previous log-strengths, used as a warm start. */
  warm?: Map<string, number>;
}

export interface Fit {
  /** Log-strength per item. */
  theta: Map<string, number>;
  /** Standard error of each log-strength. */
  se: Map<string, number>;
  /** Real duels each item has played (ties included). */
  duels: Map<string, number>;
  /** Ids sorted strongest first. */
  order: string[];
  iterations: number;
}

/**
 * Bradley-Terry fit by minorise-maximise iteration (Hunter 2004).
 *
 * Each item also plays `priorWeight` virtual tied games against a fixed
 * opponent at its anchor strength. This keeps undefeated or winless items
 * finite, ties items with no duels to their tier, and makes the fit unique
 * even when the comparison graph is disconnected. A tie counts as half a
 * win to each side.
 */
export function fit(input: FitInput): Fit {
  const { ids, anchors, votes } = input;
  const w = input.priorWeight ?? 1;
  const n = ids.length;
  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));

  const anchor = new Float64Array(n);
  const wins = new Float64Array(n);
  const duels = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    anchor[i] = Math.exp(anchors[ids[i]] ?? 0);
    wins[i] = 0.5 * w;
  }

  // Aggregate games per unordered pair.
  const pairGames = new Map<number, number>();
  for (const v of votes) {
    const i = index.get(v.a);
    const j = index.get(v.b);
    if (i === undefined || j === undefined || i === j) continue;
    const key = i < j ? i * n + j : j * n + i;
    pairGames.set(key, (pairGames.get(key) ?? 0) + 1);
    duels[i]++;
    duels[j]++;
    if (v.outcome === 'a') wins[i] += 1;
    else if (v.outcome === 'b') wins[j] += 1;
    else {
      wins[i] += 0.5;
      wins[j] += 0.5;
    }
  }
  const pi = new Int32Array(pairGames.size);
  const pj = new Int32Array(pairGames.size);
  const pn = new Float64Array(pairGames.size);
  let k = 0;
  for (const [key, games] of pairGames) {
    pi[k] = Math.floor(key / n);
    pj[k] = key % n;
    pn[k] = games;
    k++;
  }

  // Work on the log scale, u = log strength.
  const u = new Float64Array(n);
  for (let i = 0; i < n; i++) u[i] = input.warm?.get(ids[i]) ?? anchors[ids[i]] ?? 0;

  const denom = new Float64Array(n);
  const e = new Float64Array(n);
  /** One minorise-maximise step from `from` into `to`; returns the largest change on the log scale. */
  const step = (from: Float64Array, to: Float64Array): number => {
    for (let i = 0; i < n; i++) {
      e[i] = Math.exp(from[i]);
      denom[i] = w / (e[i] + anchor[i]);
    }
    for (let p = 0; p < pn.length; p++) {
      const i = pi[p];
      const j = pj[p];
      const d = pn[p] / (e[i] + e[j]);
      denom[i] += d;
      denom[j] += d;
    }
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      const next = Math.log(wins[i] / denom[i]);
      const change = Math.abs(next - from[i]);
      if (change > maxChange) maxChange = change;
      to[i] = next;
    }
    return maxChange;
  };
  /** The log-likelihood the steps climb (real games plus the virtual ones against each anchor). */
  const loglik = (x: Float64Array): number => {
    let l = 0;
    for (let i = 0; i < n; i++) {
      e[i] = Math.exp(x[i]);
      l += wins[i] * x[i] - w * Math.log(e[i] + anchor[i]);
    }
    for (let p = 0; p < pn.length; p++) l -= pn[p] * Math.log(e[pi[p]] + e[pj[p]]);
    return l;
  };

  // Plain steps converge slowly when a list is long and duels are spread thin. Each round takes two steps and
  // extrapolates along them (SQUAREM, Varadhan & Roland 2008), then one more step from the extrapolated point.
  // If that ends lower than where the round started, the round keeps the second plain step instead, so the
  // likelihood never falls and the answer is the same maximum the plain steps reach.
  const u1 = new Float64Array(n);
  const u2 = new Float64Array(n);
  const ux = new Float64Array(n);
  const u3 = new Float64Array(n);
  const TOL = 1e-8;
  let iterations = 0;
  let current = loglik(u);
  while (iterations < 2000) {
    iterations++;
    if (step(u, u1) < TOL) {
      u.set(u1);
      break;
    }
    iterations++;
    if (step(u1, u2) < TOL) {
      u.set(u2);
      break;
    }
    let rr = 0;
    let vv = 0;
    for (let i = 0; i < n; i++) {
      const r = u1[i] - u[i];
      const v = u2[i] - 2 * u1[i] + u[i];
      rr += r * r;
      vv += v * v;
    }
    const alpha = vv > 0 ? Math.min(-1, -Math.sqrt(rr / vv)) : -1;
    for (let i = 0; i < n; i++) {
      const r = u1[i] - u[i];
      const v = u2[i] - 2 * u1[i] + u[i];
      ux[i] = u[i] - 2 * alpha * r + alpha * alpha * v;
    }
    iterations++;
    step(ux, u3);
    const l3 = loglik(u3);
    if (Number.isFinite(l3) && l3 >= current) {
      u.set(u3);
      current = l3;
    } else {
      u.set(u2);
      current = loglik(u2);
    }
  }
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.exp(u[i]);

  // Fisher information on the log scale gives a standard error per item.
  const info = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p0 = s[i] / (s[i] + anchor[i]);
    info[i] = w * p0 * (1 - p0);
  }
  for (let p = 0; p < pn.length; p++) {
    const i = pi[p];
    const j = pj[p];
    const pij = s[i] / (s[i] + s[j]);
    const v = pn[p] * pij * (1 - pij);
    info[i] += v;
    info[j] += v;
  }

  const theta = new Map<string, number>();
  const se = new Map<string, number>();
  const duelMap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    theta.set(ids[i], Math.log(s[i]));
    se.set(ids[i], 1 / Math.sqrt(info[i]));
    duelMap.set(ids[i], duels[i]);
  }
  const order = [...ids].sort((x, y) => theta.get(y)! - theta.get(x)! || (x < y ? -1 : 1));
  return { theta, se, duels: duelMap, order, iterations };
}

/** Probability that x is preferred to y under the fit. */
export function winProbability(f: Fit, x: string, y: string): number {
  const d = (f.theta.get(x) ?? 0) - (f.theta.get(y) ?? 0);
  return 1 / (1 + Math.exp(-d));
}

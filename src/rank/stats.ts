import type { Item, Mark, Vote } from '../types';
import { PLACED_AFTER } from './pairs';
import { fit as fitModel, type Fit } from './solver';

/**
 * Numbers computed from the ranking and the vote log. Everything here is
 * pure: the screen passes in what the app holds and gets plain data back.
 *
 * Rank-based stats are only as good as the duels behind them, so the screen
 * checks `enoughForTaste` before showing anything that compares groups.
 */

/** A title counts as settled once its standard error is below this and it has played enough duels. */
export const SETTLED_SE = 0.5;
export const MIN_RANKED_FOR_TASTE = 30;
export const MIN_DUELS_FOR_TASTE = 100;
export const MIN_RANKED_FOR_CROWD = 20;

const DAY = 86_400_000;

export const enoughForTaste = (ranked: number, duels: number) =>
  ranked >= MIN_RANKED_FOR_TASTE && duels >= MIN_DUELS_FOR_TASTE;

export const isSettled = (f: Fit, id: string) => (f.se.get(id) ?? 9) < SETTLED_SE && (f.duels.get(id) ?? 0) >= PLACED_AFTER;

// ---------------------------------------------------------------- overview

export interface Overview {
  duels: number;
  ties: number;
  tieShare: number;
  seen: number;
  unseen: number;
  activeDays: number;
  perActiveDay: number;
  busiest: { day: string; count: number } | null;
  firstAt: number | null;
  longestStreak: number;
  currentStreak: number;
}

export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function overview(votes: Vote[], marks: Map<string, Mark>, now: number): Overview {
  const perDay = new Map<string, number>();
  let ties = 0;
  for (const v of votes) {
    perDay.set(dayKey(v.at), (perDay.get(dayKey(v.at)) ?? 0) + 1);
    if (v.outcome === 'tie') ties++;
  }
  const days = [...perDay.keys()].sort();
  let busiest: Overview['busiest'] = null;
  for (const [day, count] of perDay) if (!busiest || count > busiest.count) busiest = { day, count };

  // Streaks count consecutive calendar days with at least one duel.
  const dayNumber = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY);
  };
  const numbers = days.map(dayNumber);
  let longest = 0;
  let run = 0;
  numbers.forEach((n, i) => {
    run = i > 0 && n === numbers[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  const today = dayNumber(dayKey(now));
  const last = numbers[numbers.length - 1];
  const current = last !== undefined && last >= today - 1 ? run : 0;

  let seen = 0;
  let unseen = 0;
  for (const m of marks.values()) m.status === 'seen' ? seen++ : unseen++;
  return {
    duels: votes.length,
    ties,
    tieShare: votes.length ? ties / votes.length : 0,
    seen,
    unseen,
    activeDays: days.length,
    perActiveDay: days.length ? votes.length / days.length : 0,
    busiest,
    firstAt: votes.length ? Math.min(...votes.map((v) => v.at)) : null,
    longestStreak: longest,
    currentStreak: current,
  };
}

// ------------------------------------------------------------------- taste

export interface TasteGroup {
  name: string;
  n: number;
  avgRank: number;
  /** Shrunk average of how far above the middle its titles sit, -0.5 to 0.5. Higher is better liked. */
  score: number;
}

const SHRINK = 3;

/**
 * Groups ranked titles by a key (genre, studio, decade) and scores each group
 * by where its titles sit in the ranking. `ranked` is best first. The score is
 * pulled towards zero for small groups so three lucky titles don't top the list.
 */
export function tasteBy(ranked: Item[], keys: (item: Item) => string[], minN: number): TasteGroup[] {
  const total = ranked.length;
  const groups = new Map<string, { n: number; rankSum: number; delta: number }>();
  ranked.forEach((item, i) => {
    const rank = i + 1;
    const delta = 0.5 - (rank - 0.5) / total;
    for (const key of new Set(keys(item))) {
      const g = groups.get(key) ?? { n: 0, rankSum: 0, delta: 0 };
      g.n++;
      g.rankSum += rank;
      g.delta += delta;
      groups.set(key, g);
    }
  });
  return [...groups]
    .filter(([, g]) => g.n >= minN)
    .map(([name, g]) => ({ name, n: g.n, avgRank: g.rankSum / g.n, score: g.delta / (g.n + SHRINK) }))
    .sort((a, b) => b.score - a.score || b.n - a.n);
}

export const decadeOf = (item: Item) => (item.startYear ? [`${Math.floor(item.startYear / 10) * 10}s`] : []);

/** Best and worst few from a sorted taste list, with no title in both. */
export function extremes(groups: TasteGroup[], count = 5) {
  const best = groups.filter((g) => g.score > 0).slice(0, count);
  const worst = groups.filter((g) => g.score < 0).slice(-count).reverse();
  return { best, worst };
}

// ------------------------------------------------------------------- crowd

export interface HotTake {
  item: Item;
  yourRank: number;
  /** Position by AniList score among the same titles. */
  crowdRank: number;
  /** Positive: you rank it higher than the crowd does. */
  gap: number;
}

export interface CrowdView {
  n: number;
  /** Spearman correlation between your order and AniList's score order, -1 to 1. */
  agreement: number;
  lovedMore: HotTake[];
  lovedLess: HotTake[];
}

export function crowdView(ranked: Item[], count = 5): CrowdView | null {
  const rated = ranked.filter((i) => i.averageScore !== undefined);
  const n = rated.length;
  if (n < MIN_RANKED_FOR_CROWD) return null;
  const yourPos = new Map(rated.map((item, i) => [item.id, i + 1]));

  // Crowd positions, with tied scores sharing their average position.
  const byScore = [...rated].sort((a, b) => b.averageScore! - a.averageScore! || b.popularity - a.popularity);
  const crowdPos = new Map<string, number>();
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && byScore[j + 1].averageScore === byScore[i].averageScore) j++;
    const pos = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) crowdPos.set(byScore[k].id, pos);
    i = j + 1;
  }

  const xs = rated.map((i) => yourPos.get(i.id)!);
  const ys = rated.map((i) => crowdPos.get(i.id)!);
  const takes: HotTake[] = rated.map((item) => ({
    item,
    yourRank: yourPos.get(item.id)!,
    crowdRank: Math.round(crowdPos.get(item.id)!),
    gap: crowdPos.get(item.id)! - yourPos.get(item.id)!,
  }));
  return {
    n,
    agreement: pearson(xs, ys),
    lovedMore: takes.filter((t) => t.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, count),
    lovedLess: takes.filter((t) => t.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, count),
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

// -------------------------------------------------------------- mainstream

export interface Mainstream {
  /** Median popularity position of what you've seen, as the top X% of the catalogue. */
  medianTopPercent: number;
  top100Seen: number;
  top100Sorted: number;
  top100: number;
}

export function mainstream(items: Item[], marks: Map<string, Mark>): Mainstream | null {
  const byPop = [...items].sort((a, b) => b.popularity - a.popularity);
  const seenPositions: number[] = [];
  byPop.forEach((item, i) => {
    if (marks.get(item.id)?.status === 'seen') seenPositions.push(i + 1);
  });
  if (seenPositions.length === 0) return null;
  const median = seenPositions[Math.floor((seenPositions.length - 1) / 2)];
  const top = byPop.slice(0, 100);
  return {
    medianTopPercent: Math.max(1, Math.round((median / byPop.length) * 100)),
    top100Seen: top.filter((i) => marks.get(i.id)?.status === 'seen').length,
    top100Sorted: top.filter((i) => marks.has(i.id)).length,
    top100: top.length,
  };
}

// ------------------------------------------------------------------- duels

export interface Upset {
  winner: string;
  loser: string;
  /** How many places lower the winner now sits. */
  gap: number;
}

export interface Rivalry {
  a: string;
  b: string;
  aWins: number;
  bWins: number;
  ties: number;
  flipped: boolean;
}

export interface DuelRecord {
  id: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface DuelStats {
  upsets: Upset[];
  rivalries: Rivalry[];
  undefeated: DuelRecord[];
  winless: DuelRecord[];
}

export function duelStats(votes: Vote[], order: string[], count = 5): DuelStats {
  const rank = new Map(order.map((id, i) => [id, i + 1]));

  const bestUpset = new Map<string, Upset>();
  const pairs = new Map<string, Rivalry>();
  const records = new Map<string, DuelRecord>();
  const rec = (id: string) => {
    let r = records.get(id);
    if (!r) records.set(id, (r = { id, wins: 0, losses: 0, ties: 0 }));
    return r;
  };

  for (const v of votes) {
    if (!rank.has(v.a) || !rank.has(v.b)) continue;
    const [lo, hi] = v.a < v.b ? [v.a, v.b] : [v.b, v.a];
    const key = `${lo}|${hi}`;
    const p = pairs.get(key) ?? { a: lo, b: hi, aWins: 0, bWins: 0, ties: 0, flipped: false };
    pairs.set(key, p);

    if (v.outcome === 'tie') {
      p.ties++;
      rec(v.a).ties++;
      rec(v.b).ties++;
      continue;
    }
    const winner = v.outcome === 'a' ? v.a : v.b;
    const loser = v.outcome === 'a' ? v.b : v.a;
    rec(winner).wins++;
    rec(loser).losses++;
    if (winner === lo) p.aWins++;
    else p.bWins++;

    const gap = rank.get(winner)! - rank.get(loser)!;
    if (gap > 0) {
      const seen = bestUpset.get(key);
      if (!seen || gap > seen.gap) bestUpset.set(key, { winner, loser, gap });
    }
  }

  const rivalries = [...pairs.values()]
    // Two meetings, and at least one of them with a winner: "0–0, 2 too close" says nothing.
    .filter((p) => p.aWins + p.bWins + p.ties >= 2 && p.aWins + p.bWins >= 1)
    .map((p) => ({ ...p, flipped: (p.aWins > 0 && p.bWins > 0) || p.ties > 0 }))
    .sort((x, y) => Number(y.flipped) - Number(x.flipped) || y.aWins + y.bWins + y.ties - (x.aWins + x.bWins + x.ties));

  const games = (r: DuelRecord) => r.wins + r.losses + r.ties;
  const all = [...records.values()];
  return {
    upsets: [...bestUpset.values()].sort((a, b) => b.gap - a.gap).slice(0, count),
    rivalries: rivalries.slice(0, count),
    undefeated: all
      .filter((r) => r.losses === 0 && r.ties === 0 && r.wins >= PLACED_AFTER)
      .sort((a, b) => games(b) - games(a) || rank.get(a.id)! - rank.get(b.id)!)
      .slice(0, count),
    winless: all
      .filter((r) => r.wins === 0 && r.ties === 0 && r.losses >= PLACED_AFTER)
      .sort((a, b) => games(b) - games(a) || rank.get(b.id)! - rank.get(a.id)!)
      .slice(0, count),
  };
}

/** Wins, losses and ties of one title across the vote log. */
export function recordOf(votes: Vote[], id: string): { wins: number; losses: number; ties: number } {
  const r = { wins: 0, losses: 0, ties: 0 };
  for (const v of votes) {
    if (v.a !== id && v.b !== id) continue;
    if (v.outcome === 'tie') r.ties++;
    else if ((v.outcome === 'a' ? v.a : v.b) === id) r.wins++;
    else r.losses++;
  }
  return r;
}

// ----------------------------------------------------------------- history

export interface HistoryPoint {
  at: number;
  /** Rank of each tracked title at that moment, among titles that had played a duel. Absent if it hadn't played yet. */
  ranks: Map<string, number>;
}

const byTime = (votes: Vote[]) => [...votes].sort((a, b) => a.at - b.at || (a.id ?? 0) - (b.id ?? 0));

/** Order of titles that have played at least one duel, best first, optionally only those in `within`. */
function playedOrder(f: Fit, within?: Set<string>): string[] {
  return f.order.filter((id) => (f.duels.get(id) ?? 0) > 0 && (!within || within.has(id)));
}

/**
 * Replays the vote log: refits the ranking as it stood at the end of selected
 * days and records where the tracked titles were. At most `points` checkpoints,
 * evenly spread over the days you voted, always ending with the latest.
 */
export function history(votes: Vote[], seenIds: string[], track: string[], points = 12, within?: Set<string>): HistoryPoint[] {
  const sorted = byTime(votes);
  if (sorted.length === 0) return [];
  const dayEnds: number[] = [];
  sorted.forEach((v, i) => {
    if (i === sorted.length - 1 || dayKey(sorted[i + 1].at) !== dayKey(v.at)) dayEnds.push(i);
  });
  let picks = dayEnds;
  if (dayEnds.length > points) {
    picks = Array.from({ length: points }, (_, k) => dayEnds[Math.round((k * (dayEnds.length - 1)) / (points - 1))]);
    picks = [...new Set(picks)];
  }
  let warm: Map<string, number> | undefined;
  return picks.map((end) => {
    const f = fitModel({ ids: seenIds, anchors: {}, votes: sorted.slice(0, end + 1), warm });
    warm = f.theta;
    const order = playedOrder(f, within);
    const ranks = new Map<string, number>();
    for (const id of track) {
      const r = order.indexOf(id);
      if (r >= 0) ranks.set(id, r + 1);
    }
    return { at: sorted[end].at, ranks };
  });
}

export interface Move {
  id: string;
  from: number;
  to: number;
}

/** Who climbed and who fell since `since`, comparing the ranking then with now. Null if too little was played by then. */
export function movers(votes: Vote[], seenIds: string[], since: number, count = 3, minDuelsBefore = 30, within?: Set<string>) {
  const sorted = byTime(votes);
  const before = sorted.filter((v) => v.at <= since);
  const after = sorted.filter((v) => v.at > since);
  if (before.length < minDuelsBefore || after.length === 0) return null;
  const then = playedOrder(fitModel({ ids: seenIds, anchors: {}, votes: before }), within);
  const now = playedOrder(fitModel({ ids: seenIds, anchors: {}, votes: sorted }), within);
  const thenRank = new Map(then.map((id, i) => [id, i + 1]));
  const moves: Move[] = [];
  now.forEach((id, i) => {
    const from = thenRank.get(id);
    if (from !== undefined && from !== i + 1) moves.push({ id, from, to: i + 1 });
  });
  const newlyPlayed = now.filter((id) => !thenRank.has(id)).length;
  return {
    climbers: moves.filter((m) => m.from > m.to).sort((a, b) => b.from - b.to - (a.from - a.to)).slice(0, count),
    fallers: moves.filter((m) => m.from < m.to).sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, count),
    newlyPlayed,
    duelsSince: after.length,
  };
}

export interface TopSpell {
  /** A time on the first day of the current run at #1. */
  since: number;
  /** Whole calendar days from that day to today; 0 means it took the top spot today. */
  days: number;
  /** It has been #1 since the first day you played. */
  fromStart: boolean;
  /** The check stopped looking back before the run began, so the true run is at least this long. */
  atLeast: boolean;
}

const calendarDay = (at: number) => {
  const d = new Date(at);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

/**
 * How long `id` has been #1: refits the ranking as it stood at the end of each day, newest first, until
 * someone else was on top. Looks back at most `maxDays` days played, since each day costs a fit.
 * Null when `id` isn't #1 in this replay (the replay ignores anchors, as `history` does).
 */
export function topSpell(votes: Vote[], seenIds: string[], id: string, now: number, within?: Set<string>, maxDays = 40): TopSpell | null {
  const sorted = byTime(votes);
  if (sorted.length === 0) return null;
  const dayEnds: number[] = [];
  sorted.forEach((v, i) => {
    if (i === sorted.length - 1 || dayKey(sorted[i + 1].at) !== dayKey(v.at)) dayEnds.push(i);
  });
  let held = dayEnds.length;
  let warm: Map<string, number> | undefined;
  let stopped = false;
  for (let d = dayEnds.length - 1, looked = 0; d >= 0; d--, looked++) {
    if (looked >= maxDays) {
      stopped = true;
      break;
    }
    const f = fitModel({ ids: seenIds, anchors: {}, votes: sorted.slice(0, dayEnds[d] + 1), warm });
    warm = f.theta;
    if (playedOrder(f, within)[0] !== id) break;
    held = d;
  }
  if (held === dayEnds.length) return null;
  const since = sorted[dayEnds[held]].at;
  return { since, days: Math.max(0, calendarDay(now) - calendarDay(since)), fromStart: held === 0, atLeast: stopped && held > 0 };
}

// ----------------------------------------------------------------- settled

export interface Band {
  label: string;
  total: number;
  settled: number;
}

export function settledBands(f: Fit): Band[] {
  const edges: [string, number, number][] = [
    ['Top 10', 1, 10],
    ['11 to 30', 11, 30],
    ['31 to 100', 31, 100],
    ['101 and below', 101, Infinity],
  ];
  return edges
    .map(([label, lo, hi]) => {
      const ids = f.order.slice(lo - 1, hi === Infinity ? undefined : hi);
      return { label, total: ids.length, settled: ids.filter((id) => isSettled(f, id)).length };
    })
    .filter((b) => b.total > 0);
}

import type { Item, Mark, Vote } from '../types';
import type { CrowdView, HotTake } from './stats';

/**
 * Findings for the Stats cards: each one a sentence backed by a number.
 * Everything here is pure. `ranked` is always best first, in the current view,
 * with each title's years, studio and score taken from the side you know.
 */

// ------------------------------------------------------------------- type

/** How many of your best titles each count is taken from. */
export const TYPE_TOP = 10;
export const GENRE_TOP = 20;
/** A type qualifies once its strength reaches this: about a 1 in 100 chance for a typical list. */
export const QUALIFY = 2;
export const OLD_BEFORE = 2005;
export const NEW_FROM = 2018;

/** Names for genre types. Genres left out (Ecchi, Hentai) never name a type. */
export const GENRE_TYPES: Record<string, string> = {
  Action: 'The Adrenaline Seeker',
  Adventure: 'The Wanderer',
  Comedy: 'The Class Clown',
  Drama: 'The Heartstring',
  Fantasy: 'The Dreamer',
  Horror: 'The Night Owl',
  'Mahou Shoujo': 'The Magical Girl',
  Mecha: 'The Pilot',
  Music: 'The Front Row',
  Mystery: 'The Detective',
  Psychological: 'The Overthinker',
  Romance: 'The Romantic',
  'Sci-Fi': 'The Futurist',
  'Slice of Life': 'The Comfort Seeker',
  Sports: 'The Team Player',
  Supernatural: 'The Medium',
  Thriller: 'The Thrill Seeker',
};

export interface Archetype {
  id: string;
  name: string;
  /** The finding, e.g. "7 of your top 10 started before 2005." */
  sentence: string;
  /** What a typical list would show, e.g. "A typical top 10 has about 1." */
  typical?: string;
  /** How unusual the finding is: -log10 of the chance a typical list does at least this. */
  strength: number;
  /** The titles behind the finding, best first. */
  ids: string[];
}

export interface Traits {
  mainstream: { count: number; of: number };
  agreement: number | null;
  era: { median: number | null; old: number; recent: number; of: number };
  genre: { name: string; count: number; typical: number; of: number } | null;
  studio: { name: string; count: number; of: number } | null;
  tieShare: number;
}

export interface TypeFinding {
  type: Archetype;
  /** Every type that was measured, strongest first (the chosen one included). */
  candidates: Archetype[];
  traits: Traits;
}

export interface TypeInput {
  ranked: Item[];
  /** Every title in the current view: the base for "typical" and for popularity positions. */
  catalogue: Item[];
  /** Spearman agreement with AniList's scores, or null when too few titles have one. */
  agreement: number | null;
  tieShare: number;
  duels: number;
  /** "anime", "manga" or "titles", for sentences. */
  noun: string;
}

/** Chance of at least `k` hits in `n` tries at rate `p`. */
export function binomialTail(n: number, p: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let logC = 0; // log of n choose i, built up as i grows
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    if (i >= k) sum += Math.exp(logC + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, sum);
}

/** -log10 of the tail chance, corrected for having tried `tests` different groups. */
export function surprise(n: number, p: number, k: number, tests = 1): number {
  const chance = Math.min(1, binomialTail(n, p, k) * tests);
  return chance <= 0 ? 12 : -Math.log10(chance);
}

export function typicalText(n: number, expected: number): string {
  const top = `A typical top ${n}`;
  if (expected < 0.75) return `${top} has fewer than 1.`;
  return `${top} has about ${Math.round(expected)}.`;
}

/** Popularity-weighted share of the catalogue that passes `test`: how often it turns up in a typical list. */
function baseRate(catalogue: Item[], test: (i: Item) => boolean): number {
  let all = 0;
  let hit = 0;
  for (const i of catalogue) {
    const w = Math.max(i.popularity, 1);
    all += w;
    if (test(i)) hit += w;
  }
  return all ? hit / all : 0;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Picks a named type from measured traits. Count traits (era, popularity,
 * genre, studio) are scored by how unlikely the count would be for a typical
 * list, where "typical" means titles drawn in proportion to AniList popularity.
 * Agreement and tie share have no such base, so their thresholds are set by hand
 * and placed on the same scale (the threshold itself scores QUALIFY).
 * The strongest type wins; when none reaches QUALIFY, the type is The All-Rounder.
 */
export function pickType(input: TypeInput): TypeFinding {
  const { ranked, catalogue, noun } = input;
  const top = ranked.slice(0, TYPE_TOP);
  const wide = ranked.slice(0, GENRE_TOP);
  const n = top.length;
  const nw = wide.length;
  const ids = (items: Item[]) => items.map((i) => i.id);
  const candidates: Archetype[] = [];

  // Era: two tests (old and recent).
  const isOld = (i: Item) => i.startYear !== undefined && i.startYear < OLD_BEFORE;
  const isNew = (i: Item) => i.startYear !== undefined && i.startYear >= NEW_FROM;
  const old = top.filter(isOld);
  const recent = top.filter(isNew);
  const pOld = baseRate(catalogue, isOld);
  const pNew = baseRate(catalogue, isNew);
  candidates.push({
    id: 'old',
    name: 'The Old Soul',
    sentence: `${old.length} of your top ${n} started before ${OLD_BEFORE}.`,
    typical: typicalText(n, n * pOld),
    strength: surprise(n, pOld, old.length, 2),
    ids: ids(old),
  });
  candidates.push({
    id: 'new',
    name: 'The New Wave',
    sentence: `${recent.length} of your top ${n} started in ${NEW_FROM} or later.`,
    typical: typicalText(n, n * pNew),
    strength: surprise(n, pNew, recent.length, 2),
    ids: ids(recent),
  });

  // Popularity: two tests (very popular and far from it).
  const byPop = [...catalogue].sort((a, b) => b.popularity - a.popularity);
  const top100 = new Set(byPop.slice(0, 100).map((i) => i.id));
  const top500 = new Set(byPop.slice(0, 500).map((i) => i.id));
  const popular = top.filter((i) => top100.has(i.id));
  const deep = top.filter((i) => !top500.has(i.id));
  const pPopular = baseRate(catalogue, (i) => top100.has(i.id));
  const pDeep = baseRate(catalogue, (i) => !top500.has(i.id));
  candidates.push({
    id: 'popular',
    name: 'The Crowd Pleaser',
    sentence: `${popular.length} of your top ${n} are among the 100 most popular ${noun}.`,
    typical: typicalText(n, n * pPopular),
    strength: surprise(n, pPopular, popular.length, 2),
    ids: ids(popular),
  });
  candidates.push({
    id: 'deep',
    name: 'The Crate Digger',
    sentence: `${deep.length} of your top ${n} are outside the 500 most popular ${noun}.`,
    typical: typicalText(n, n * pDeep),
    strength: surprise(n, pDeep, deep.length, 2),
    ids: ids(deep),
  });

  // Genre: one test per named genre; at least 5 titles.
  const genreNames = Object.keys(GENRE_TYPES);
  let genreTrait: Traits['genre'] = null;
  let bestGenre = -Infinity;
  for (const g of genreNames) {
    const has = (i: Item) => !!i.genres?.includes(g);
    const hits = wide.filter(has);
    const p = baseRate(catalogue, has);
    if (p === 0 || hits.length === 0) continue;
    const s = hits.length >= 5 ? surprise(nw, p, hits.length, genreNames.length) : 0;
    const lift = hits.length / Math.max(nw * p, 0.5);
    // For the trait line: the genre most over-represented, even if it names no type.
    const traitScore = s > 0 ? 10 + s : lift;
    if (traitScore > bestGenre) {
      bestGenre = traitScore;
      genreTrait = { name: g, count: hits.length, typical: nw * p, of: nw };
    }
    if (hits.length >= 5)
      candidates.push({
        id: `genre:${g}`,
        name: GENRE_TYPES[g],
        sentence: `${hits.length} of your top ${nw} are ${g} titles.`,
        typical: typicalText(nw, nw * p),
        strength: s,
        ids: ids(hits),
      });
  }

  // Studio: one test per studio in your top 20; at least 3 titles.
  const studios = new Map<string, Item[]>();
  for (const i of wide) if (i.studio) studios.set(i.studio, [...(studios.get(i.studio) ?? []), i]);
  let studioTrait: Traits['studio'] = null;
  for (const [name, hits] of studios) {
    if (!studioTrait || hits.length > studioTrait.count) studioTrait = { name, count: hits.length, of: nw };
    if (hits.length < 3) continue;
    const p = baseRate(catalogue, (i) => i.studio === name);
    candidates.push({
      id: `studio:${name}`,
      name: 'The Loyalist',
      sentence: `${hits.length} of your top ${nw} are from ${name}.`,
      typical: typicalText(nw, nw * p),
      strength: surprise(nw, p, hits.length, studios.size),
      ids: ids(hits),
    });
  }
  if (studioTrait && studioTrait.count < 2) studioTrait = null;

  // Agreement with AniList: thresholds by hand.
  const r = input.agreement;
  if (r !== null) {
    const pct = Math.round(r * 100);
    const agreeSentence = `Your order and AniList's scores agree at ${pct}%. 100% would be the same order.`;
    candidates.push({ id: 'contrarian', name: 'The Contrarian', sentence: agreeSentence, strength: QUALIFY + (0.15 - r) * 10, ids: [] });
    candidates.push({ id: 'canon', name: 'The Canon Keeper', sentence: agreeSentence, strength: QUALIFY + (r - 0.7) * 10, ids: [] });
  }

  // Tie share: by hand, and only with enough duels to mean something.
  if (input.duels >= 50) {
    const pct = Math.round(input.tieShare * 100);
    candidates.push({
      id: 'fence',
      name: 'The Fence-Sitter',
      sentence: `${pct}% of your duels were too close to call.`,
      strength: QUALIFY + (input.tieShare - 0.25) * 10,
      ids: [],
    });
  }

  candidates.sort((a, b) => b.strength - a.strength);
  const best = candidates[0];
  const type: Archetype =
    best && best.strength >= QUALIFY
      ? best
      : {
          id: 'all',
          name: 'The All-Rounder',
          sentence: `No era, genre or studio stands out in your top ${nw}.`,
          strength: 0,
          ids: [],
        };

  return {
    type,
    candidates,
    traits: {
      mainstream: { count: popular.length, of: n },
      agreement: r,
      era: { median: median(top.flatMap((i) => (i.startYear ? [i.startYear] : []))), old: old.length, recent: recent.length, of: n },
      genre: genreTrait,
      studio: studioTrait,
      tieShare: input.tieShare,
    },
  };
}

// -------------------------------------------------------------- hot takes

/** The biggest gaps between your order and AniList's, either way. */
export function hotTakes(crowd: CrowdView, count = 3): HotTake[] {
  return [...crowd.lovedMore, ...crowd.lovedLess].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.yourRank - b.yourRank).slice(0, count);
}

// --------------------------------------------------------- guilty pleasure

export interface GuiltyPleasure {
  item: Item;
  rank: number;
  score: number;
  /** Mean AniList score of your top titles that have one. */
  topMean: number;
  of: number;
}

/** Lowest AniList score in your top 20, when it sits well below the rest of them. */
export function guiltyPleasure(ranked: Item[], top = GENRE_TOP, minGap = 8): GuiltyPleasure | null {
  const scored = ranked
    .slice(0, top)
    .map((item, i) => ({ item, rank: i + 1, score: item.averageScore }))
    .filter((x): x is { item: Item; rank: number; score: number } => x.score !== undefined);
  if (scored.length < 5) return null;
  const mean = scored.reduce((a, x) => a + x.score, 0) / scored.length;
  const low = [...scored].sort((a, b) => a.score - b.score || a.rank - b.rank)[0];
  if (mean - low.score < minGap) return null;
  return { item: low.item, rank: low.rank, score: low.score, topMean: Math.round(mean), of: Math.min(top, ranked.length) };
}

// ------------------------------------------------------------ blind spots

export interface BlindSpot {
  item: Item;
  /** Position by popularity among every title in the view. */
  popularRank: number;
}

/** The most popular titles you marked Haven't seen. */
export function blindSpots(catalogue: Item[], marks: Map<string, Mark>, count = 3): BlindSpot[] {
  const byPop = [...catalogue].sort((a, b) => b.popularity - a.popularity);
  const out: BlindSpot[] = [];
  byPop.forEach((item, i) => {
    if (out.length < count && marks.get(item.id)?.status === 'unseen') out.push({ item, popularRank: i + 1 });
  });
  return out;
}

// ------------------------------------------------------------ hardest call

export interface HardestCall {
  a: string;
  b: string;
  aWins: number;
  bWins: number;
  ties: number;
  /** How many times the result changed from one meeting to the next. */
  flips: number;
  aRank: number;
  bRank: number;
}

/**
 * The pair whose result has changed most between meetings. Most pairs meet
 * twice at most, so ties are broken by meetings and then by how high the pair sits.
 * `a` is always the one ranked higher now.
 */
export function hardestCall(votes: Vote[], order: string[]): HardestCall | null {
  const rank = new Map(order.map((id, i) => [id, i + 1]));
  const seq = new Map<string, { lo: string; hi: string; results: ('lo' | 'hi' | 'tie')[] }>();
  for (const v of [...votes].sort((x, y) => x.at - y.at || (x.id ?? 0) - (y.id ?? 0))) {
    if (!rank.has(v.a) || !rank.has(v.b) || v.a === v.b) continue;
    const [lo, hi] = v.a < v.b ? [v.a, v.b] : [v.b, v.a];
    const key = `${lo}|${hi}`;
    const s = seq.get(key) ?? { lo, hi, results: [] };
    seq.set(key, s);
    const winner = v.outcome === 'tie' ? null : v.outcome === 'a' ? v.a : v.b;
    s.results.push(winner === null ? 'tie' : winner === lo ? 'lo' : 'hi');
  }
  let best: HardestCall | null = null;
  let bestKey: [number, number, number] = [0, 0, 0];
  for (const s of seq.values()) {
    const flips = s.results.filter((r, i) => i > 0 && r !== s.results[i - 1]).length;
    if (flips === 0) continue;
    const loRank = rank.get(s.lo)!;
    const hiRank = rank.get(s.hi)!;
    const key: [number, number, number] = [flips, s.results.length, -Math.max(loRank, hiRank)];
    const better = !best || key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])));
    if (!better) continue;
    const loFirst = loRank <= hiRank;
    const count = (r: 'lo' | 'hi' | 'tie') => s.results.filter((x) => x === r).length;
    best = {
      a: loFirst ? s.lo : s.hi,
      b: loFirst ? s.hi : s.lo,
      aWins: count(loFirst ? 'lo' : 'hi'),
      bWins: count(loFirst ? 'hi' : 'lo'),
      ties: count('tie'),
      flips,
      aRank: Math.min(loRank, hiRank),
      bRank: Math.max(loRank, hiRank),
    };
    bestKey = key;
  }
  return best;
}

// ------------------------------------------------------- era and studio

export interface Lean {
  name: string;
  /** Titles in your top N from this group, best first. */
  ids: string[];
  of: number;
  /** Share of your whole ranked list in this group, 0 to 1. */
  listShare: number;
}

/** How many more titles than your list's own share would give, before a group counts as a lean. */
export const MIN_EXCESS = 1.5;

/** The group most over-represented in your top N compared with your whole list. */
function lean(ranked: Item[], key: (i: Item) => string | undefined, minCount: number, top: number): Lean | null {
  const head = ranked.slice(0, top);
  const total = new Map<string, number>();
  for (const i of ranked) {
    const k = key(i);
    if (k) total.set(k, (total.get(k) ?? 0) + 1);
  }
  const groups = new Map<string, Item[]>();
  for (const i of head) {
    const k = key(i);
    if (k) groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  let best: { name: string; items: Item[]; excess: number } | null = null;
  for (const [name, items] of groups) {
    if (items.length < minCount) continue;
    const excess = items.length - (head.length * (total.get(name) ?? 0)) / ranked.length;
    if (!best || excess > best.excess || (excess === best.excess && items.length > best.items.length)) best = { name, items, excess };
  }
  // A group that only holds its usual share of your top titles is no lean.
  if (!best || best.excess < MIN_EXCESS) return null;
  return { name: best.name, ids: best.items.map((i) => i.id), of: head.length, listShare: (total.get(best.name) ?? 0) / ranked.length };
}

/** Decade most over-represented in your top 20 (at least 3 titles). */
export const eraLean = (ranked: Item[], top = GENRE_TOP) =>
  lean(ranked, (i) => (i.startYear ? `${Math.floor(i.startYear / 10) * 10}s` : undefined), 3, top);

/** Studio most over-represented in your top 20 (at least 2 titles). */
export const studioLean = (ranked: Item[], top = GENRE_TOP) => lean(ranked, (i) => i.studio, 2, top);

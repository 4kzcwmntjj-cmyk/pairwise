import { describe, expect, it } from 'vitest';
import type { Item, Mark, Vote } from '../types';
import { binomialTail, blindSpots, eraLean, guiltyPleasure, hardestCall, hotTakes, pickType, studioLean, surprise, themeLeans, themeTags, GUILTY_MIN_RANKED, QUALIFY } from './findings';
import { crowdView } from './stats';

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  category: 'anime',
  source: 'anilist',
  title: id,
  entryIds: [1],
  formats: ['TV'],
  popularity: 1000,
  ...extra,
});
const vote = (a: string, b: string, outcome: Vote['outcome'], at: number): Vote => ({ a, b, outcome, mode: 'refine', at });

/** A catalogue of 600 titles: years spread 1990–2025, popularity falling with position. */
const catalogue: Item[] = Array.from({ length: 600 }, (_, i) =>
  item(`c${i}`, { startYear: 1990 + (i % 36), popularity: 100_000 - i * 150, genres: i % 5 === 0 ? ['Romance'] : ['Action'], studio: `S${i % 30}` }),
);
/** `n` titles spread evenly over `list`, so popularity and years don't cluster. */
const spread = (list: Item[], n: number) => Array.from({ length: n }, (_, k) => list[Math.floor((k * list.length) / n) + 1]);
/** `n` titles stepping through the catalogue 61 at a time, so years, studios and genres all vary. */
const neutral = (n: number, except: (i: Item) => boolean = () => false) => {
  const out: Item[] = [];
  for (let k = 0; out.length < n; k++) {
    const i = catalogue[(k * 61 + 7) % catalogue.length];
    if (!except(i) && !out.includes(i)) out.push(i);
  }
  return out;
};
const base = { catalogue, agreement: 0.4, tieShare: 0.08, duels: 300, noun: 'anime' };

describe('binomialTail', () => {
  it('matches simple cases', () => {
    expect(binomialTail(10, 0.5, 0)).toBe(1);
    expect(binomialTail(1, 0.3, 1)).toBeCloseTo(0.3);
    expect(binomialTail(2, 0.5, 2)).toBeCloseTo(0.25);
    expect(binomialTail(10, 0.5, 11)).toBe(0);
  });
  it('is stronger for rarer counts and corrected for many tests', () => {
    expect(surprise(10, 0.15, 7)).toBeGreaterThan(surprise(10, 0.15, 5));
    expect(surprise(10, 0.15, 7, 10)).toBeCloseTo(surprise(10, 0.15, 7) - 1);
  });
});

describe('pickType', () => {
  it('names an old soul when most of the top 10 is old', () => {
    const old = (i: Item) => i.startYear! < 1995;
    const ranked = [...spread(catalogue.filter(old), 9), ...neutral(31, old)];
    const t = pickType({ ...base, ranked });
    expect(t.type.name).toBe('The Old Soul');
    expect(t.type.sentence).toMatch(/^(9|10) of your top 10 started before 2005\.$/);
    expect(t.type.typical).toMatch(/^A typical top 10 has about \d+\.$/);
    expect(t.traits.era.old).toBe(t.type.ids.length);
  });

  it('names a genre type when a genre crowds the top 20', () => {
    const isRomance = (i: Item) => i.genres![0] === 'Romance';
    const ranked = [...spread(catalogue.filter(isRomance), 14), ...neutral(26, isRomance)];
    const t = pickType({ ...base, ranked });
    expect(t.type.name).toBe('The Romantic');
    expect(t.type.sentence).toBe('14 of your top 20 are Romance titles.');
    expect(t.traits.genre?.name).toBe('Romance');
  });

  it('names a loyalist for one studio', () => {
    const isS7 = (i: Item) => i.studio === 'S7';
    const ranked = [...spread(catalogue.filter(isS7), 7), ...neutral(33, isS7)];
    const t = pickType({ ...base, ranked });
    expect(t.type.name).toBe('The Loyalist');
    expect(t.type.sentence).toBe('7 of your top 20 are from S7.');
    expect(t.traits.studio).toEqual({ name: 'S7', count: 7, of: 20 });
  });

  it('uses agreement and ties when they are far out', () => {
    const ranked = neutral(40);
    expect(pickType({ ...base, ranked, agreement: -0.2 }).type.name).toBe('The Contrarian');
    expect(pickType({ ...base, ranked, agreement: 0.9 }).type.name).toBe('The Canon Keeper');
    expect(pickType({ ...base, ranked, tieShare: 0.4 }).type.name).toBe('The Fence-Sitter');
    // Not enough duels for the tie share to count.
    expect(pickType({ ...base, ranked, tieShare: 0.4, duels: 20 }).candidates.some((c) => c.id === 'fence')).toBe(false);
  });

  it('falls back to the all-rounder when nothing stands out', () => {
    const ranked = neutral(40);
    const t = pickType({ ...base, ranked });
    expect(t.candidates[0].strength).toBeLessThan(QUALIFY);
    expect(t.type.name).toBe('The All-Rounder');
    expect(t.traits.agreement).toBe(0.4);
    expect(t.traits.mainstream.of).toBe(10);
  });
});

describe('hot takes, guilty pleasure, blind spots', () => {
  it('takes the biggest gaps either way', () => {
    // Your order is the reverse of AniList's for the first and last titles.
    const ranked = Array.from({ length: 30 }, (_, i) => item(`t${i}`, { averageScore: 60 + i }));
    const takes = hotTakes(crowdView(ranked)!);
    expect(takes).toHaveLength(3);
    expect(Math.abs(takes[0].gap)).toBeGreaterThanOrEqual(Math.abs(takes[2].gap));
  });

  it('finds a low score in the top 20 only when it stands out', () => {
    const ranked = Array.from({ length: 45 }, (_, i) => item(`g${i}`, { averageScore: i === 6 ? 58 : 82 }));
    expect(guiltyPleasure(ranked)).toMatchObject({ rank: 7, score: 58, of: 20 });
    const flat = Array.from({ length: 45 }, (_, i) => item(`f${i}`, { averageScore: 80 - (i % 3) }));
    expect(guiltyPleasure(flat)).toBeNull();
  });

  it('needs 40 ranked titles, so the top 20 is at most half the list', () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => item(`s${i}`, { averageScore: i === 6 ? 58 : 82 }));
    expect(GUILTY_MIN_RANKED).toBe(40);
    expect(guiltyPleasure(list(39))).toBeNull();
    expect(guiltyPleasure(list(20))).toBeNull();
    expect(guiltyPleasure(list(40))).not.toBeNull();
  });

  it('passes over a title another card already leads with', () => {
    const ranked = Array.from({ length: 45 }, (_, i) => item(`k${i}`, { averageScore: i === 2 ? 55 : i === 9 ? 60 : 82 }));
    expect(guiltyPleasure(ranked)?.item.id).toBe('k2');
    expect(guiltyPleasure(ranked, 20, 8, ['k2'])).toMatchObject({ rank: 10, score: 60 });
    // Nothing else stands out once the lowest is skipped.
    const one = Array.from({ length: 45 }, (_, i) => item(`o${i}`, { averageScore: i === 2 ? 55 : 82 }));
    expect(guiltyPleasure(one, 20, 8, ['o2'])).toBeNull();
  });

  it('lists the most popular titles marked Haven’t seen', () => {
    const marks = new Map<string, Mark>([
      ['c5', { itemId: 'c5', status: 'unseen', updatedAt: 0 }],
      ['c2', { itemId: 'c2', status: 'unseen', updatedAt: 0 }],
      ['c0', { itemId: 'c0', status: 'seen', updatedAt: 0 }],
    ]);
    expect(blindSpots(catalogue, marks).map((b) => [b.item.id, b.popularRank])).toEqual([
      ['c2', 3],
      ['c5', 6],
    ]);
  });
});

describe('hardestCall', () => {
  it('prefers the pair whose result changed most, then the one higher up', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const votes = [
      vote('d', 'e', 'a', 1),
      vote('d', 'e', 'b', 2),
      vote('a', 'b', 'a', 3),
      vote('b', 'a', 'a', 4),
      vote('c', 'd', 'a', 5),
      vote('c', 'd', 'a', 6),
    ];
    // a v b and d v e both changed once over two meetings; a v b sits higher.
    expect(hardestCall(votes, order)).toMatchObject({ a: 'a', b: 'b', aWins: 1, bWins: 1, ties: 0, flips: 1, aRank: 1, bRank: 2 });
    votes.push(vote('d', 'e', 'tie', 7));
    expect(hardestCall(votes, order)).toMatchObject({ a: 'd', b: 'e', aWins: 1, bWins: 1, ties: 1, flips: 2 });
  });

  it('is null when every pair kept its result', () => {
    expect(hardestCall([vote('a', 'b', 'a', 1), vote('a', 'b', 'a', 2)], ['a', 'b'])).toBeNull();
  });

  it('records what happened at each meeting, oldest first', () => {
    const h = hardestCall([vote('b', 'a', 'a', 1), vote('a', 'b', 'a', 2), vote('a', 'b', 'tie', 3)], ['a', 'b'])!;
    // The first meeting went to b, the second to a, the third was too close.
    expect(h.results).toEqual(['b', 'a', 'tie']);
  });

  it('prefers a pair that met 3 or more times over one that changed more often in two meetings', () => {
    const order = ['a', 'b', 'c', 'd'];
    const votes = [
      vote('a', 'b', 'a', 1),
      vote('a', 'b', 'b', 2),
      vote('c', 'd', 'a', 3),
      vote('c', 'd', 'a', 4),
      vote('c', 'd', 'b', 5),
    ];
    // a v b flipped once in 2 meetings and sits higher; c v d flipped once in 3 meetings.
    expect(hardestCall(votes, order)).toMatchObject({ a: 'c', b: 'd', aWins: 2, bWins: 1, results: ['c', 'c', 'd'] });
  });
});

describe('era and studio', () => {
  it('picks the decade and studio most over-represented in your top 20', () => {
    const ranked = [
      ...Array.from({ length: 8 }, (_, i) => item(`n${i}`, { startYear: 2003, studio: 'Bones' })),
      ...Array.from({ length: 30 }, (_, i) => item(`m${i}`, { startYear: 2015 + (i % 5), studio: `X${i}` })),
    ];
    // 8 of the top 20 from the 2000s, against 8 of 38 in the list: about 4 more than its share.
    expect(eraLean(ranked)).toMatchObject({ name: '2000s', of: 20 });
    expect(eraLean(ranked)!.ids).toHaveLength(8);
    const s = studioLean(ranked)!;
    expect(s.name).toBe('Bones');
    expect(s.ids).toHaveLength(8);
    expect(s.listShare).toBeCloseTo(8 / 38);
  });

  it('finds no lean when the top 20 looks like the rest of the list', () => {
    const ranked = Array.from({ length: 40 }, (_, i) => item(`e${i}`, { startYear: 2000 + (i % 20), studio: `S${i % 10}` }));
    expect(eraLean(ranked)).toBeNull();
    expect(studioLean(ranked)).toBeNull();
  });
});

describe('tags', () => {
  // Revenge on every 25th catalogue title, so about 4% of a typical list.
  const tagged = catalogue.map((i, k) => ({ ...i, tags: k % 25 === 0 ? ['Revenge', 'Male Protagonist'] : ['Male Protagonist'] }));
  const revenge = tagged.filter((i) => i.tags.includes('Revenge'));
  const plain = (n: number) => neutral(n, (i) => i.id === 'x').map((i) => tagged.find((t) => t.id === i.id)!).filter((i) => !i.tags.includes('Revenge'));

  it('names a tag type when a named tag fills the top 20', () => {
    const ranked = [...spread(revenge, 8), ...plain(30)];
    const t = pickType({ ...base, catalogue: tagged, ranked });
    expect(t.type.name).toBe('The Avenger');
    expect(t.type.sentence).toBe('8 of your top 20 are tagged Revenge.');
    expect(t.traits.tag?.name).toBe('Revenge');
  });

  it('leaves cast tags out of the theme lean', () => {
    const ranked = plain(30);
    const t = pickType({ ...base, catalogue: tagged, ranked });
    expect(t.traits.tag).toBeNull();
  });

  it('finds themes over-represented in the top 20 against the whole list', () => {
    const ranked = [...spread(revenge, 5), ...plain(35), ...spread(revenge.slice(12), 1)];
    const leans = themeLeans(ranked);
    expect(leans.map((l) => l.name)).toEqual(['Revenge']);
    expect(leans[0].ids).toHaveLength(5);
    expect(themeLeans(plain(40))).toEqual([]);
  });

  it('counts only the theme tags a title shows (its strongest 4)', () => {
    const weak = (i: Item) => ({ ...i, tags: ['A', 'Male Protagonist', 'B', 'C', 'D', 'Revenge'] });
    expect(themeTags(weak(catalogue[0]))).toEqual(['A', 'B', 'C', 'D']);
    // Revenge in 5th place among themes: shown nowhere, so it names no type, lean or theme.
    const ranked = [...spread(revenge, 8).map(weak), ...plain(30)];
    const t = pickType({ ...base, catalogue: tagged, ranked });
    expect(t.type.name).not.toBe('The Avenger');
    expect(t.traits.tag?.name).not.toBe('Revenge');
    expect(themeLeans(ranked).map((l) => l.name)).not.toContain('Revenge');
  });
});

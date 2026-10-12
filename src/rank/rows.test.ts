import { describe, expect, it } from 'vitest';
import type { Item, Mark, View } from '../types';
import type { Recommendation } from './recommend';
import { buildRows, dayNumber, hiddenGems, popularityRanks, otherForm, seededRandom, tonightOrder } from './rows';

const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  category: 'anime',
  source: 'anilist',
  title: id,
  entryIds: [Number(id.replace(/\D/g, '')) || 1],
  formats: ['TV'],
  popularity: 1,
  ...extra,
});
const mark = (id: string, extra: Partial<Mark> = {}): [string, Mark] => [id, { itemId: id, status: 'seen', updatedAt: 0, ...extra }];
const rec = (it: Item, score: number, links = score): Recommendation => ({ item: it, score, links, because: [], genres: [], tags: [] });
const never = () => false;

describe('hiddenGems', () => {
  // 400 filler titles more popular than anything below.
  const filler = Array.from({ length: 400 }, (_, k) => item(`f${k}`, { popularity: 10_000 - k }));
  const gem = item('gem', { popularity: 5, averageScore: 82 });
  const popular = item('popular', { popularity: 9_999.5, averageScore: 85 });
  const weak = item('weak', { popularity: 4, averageScore: 55 });
  const unscored = item('unscored', { popularity: 3 });
  const lowLinks = item('lowlinks', { popularity: 2, averageScore: 80 });
  const all = [...filler, gem, popular, weak, unscored, lowLinks];
  const ranks = popularityRanks(all);

  it('keeps linked, unpopular, decently scored titles with strong links', () => {
    // The two fillers and lowLinks pull the middle link score down to 3.8.
    const recs = [rec(popular, 5), rec(weak, 4.5), rec(gem, 4), rec(unscored, 3.8), rec(lowLinks, 0.2), rec(filler[0], 0.1), rec(filler[1], 0.1)];
    const picks = hiddenGems(recs, ranks, new Set());
    expect(picks.map((p) => p.item.id)).toEqual(['gem', 'unscored']);
  });

  it('skips titles already in another row and titles with no link score', () => {
    const recs = [rec(gem, 4), rec(unscored, 4), rec(weak, 0.1, 0)];
    expect(hiddenGems(recs, ranks, new Set(['gem'])).map((p) => p.item.id)).toEqual(['unscored']);
    expect(hiddenGems([rec(gem, 2, 0)], ranks, new Set())).toEqual([]);
  });
});

describe('otherForm', () => {
  const entries = [{ id: 1, format: 'MANGA', popularity: 1 }, { id: 2, format: 'TV', popularity: 1 }];
  const both = (id: string) => item(id, { formats: ['TV', 'MANGA'], entries });
  const a = both('a1');
  const b = both('b2');
  const c = both('c3');
  const d = item('d4');
  const e = item('e5', { formats: ['TV', 'MANGA'] }); // no entries to show the other cover from
  const f = both('f6');
  const g = item('g7', { formats: ['TV', 'MANGA'], entries: [{ id: 3, format: 'TV', popularity: 1 }] }); // no manga entry
  const items = [a, b, c, d, e, f, g];
  const order = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'];
  const marks = new Map([
    mark('a1', { anime: true, manga: false }), // watched, ruled out the manga
    mark('b2', { anime: true, manga: true }), // both
    mark('c3'), // plain seen: not known which
    mark('d4', { anime: true, manga: false }), // anime only, no manga to read
    mark('e5', { anime: true, manga: false }),
    mark('f6', { anime: false, manga: true }), // read, ruled out the anime
    mark('g7', { anime: true, manga: false }),
  ]);

  it('lists ranked titles known in one form and not the other, in rank order', () => {
    expect(otherForm(items, marks, order, never, 'anime').map((i) => i.id)).toEqual(['a1']);
    expect(otherForm(items, marks, order, never, 'manga').map((i) => i.id)).toEqual(['f6']);
  });

  it('leaves out hidden titles and titles outside the top third of a long list', () => {
    expect(otherForm(items, marks, order, (i) => i.id === 'a1', 'anime')).toEqual([]);
    const long = [...Array.from({ length: 40 }, (_, k) => `z${k}`), 'a1'];
    expect(otherForm(items, marks, long, never, 'anime')).toEqual([]);
  });
});

describe('buildRows', () => {
  const source = item('s1', { recs: [['t1', 9], ['t2', 8], ['t3', 7], ['t4', 6]] });
  const second = item('s2', { recs: [['t3', 9], ['t4', 8], ['t5', 7]] });
  const targets = ['t1', 't2', 't3', 't4', 't5'].map((id) => item(id));
  const items = [source, second, ...targets];
  const marks = new Map([mark('s1'), mark('s2')]);
  const base = {
    items,
    order: ['s1', 's2'],
    recs: [] as Recommendation[],
    isHidden: never,
    marks,
    allItems: items,
    allMarks: marks,
    fullOrder: ['s1', 's2'],
    view: 'both' as View,
    rankOf: new Map([['s1', 1], ['s2', 2]]),
    title: (i: Item) => i.title,
  };

  it('makes a row per top title, and a title appears in only one row', () => {
    const rows = buildRows(base);
    expect(rows.map((r) => r.heading)).toEqual(['Because you rank s1 highly']);
    expect(rows[0].picks.map((p) => p.item.id)).toEqual(['t1', 't2', 't3', 't4']);
    // t3 and t4 went to the first row; the second has only t5 left, too few to show.
    expect(rows).toHaveLength(1);
  });

  it('skips seen and hidden titles, and rows with fewer than three', () => {
    // s1 is left with t2 and t4, s2 with t4 and t5: two each.
    const seenT1 = new Map([...marks, mark('t1')]);
    const rows = buildRows({ ...base, marks: seenT1, isHidden: (i) => i.id === 't3' });
    expect(rows).toEqual([]);
  });

  describe('the manga and anime rows', () => {
    const entries = [{ id: 9, format: 'MANGA', popularity: 1 }, { id: 8, format: 'TV', popularity: 1 }];
    const m = item('m9', { formats: ['TV', 'MANGA'], entries });
    const w = item('w8', { formats: ['TV', 'MANGA'], entries });
    const allMarks = new Map([...marks, mark('m9', { anime: true, manga: false }), mark('w8', { anime: false, manga: true })]);
    const input = { ...base, allItems: [...items, m, w], allMarks, fullOrder: ['s1', 'm9', 'w8', 's2'], rankOf: new Map([['m9', 2], ['w8', 3]]) };
    const headings = (view: View) => buildRows({ ...input, view }).filter((r) => r.kind === 'manga' || r.kind === 'anime').map((r) => r.heading);

    it('shows Read the manga and Watch the anime in the Both view, with the rank as a note', () => {
      const rows = buildRows(input);
      expect(headings('both')).toEqual(['Read the manga', 'Watch the anime']);
      const manga = rows.find((r) => r.kind === 'manga')!;
      expect(manga.picks).toHaveLength(1);
      expect(manga.picks[0]).toMatchObject({ note: 'You rank it #2' });
      expect(manga.picks[0].item.id).toBe('m9');
      expect(rows.find((r) => r.kind === 'anime')!.picks[0]).toMatchObject({ note: 'You rank it #3' });
    });

    it('shows only the row about the other form in the Anime and Manga views', () => {
      expect(headings('anime')).toEqual(['Read the manga']);
      expect(headings('manga')).toEqual(['Watch the anime']);
    });
  });
});

describe('tonightOrder', () => {
  const recs = Array.from({ length: 40 }, (_, k) => rec(item(`r${k}`), 40 - k));

  it('is the same for the same seed and covers the pool once each', () => {
    const one = tonightOrder(recs, 20261012).map((r) => r.item.id);
    expect(tonightOrder(recs, 20261012).map((r) => r.item.id)).toEqual(one);
    expect(new Set(one).size).toBe(30);
    expect(one.every((id) => recs.slice(0, 30).some((r) => r.item.id === id))).toBe(true);
  });

  it('differs between days and favours higher scores', () => {
    const firsts = Array.from({ length: 200 }, (_, d) => tonightOrder(recs, 20260000 + d)[0].score);
    expect(new Set(firsts).size).toBeGreaterThan(5);
    const mean = firsts.reduce((a, b) => a + b, 0) / firsts.length;
    // Plain chance over scores 40 down to 11 would average about 25.5.
    expect(mean).toBeGreaterThan(28);
  });

  it('handles short and empty lists', () => {
    expect(tonightOrder([], 1)).toEqual([]);
    expect(tonightOrder(recs.slice(0, 2), 1)).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('seededRandom repeats and stays in [0, 1)', () => {
    const r = seededRandom(7);
    const s = seededRandom(7);
    for (let k = 0; k < 20; k++) {
      const v = r();
      expect(v).toBe(s());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('dayNumber reads the local date', () => {
    expect(dayNumber(new Date(2026, 9, 12, 23, 53))).toBe(20261012);
  });
});

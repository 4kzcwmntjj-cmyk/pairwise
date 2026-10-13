import { describe, expect, it } from 'vitest';
import type { Entry, Item } from '../types';
import { compareLists, pairAgreement, placeList } from './compare';
import { cleanName, decodeList, encodeList, entryOf, listLink, MAX_NAME, packCards, unpackCards, type SharedCard } from './listLink';

const item = (id: string, entryIds: number[], entries?: Entry[]): Pick<Item, 'id' | 'entryIds' | 'entries'> => ({ id, entryIds, entries });
const entry = (id: number, format: string, year: number): Entry => ({ id, format, year, popularity: 1000 });

describe('list links', () => {
  it('round-trips a list with name and date', () => {
    const list = { name: 'Ryan', made: '2026-10-12', entries: [16498, 101922, 1, 0, 217434, 262143] };
    const frag = encodeList(list);
    expect(frag).toContain('w=3');
    expect(decodeList(frag)).toEqual(list);
    expect(decodeList(`#${frag}`)).toEqual(list);
  });

  it('switches to four characters per title for larger ids', () => {
    const list = { entries: [5, 262144, 9_000_000] };
    const frag = encodeList(list);
    expect(frag).toContain('w=4');
    expect(decodeList(frag)?.entries).toEqual(list.entries);
  });

  it('costs three characters a title', () => {
    const entries = Array.from({ length: 300 }, (_, i) => 1000 + i * 600);
    const text = new URLSearchParams(encodeList({ entries })).get('list')!;
    expect(text.length).toBe(900);
  });

  it('rejects fragments that are not lists or are damaged', () => {
    expect(decodeList('')).toBeNull();
    expect(decodeList('#top')).toBeNull();
    expect(decodeList('v=1&w=3&list=AB')).toBeNull(); // not a whole id
    expect(decodeList('v=1&w=3&list=AB*')).toBeNull(); // not base64url
    expect(decodeList('v=3&w=3&list=ABC')).toBeNull(); // unknown version
  });

  it('keeps names short and plain, and encodes them safely', () => {
    expect(cleanName('  Ryan \n Lim ')).toBe('Ryan Lim');
    expect(cleanName('   ')).toBeUndefined();
    expect(cleanName('x'.repeat(50))?.length).toBe(MAX_NAME);
    expect(decodeList(encodeList({ name: 'Ana & Bo #1 ?', entries: [7] }))?.name).toBe('Ana & Bo #1 ?');
  });

  it('builds the link on the page address, replacing any fragment', () => {
    const link = listLink('https://example.github.io/shobu/#old', { entries: [7] });
    expect(link.startsWith('https://example.github.io/shobu/#v=1')).toBe(true);
    expect(decodeList(new URL(link).hash)?.entries).toEqual([7]);
  });

  it('picks the entry a title was named after, else its representative entry', () => {
    expect(entryOf(item('al-20', [10, 20, 30]))).toBe(20);
    expect(entryOf(item('s-30', [30, 40]))).toBe(30);
    // A manga part ranked apart is named after the anime: its own representative (a manga entry) stands for it.
    expect(entryOf(item('f-10', [50, 60], [entry(60, 'MANGA', 2001), entry(50, 'MANGA', 1999)]))).toBe(50);
    expect(entryOf(item('custom', [9]))).toBe(9);
  });
});

describe('page links (version 2)', () => {
  const cards: SharedCard[] = [
    {
      id: 'type',
      kicker: 'Your type',
      headline: 'The Overthinker',
      subhead: 'with a streak of The Thrill Seeker',
      tagline: 'A line.',
      hero: true,
      lines: ['18 of your top 20 are Psychological.', 'A typical top 20 has 3.'],
      covers: [{ entry: 9253, caption: '#1' }, { entry: 1535 }],
      facts: [{ label: 'Era', value: 'Top 10 started 2011 (median)' }],
    },
    {
      id: 'takes',
      kicker: 'Hot takes',
      headline: 'Steins;Gate',
      lines: ['You rank higher'],
      covers: [{ entry: 9253 }],
      side: true,
      rows: [{ entry: 1535, line: 'You rank lower · yours #90, AniList\'s #6' }],
      rowsLabel: 'More',
    },
  ];

  it('carries the view, the cards and a card to open at', () => {
    const frag = encodeList({ name: 'Ryan', made: '2026-10-13', entries: [9253, 1535, 5114], view: 'anime', cards, at: 'takes' });
    expect(frag).toContain('v=2');
    const back = decodeList(frag)!;
    expect(back.view).toBe('anime');
    expect(back.at).toBe('takes');
    expect(back.entries).toEqual([9253, 1535, 5114]);
    expect(back.cards).toEqual(cards);
  });

  it('keeps the list when the cards are damaged', () => {
    const frag = encodeList({ entries: [1, 2, 3], view: 'both', cards });
    const broken = frag.replace(/c=[^&]+/, 'c=AAAA');
    const back = decodeList(broken)!;
    expect(back.entries).toEqual([1, 2, 3]);
    expect(back.cards).toBeUndefined();
  });

  it('drops malformed cards and keeps the rest', () => {
    const packed = packCards(cards);
    expect(unpackCards(packed)).toHaveLength(2);
    expect(unpackCards('not base64 !!')).toBeNull();
  });

  it('ignores an unknown view and a strange card id', () => {
    const back = decodeList('v=2&vw=films&at=../x&w=3&list=AAB')!;
    expect(back.view).toBeUndefined();
    expect(back.at).toBeUndefined();
  });

  it('still writes version 1 for a plain list, and reads it', () => {
    const frag = encodeList({ entries: [1, 2, 3] });
    expect(frag).toContain('v=1');
    expect(decodeList(frag)!.entries).toEqual([1, 2, 3]);
  });
});

describe('placing their list', () => {
  const owner = new Map([
    [1, 'A'],
    [2, 'B'],
    [3, 'B'], // two of their titles inside one of yours (you joined them, or they split it)
    [4, 'C'],
  ]);

  it('maps entries to your titles, keeping their best rank and counting the ones you lack', () => {
    const { placed, missing } = placeList([3, 1, 99, 2, 4], (e) => owner.get(e));
    expect(placed).toEqual([
      { id: 'B', rank: 1 },
      { id: 'A', rank: 2 },
      { id: 'C', rank: 5 },
    ]);
    expect(missing).toBe(1);
  });
});

describe('comparing lists', () => {
  const ids = (n: number, p = 't') => Array.from({ length: n }, (_, i) => `${p}${i}`);

  it('counts pairs in the same order', () => {
    expect(pairAgreement([0, 1, 2, 3])).toEqual({ share: 1, pairs: 6 });
    expect(pairAgreement([3, 2, 1, 0]).share).toBe(0);
    expect(pairAgreement([1, 0, 2]).share).toBeCloseTo(2 / 3);
  });

  it('gives an identical list a full match and no disagreements', () => {
    const mine = ids(30);
    const c = compareLists(mine, mine.map((id, i) => ({ id, rank: i + 1 })));
    expect(c.match).toEqual({ share: 1, pairs: 435 });
    expect(c.disagree).toEqual([]);
    expect(c.bothLove?.top).toBe(10);
    expect(c.bothLove?.titles.map((s) => s.id)).toEqual(['t0', 't1', 't2', 't3', 't4']);
    expect(c.theirTop).toEqual([]);
  });

  it('finds the title placed furthest apart', () => {
    const mine = ids(20);
    // They agree except that your #1 is their last.
    const theirs = [...mine.slice(1), mine[0]].map((id, i) => ({ id, rank: i + 1 }));
    const c = compareLists(mine, theirs);
    expect(c.disagree[0]).toEqual({ id: 't0', mine: 1, theirs: 20 });
    expect(c.disagree).toHaveLength(1);
    expect(c.match!.share).toBeCloseTo(1 - 19 / 190);
  });

  it('compares only shared titles, and lists their top 10 you have not ranked', () => {
    const mine = ids(12);
    const theirs = [
      { id: 'x0', rank: 1 },
      { id: 't3', rank: 2 },
      { id: 'x1', rank: 3 },
      { id: 't1', rank: 4 },
      { id: 't2', rank: 6 },
      { id: 't0', rank: 7 },
      { id: 't5', rank: 9 },
      { id: 'x2', rank: 12 },
    ];
    const c = compareLists(mine, theirs, 14);
    expect(c.common.map((s) => s.id)).toEqual(['t0', 't1', 't2', 't3', 't5']);
    expect(c.theirs).toBe(14);
    expect(c.theirTop.map((p) => p.id)).toEqual(['x0', 'x1']);
    expect(c.match?.pairs).toBe(10);
  });

  it('needs five shared titles for a match', () => {
    const c = compareLists(ids(12), [
      { id: 't0', rank: 1 },
      { id: 't1', rank: 2 },
      { id: 'x', rank: 3 },
    ]);
    expect(c.match).toBeNull();
    expect(c.disagree).toEqual([]);
    expect(c.bothLove?.titles).toHaveLength(2);
  });

  it('widens "both love" to the top 20 or 50 when the top 10s share too little', () => {
    const mine = ids(60);
    // Their list is yours reversed in blocks of 15: little overlap at the very top.
    const theirOrder = [...mine.slice(15, 30), ...mine.slice(0, 15), ...mine.slice(30)];
    const c = compareLists(mine, theirOrder.map((id, i) => ({ id, rank: i + 1 })));
    expect(c.bothLove?.top).toBe(20);
    expect(c.bothLove?.titles.length).toBe(5);
    for (const s of c.bothLove!.titles) expect(Math.max(s.mine, s.theirs)).toBeLessThanOrEqual(20);
  });
});

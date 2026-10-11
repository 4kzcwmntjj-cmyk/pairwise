import { describe, expect, it } from 'vitest';
import type { Item, Mark } from '../types';
import { seenModel } from './seen';

const item = (id: string, popularity: number, extra: Partial<Item> = {}): Item => ({
  id,
  category: 'anime',
  source: 'anilist',
  title: id,
  entryIds: [1],
  formats: ['TV'],
  popularity,
  startYear: 2015,
  ...extra,
});
const mark = (entries: [string, 'seen' | 'unseen'][]) =>
  new Map<string, Mark>(entries.map(([itemId, status]) => [itemId, { itemId, status, updatedAt: 0 }]));

describe('seenModel', () => {
  it('starts from popularity when nothing is marked', () => {
    const m = seenModel([item('big', 500000), item('small', 2000)], new Map());
    expect(m.probability.get('big')!).toBeGreaterThan(m.probability.get('small')!);
    expect(m.fitted).toBe(false);
  });

  it('lifts a less popular title linked to ones you have seen', () => {
    const items = [
      item('seen1', 100000, { recs: [['niche', 40]] }),
      item('seen2', 100000, { recs: [['niche', 30]] }),
      item('niche', 20000),
      item('popular', 40000),
    ];
    const m = seenModel(items, mark([['seen1', 'seen'], ['seen2', 'seen']]));
    expect(m.probability.get('niche')!).toBeGreaterThan(m.probability.get('popular')!);
  });

  it('lowers a title linked to ones you have not seen', () => {
    const items = [item('nope', 100000, { recs: [['a', 50]] }), item('a', 50000), item('b', 50000)];
    const m = seenModel(items, mark([['nope', 'unseen']]));
    expect(m.probability.get('a')!).toBeLessThan(m.probability.get('b')!);
  });

  it('keeps the popularity weight steady when only popular titles have been sorted', () => {
    // Sort asks popular titles first, so early marks barely vary in popularity.
    const items: Item[] = [];
    const entries: [string, 'seen' | 'unseen'][] = [];
    for (let i = 0; i < 60; i++) {
      items.push(item(`hit${i}`, 300000 + i * 10));
      entries.push([`hit${i}`, i % 2 ? 'seen' : 'unseen']);
    }
    for (let i = 0; i < 400; i++) items.push(item(`tail${i}`, 500 + i * 50));
    const m = seenModel(items, mark(entries));
    expect(m.fitted).toBe(true);
    expect(m.weights[1]).toBeGreaterThan(1);
    expect(m.probability.get('tail0')!).toBeLessThan(0.1);
  });

  it('learns that links to what you have seen matter for you', () => {
    // A viewer whose seen titles are exactly the ones linked to their favourite.
    const items: Item[] = [item('fav', 50000, { recs: Array.from({ length: 12 }, (_, i) => [`linked${i}`, 30] as [string, number]) })];
    const entries: [string, 'seen' | 'unseen'][] = [['fav', 'seen']];
    for (let i = 0; i < 12; i++) {
      items.push(item(`linked${i}`, 20000));
      if (i < 10) entries.push([`linked${i}`, 'seen']);
    }
    for (let i = 0; i < 40; i++) {
      items.push(item(`other${i}`, 20000));
      if (i < 30) entries.push([`other${i}`, 'unseen']);
    }
    const m = seenModel(items, mark(entries));
    expect(m.fitted).toBe(true);
    expect(m.probability.get('linked11')!).toBeGreaterThan(m.probability.get('other39')! * 2);
  });

  it('counts the seen titles it expects are left', () => {
    const m = seenModel([item('a', 100000), item('b', 100000)], new Map());
    const sum = m.probability.get('a')! + m.probability.get('b')!;
    expect(m.expectedRemaining).toBeCloseTo(sum, 10);
  });
});

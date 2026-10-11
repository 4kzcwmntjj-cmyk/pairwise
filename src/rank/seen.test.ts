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
      item('popular', 60000),
    ];
    const m = seenModel(items, mark([['seen1', 'seen'], ['seen2', 'seen']]));
    expect(m.probability.get('niche')!).toBeGreaterThan(m.probability.get('popular')!);
  });

  it('lowers a title linked to ones you have not seen', () => {
    const items = [item('nope', 100000, { recs: [['a', 50]] }), item('a', 50000), item('b', 50000)];
    const m = seenModel(items, mark([['nope', 'unseen']]));
    expect(m.probability.get('a')!).toBeLessThan(m.probability.get('b')!);
  });

  it('learns from your marks that popularity matters less for you', () => {
    // A viewer who has seen many obscure titles and skipped popular ones.
    const items: Item[] = [];
    const entries: [string, 'seen' | 'unseen'][] = [];
    for (let i = 0; i < 40; i++) {
      items.push(item(`obscure${i}`, 1000 + i));
      entries.push([`obscure${i}`, i < 30 ? 'seen' : 'unseen']);
      items.push(item(`hit${i}`, 300000 + i));
      entries.push([`hit${i}`, i < 10 ? 'seen' : 'unseen']);
    }
    items.push(item('newObscure', 1500), item('newHit', 300500));
    const m = seenModel(items, mark(entries));
    expect(m.fitted).toBe(true);
    expect(m.probability.get('newObscure')!).toBeGreaterThan(m.probability.get('newHit')!);
  });

  it('counts the seen titles it expects are left', () => {
    const m = seenModel([item('a', 100000), item('b', 100000)], new Map());
    const sum = m.probability.get('a')! + m.probability.get('b')!;
    expect(m.expectedRemaining).toBeCloseTo(sum, 10);
  });
});

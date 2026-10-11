import { describe, expect, it } from 'vitest';
import type { Entry, Item, Mark, Vote } from '../types';
import { summarise } from './group';
import { applyGroupOps, resolveMarks, resolveVotes, splitId, type GroupOp } from './overrides';

const entry = (id: number, title: string, format = 'TV', year = 2010, popularity = 1000): Entry => ({
  id,
  format,
  year,
  titleEnglish: title,
  popularity,
  cover: `c${id}`,
  genres: [title.startsWith('Fate') ? 'Action' : 'Drama'],
});
const item = (id: string, entries: Entry[], recs?: [string, number][]): Item => ({
  ...summarise(entries),
  id,
  ...(recs ? { recs } : {}),
});

// Fate/stay night (TV 2006, UBW 2014) with Fate/Zero (2011) wrongly inside it.
const fate = item('al-1', [entry(1, 'Fate/stay night', 'TV', 2006, 500), entry(2, 'Fate/Zero', 'TV', 2011, 900), entry(3, 'Fate/Zero 2', 'TV', 2012, 800), entry(4, 'Fate UBW', 'TV', 2014, 700)], [['al-9', 50]]);
const other = item('al-9', [entry(9, 'Steins;Gate')], [['al-1', 40], ['al-20', 10]]);
const extra = item('al-20', [entry(20, 'Steins;Gate 0')]);
const base = [fate, other, extra];

describe('applyGroupOps', () => {
  it('returns the catalogue untouched with no changes', () => {
    const g = applyGroupOps(base, []);
    expect(g.items).toBe(base);
    expect(g.resolve('al-1')).toBe('al-1');
  });

  it('splits entries into a new title and leaves the rest with the original id', () => {
    const ops: GroupOp[] = [{ kind: 'split', entryIds: [2, 3], id: 's-2', at: 1 }];
    const g = applyGroupOps(base, ops);
    const zero = g.items.find((i) => i.id === 's-2')!;
    const sn = g.items.find((i) => i.id === 'al-1')!;
    expect(zero.entryIds).toEqual([2, 3]);
    expect(zero.title).toBe('Fate/Zero');
    expect(zero.startYear).toBe(2011);
    expect(sn.entryIds).toEqual([1, 4]);
    expect(sn.title).toBe('Fate/stay night');
    expect(sn.endYear).toBe(2014);
    // The remainder keeps the franchise's recommendation links; the split-off part starts without any.
    expect(sn.recs).toEqual([['al-9', 50]]);
    expect(zero.recs).toBeUndefined();
  });

  it('joins two titles, keeps the first id and points the other id at it', () => {
    const g = applyGroupOps(base, [{ kind: 'join', keep: 9, other: 20, at: 1 }]);
    expect(g.items.map((i) => i.id).sort()).toEqual(['al-1', 'al-9']);
    const sg = g.items.find((i) => i.id === 'al-9')!;
    expect(sg.entryIds).toEqual([9, 20]);
    expect(sg.title).toBe('Steins;Gate');
    expect(g.resolve('al-20')).toBe('al-9');
    // A link to the absorbed title becomes a link to itself and is dropped.
    expect(sg.recs).toEqual([['al-1', 40]]);
  });

  it('undoes a join by splitting the same entries back out under the old id', () => {
    const ops: GroupOp[] = [
      { kind: 'join', keep: 9, other: 20, at: 1 },
      { kind: 'split', entryIds: [20], id: 'al-20', at: 2 },
    ];
    const g = applyGroupOps(base, ops);
    expect(g.resolve('al-20')).toBe('al-20');
    expect(g.items.find((i) => i.id === 'al-9')).toEqual(other);
  });

  it('retires a title whose last entry is split away', () => {
    const g = applyGroupOps(base, [{ kind: 'split', entryIds: [20], id: 's-20', at: 1 }]);
    expect(g.resolve('al-20')).toBe('s-20');
    expect(g.items.some((i) => i.id === 'al-20')).toBe(false);
  });

  it('ignores operations whose entries are not in the catalogue', () => {
    const g = applyGroupOps(base, [{ kind: 'join', keep: 9, other: 777, at: 1 }]);
    expect(g.items.map((i) => i.id).sort()).toEqual(['al-1', 'al-20', 'al-9']);
  });

  it('still finds its entries after the catalogue regroups', () => {
    // A rebuild joins Steins;Gate 0 into Steins;Gate under the old id; a later split still applies.
    const rebuilt = [fate, item('al-9', [entry(9, 'Steins;Gate'), entry(20, 'Steins;Gate 0')])];
    const g = applyGroupOps(rebuilt, [{ kind: 'split', entryIds: [20], id: 's-20', at: 1 }]);
    expect(g.items.find((i) => i.id === 's-20')!.entryIds).toEqual([20]);
  });

  it('joins titles from an older catalogue that has no entry details', () => {
    const strip = ({ entries: _e, ...rest }: Item): Item => rest;
    const g = applyGroupOps([strip(other), strip(extra)], [{ kind: 'join', keep: 9, other: 20, at: 1 }]);
    const sg = g.items[0];
    expect(sg.title).toBe('Steins;Gate');
    expect(sg.entryIds).toEqual([9, 20]);
  });
});

describe('splitting the manga out', () => {
  it('names the manga title so the two can be told apart', () => {
    const dn = item('al-50', [entry(50, 'Death Note', 'TV', 2006), { ...entry(51, 'Death Note', 'MANGA', 2003), genres: [] }]);
    const g = applyGroupOps([dn], [{ kind: 'split', entryIds: [51], id: 's-51', at: 1 }]);
    expect(g.items.find((i) => i.id === 's-51')!.title).toBe('Death Note (manga)');
    expect(g.items.find((i) => i.id === 'al-50')!.title).toBe('Death Note');
  });
});

describe('resolveVotes and resolveMarks', () => {
  const resolve = (id: string) => (id === 'b' ? 'a' : id);
  it('moves votes to the surviving title and sets aside duels between the joined pair', () => {
    const votes: Vote[] = [
      { a: 'a', b: 'b', outcome: 'a', mode: 'refine', at: 1 },
      { a: 'b', b: 'c', outcome: 'a', mode: 'refine', at: 2 },
    ];
    expect(resolveVotes(votes, resolve)).toEqual([{ a: 'a', b: 'c', outcome: 'a', mode: 'refine', at: 2 }]);
  });

  it('prefers a mark made on the title itself', () => {
    const marks: Mark[] = [
      { itemId: 'b', status: 'seen', updatedAt: 1 },
      { itemId: 'a', status: 'unseen', updatedAt: 5 },
    ];
    expect(resolveMarks(marks, resolve).get('a')).toEqual({ itemId: 'a', status: 'unseen', updatedAt: 5 });
  });

  it('lets seen win among marks left on joined titles', () => {
    const r = (id: string) => (id === 'b' || id === 'c' ? 'a' : id);
    const marks: Mark[] = [
      { itemId: 'c', status: 'unseen', updatedAt: 5 },
      { itemId: 'b', status: 'seen', updatedAt: 1 },
    ];
    expect(resolveMarks(marks, r).get('a')).toEqual({ itemId: 'a', status: 'seen', updatedAt: 1 });
  });
});

describe('splitId', () => {
  it('avoids ids already in use', () => {
    expect(splitId([5, 3], () => false)).toBe('s-3');
    expect(splitId([3], (id) => id === 's-3')).toBe('s-3-2');
  });
});

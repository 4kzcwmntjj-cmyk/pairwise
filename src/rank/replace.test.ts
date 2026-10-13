import { describe, expect, it } from 'vitest';
import { fit } from './solver';
import { countedVotes, PLACE_MAX, placementPair, placementStatus, setAsideCount, type Placement } from './replace';
import { pairKey } from './pairs';
import type { Vote } from '../types';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const v = (a: string, b: string, outcome: Vote['outcome'], at: number, mode: Vote['mode'] = 'refine'): Vote => ({ a, b, outcome, at, mode });

/** A settled list t0 (best) … t{n-1}: ten duels a title against titles up to 30 places away, each won by the better one. */
function settledList(n: number, seed = 1) {
  const rnd = seeded(seed);
  const ids = Array.from({ length: n }, (_, i) => `t${i}`);
  const votes: Vote[] = [];
  let at = 1;
  for (let round = 0; round < 10; round++) {
    for (let i = 0; i < n - 1; i++) {
      const j = Math.min(n - 1, i + 1 + Math.floor(rnd() * 30));
      votes.push(v(ids[i], ids[j], 'a', at++));
    }
  }
  return { ids, votes, at };
}

describe('countedVotes', () => {
  it('sets aside a re-placed title’s duels from before its cut-off, for both titles in them', () => {
    const votes = [v('x', 'y', 'a', 10), v('y', 'z', 'a', 15), v('x', 'z', 'b', 30)];
    const kept = countedVotes(votes, { x: 20 });
    expect(kept).toEqual([votes[1], votes[2]]);
    expect(setAsideCount(votes, { x: 20 }, 'x')).toBe(1);
    expect(setAsideCount(votes, { x: 20 }, 'y')).toBe(0);
  });

  it('keeps every duel when nothing has been re-placed', () => {
    const votes = [v('x', 'y', 'a', 10)];
    expect(countedVotes(votes, {})).toBe(votes);
  });
});

describe('placement round', () => {
  it('finds a title’s place by halving the open range, and the ranking puts it there', () => {
    const errors: number[] = [];
    for (let truth = 0; truth <= 120; truth += 5) {
      const { ids, votes, at } = settledList(120);
      const all = [...votes];
      const start = fit({ ids: [...ids, 'X'], anchors: {}, votes });
      const p: Placement = { id: 'X', since: at, others: start.order.filter((id) => id !== 'X') };
      // X belongs just above the title at index `truth` of the starting order: it beats that one and everything
      // below, and loses to everything above.
      const beats = (other: string) => p.others.indexOf(other) >= truth;
      let clock = at;
      let asked = 0;
      for (;;) {
        const f = fit({ ids: [...ids, 'X'], anchors: {}, votes: all });
        const status = placementStatus(p, f.order, all);
        if (status.done) break;
        const pair = placementPair(p, f, status);
        expect(pair).not.toBeNull();
        expect(pair!.b).toBe('X');
        expect(status.met.has(pair!.a)).toBe(false);
        all.push(v(pair!.a, 'X', beats(pair!.a) ? 'b' : 'a', clock++, 'place'));
        asked++;
      }
      // log2 of 121 spots is 7, plus up to a few to even out the record.
      expect(asked).toBeLessThanOrEqual(11);
      const f = fit({ ids: [...ids, 'X'], anchors: {}, votes: all });
      errors.push(Math.abs(f.order.indexOf('X') - truth));
    }
    errors.sort((x, y) => x - y);
    expect(errors[errors.length >> 1]).toBeLessThanOrEqual(1);
    expect(errors[errors.length - 1]).toBeLessThanOrEqual(8);
  });

  it('says how many duels the round takes', () => {
    const { ids, votes, at } = settledList(120);
    const f = fit({ ids: [...ids, 'X'], anchors: {}, votes });
    const s = placementStatus({ id: 'X', since: at, others: f.order.filter((id) => id !== 'X') }, f.order, votes);
    expect(s).toMatchObject({ asked: 0, total: 9, done: false, lo: 0, hi: 120 });
  });

  it('ends at a tie, and steps back when a duel is undone', () => {
    const order = ['a', 'b', 'c', 'd', 'X'];
    const p: Placement = { id: 'X', since: 100, others: order.filter((id) => id !== 'X') };
    const one = [v('b', 'X', 'a', 101, 'place')];
    expect(placementStatus(p, order, one)).toMatchObject({ asked: 1, done: false, lo: 2, hi: 4 });
    expect(placementStatus(p, order, [...one, v('c', 'X', 'tie', 102, 'place')]).done).toBe(true);
    expect(placementStatus(p, order, []).asked).toBe(0);
  });

  it('evens out a lopsided record against the nearest titles on the short side', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'X'];
    const others = order.slice(0, -1);
    const p: Placement = { id: 'X', since: 100, others };
    // Lost to a, b, c and d, beat e: the range is closed at 4 with a 1–4 record, so two more wins are wanted below.
    const votes = [
      v('a', 'X', 'a', 101, 'place'),
      v('b', 'X', 'a', 102, 'place'),
      v('c', 'X', 'a', 103, 'place'),
      v('d', 'X', 'a', 104, 'place'),
      v('e', 'X', 'b', 105, 'place'),
    ];
    const s = placementStatus(p, order, votes);
    expect(s).toMatchObject({ done: false, lo: 4, hi: 4, even: 2, total: 7 });
    const f = fit({ ids: order, anchors: {}, votes });
    expect(placementPair(p, f, s)!.a).toBe('f');
    const after = [...votes, v('f', 'X', 'b', 106, 'place'), v('g', 'X', 'b', 107, 'place')];
    expect(placementStatus(p, order, after).done).toBe(true);
  });

  it('ignores duels from before the round and ordinary duels', () => {
    const order = ['a', 'b', 'c', 'X'];
    const p: Placement = { id: 'X', since: 100, others: order.filter((id) => id !== 'X') };
    const s = placementStatus(p, order, [v('a', 'X', 'b', 50, 'place'), v('a', 'X', 'b', 120, 'refine')]);
    expect(s.asked).toBe(0);
  });

  it('stops at PLACE_MAX duels', () => {
    const order = Array.from({ length: 5000 }, (_, i) => `t${i}`).concat('X');
    const p: Placement = { id: 'X', since: 0, others: order.slice(0, -1) };
    // Losing only to the titles at the very top narrows the range one place at a time; the cap ends it.
    const votes = Array.from({ length: PLACE_MAX }, (_, i) => v(`t${i}`, "X", "a", i + 1, "place"));
    expect(placementStatus(p, order, votes).done).toBe(true);
  });

  it('prefers a settled opponent near the middle, and skips pairs you skipped', () => {
    const { ids, votes, at } = settledList(40);
    // t20 has hardly played: it shouldn't be chosen over its settled neighbours.
    const thin = votes.filter((x) => x.a !== 't20' && x.b !== 't20');
    const f = fit({ ids: [...ids, 'X'], anchors: {}, votes: thin });
    const p: Placement = { id: 'X', since: at, others: f.order.filter((id) => id !== 'X') };
    const status = placementStatus(p, f.order, thin);
    const first = placementPair(p, f, status)!;
    expect(first.a).not.toBe('t20');
    expect(Math.abs(p.others.indexOf(first.a) - 20)).toBeLessThanOrEqual(3);
    const again = placementPair(p, f, status, new Set([pairKey(first.a, 'X')]))!;
    expect(again.a).not.toBe(first.a);
  });
});

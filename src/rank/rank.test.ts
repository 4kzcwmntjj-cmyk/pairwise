import { describe, expect, it } from 'vitest';
import { fit, type FitVote } from './solver';
import { nextPair } from './pairs';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const repeat = (n: number, v: FitVote) => Array.from({ length: n }, () => v);

describe('fit', () => {
  it('returns the anchors when there are no votes', () => {
    const f = fit({ ids: ['x', 'y', 'z'], anchors: { x: 2, y: 0, z: -1 }, votes: [] });
    expect(f.theta.get('x')).toBeCloseTo(2, 6);
    expect(f.theta.get('y')).toBeCloseTo(0, 6);
    expect(f.theta.get('z')).toBeCloseTo(-1, 6);
    expect(f.order).toEqual(['x', 'y', 'z']);
  });

  it('keeps an undefeated title finite', () => {
    const f = fit({ ids: ['a', 'b'], anchors: {}, votes: repeat(50, { a: 'a', b: 'b', outcome: 'a' }) });
    const t = f.theta.get('a')!;
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(f.theta.get('b')!);
  });

  it('gives tied titles equal strength', () => {
    const f = fit({ ids: ['a', 'b'], anchors: {}, votes: repeat(10, { a: 'a', b: 'b', outcome: 'tie' }) });
    expect(f.theta.get('a')).toBeCloseTo(f.theta.get('b')!, 8);
  });

  it('orders a transitive chain', () => {
    const votes: FitVote[] = [
      ...repeat(3, { a: 'a', b: 'b', outcome: 'a' }),
      ...repeat(3, { a: 'b', b: 'c', outcome: 'a' }),
      ...repeat(3, { a: 'c', b: 'd', outcome: 'a' }),
    ];
    const f = fit({ ids: ['d', 'c', 'b', 'a'], anchors: {}, votes });
    expect(f.order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lets duels override the tier a title started in', () => {
    const votes = repeat(12, { a: 'low', b: 'high', outcome: 'a' } as FitVote);
    const f = fit({ ids: ['low', 'high'], anchors: { low: -1, high: 1 }, votes });
    expect(f.order[0]).toBe('low');
  });

  it('handles titles that were never compared with each other', () => {
    const votes: FitVote[] = [
      { a: 'a', b: 'b', outcome: 'a' },
      { a: 'c', b: 'd', outcome: 'b' },
    ];
    const f = fit({ ids: ['a', 'b', 'c', 'd'], anchors: {}, votes });
    for (const id of ['a', 'b', 'c', 'd']) expect(Number.isFinite(f.theta.get(id)!)).toBe(true);
    expect(f.theta.get('a')).toBeGreaterThan(f.theta.get('b')!);
    expect(f.theta.get('d')).toBeGreaterThan(f.theta.get('c')!);
  });

  it('shrinks the standard error as duels accumulate', () => {
    const few = fit({ ids: ['a', 'b'], anchors: {}, votes: repeat(2, { a: 'a', b: 'b', outcome: 'a' }) });
    const many = fit({
      ids: ['a', 'b'],
      anchors: {},
      votes: [...repeat(20, { a: 'a', b: 'b', outcome: 'a' }), ...repeat(20, { a: 'a', b: 'b', outcome: 'b' })],
    });
    expect(many.se.get('a')!).toBeLessThan(few.se.get('a')!);
  });

  it('ignores votes on ids outside the list', () => {
    const f = fit({ ids: ['a', 'b'], anchors: {}, votes: [{ a: 'a', b: 'gone', outcome: 'a' }] });
    expect(f.duels.get('a')).toBe(0);
  });
});

describe('pair selection (simulated user)', () => {
  it('finds the true top 10 of 100 titles within 700 noisy votes', () => {
    const rnd = seeded(7);
    const n = 100;
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    // True strengths: t0 best. Spread so neighbours differ by about 0.06.
    const truth = new Map(ids.map((id, i) => [id, 3 - (6 * i) / n] as const));
    // Tier-sort seed with some error: each title's tier is its true band, off by one 20% of the time.
    const anchors: Record<string, number> = {};
    for (const id of ids) {
      const band = Math.max(-2, Math.min(2, Math.round(truth.get(id)! / 1.2)));
      const slip = rnd() < 0.2 ? (rnd() < 0.5 ? -1 : 1) : 0;
      anchors[id] = Math.max(-2, Math.min(2, band + slip));
    }
    const votes: FitVote[] = [];
    let f = fit({ ids, anchors, votes });
    for (let k = 0; k < 700; k++) {
      const pair = nextPair({ fit: f, recent: votes, random: rnd })!;
      const d = truth.get(pair.a)! - truth.get(pair.b)!;
      const pA = 1 / (1 + Math.exp(-d * 1.5));
      votes.push({ a: pair.a, b: pair.b, outcome: rnd() < pA ? 'a' : 'b' });
      f = fit({ ids, anchors, votes, warm: f.theta });
    }
    const top = new Set(f.order.slice(0, 10));
    const hits = ids.slice(0, 10).filter((id) => top.has(id)).length;
    expect(hits).toBeGreaterThanOrEqual(8);
  });
});

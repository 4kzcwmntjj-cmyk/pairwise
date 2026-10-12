import { describe, expect, it } from 'vitest';
import { NEWCOMER_MIN_P, newcomerShare, nextPair } from './pairs';
import { fit, type FitVote } from './solver';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Ten titles, each already placed by a chain of decisive results.
const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);
const chain: FitVote[] = [];
for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) chain.push({ a: ids[i], b: ids[i + 1], outcome: 'a' });
const placed = fit({ ids, anchors: {}, votes: chain });
const DAY = 86_400_000;
const now = 1_000 * DAY;
const at = (v: FitVote[], when: number) => v.map((x) => ({ ...x, at: when }));

describe('newcomer duels', () => {
  it('brings in a likely newcomer against the middle of the list', () => {
    const rnd = seeded(1);
    for (let k = 0; k < 20; k++) {
      const p = nextPair({ fit: placed, recent: [], newcomers: [{ id: 'new', p: 0.9 }], newcomerShare: 1, random: rnd, now })!;
      expect(p.mode).toBe('new');
      expect(p.newcomer).toBe('new');
      const other = p.a === 'new' ? p.b : p.a;
      const rank = placed.order.indexOf(other);
      expect(rank).toBeGreaterThanOrEqual(3);
      expect(rank).toBeLessThanOrEqual(6);
    }
  });

  it('leaves long shots out', () => {
    const p = nextPair({ fit: placed, recent: [], newcomers: [{ id: 'new', p: NEWCOMER_MIN_P - 0.01 }], newcomerShare: 1, random: seeded(2), now })!;
    expect(p.newcomer).toBeUndefined();
  });

  it('finishes placing a title before bringing in another', () => {
    const f = fit({ ids: [...ids, 'fresh'], anchors: {}, votes: chain });
    const p = nextPair({ fit: f, recent: [], newcomers: [{ id: 'new', p: 0.9 }], newcomerShare: 1, random: seeded(3), now })!;
    expect(p.mode).toBe('place');
  });

  it('takes the share from how recent newcomers went', () => {
    expect(newcomerShare([])).toBeCloseTo(0.1 + 0.4 * (2 / 3));
    expect(newcomerShare(Array(12).fill(true))).toBeGreaterThan(0.45);
    expect(newcomerShare(Array(12).fill(false))).toBeLessThan(0.17);
  });
});

describe('settled pairs', () => {
  // Two titles left level after two split results.
  const split: FitVote[] = [
    { a: 't0', b: 't1', outcome: 'a' },
    { a: 't0', b: 't1', outcome: 'b' },
  ];
  const f = fit({ ids, anchors: {}, votes: [...chain, ...split] });

  it('stops asking a pair that has met twice recently', () => {
    const rnd = seeded(4);
    const recent = [...at(chain, now - 200 * DAY), ...at(split, now - DAY)];
    for (let k = 0; k < 50; k++) {
      const p = nextPair({ fit: f, recent, random: rnd, now })!;
      expect([p.a, p.b].sort().join()).not.toBe('t0,t1');
    }
  });

  it('allows a rematch months later', () => {
    const rnd = seeded(5);
    // Forty other duels since, so the pair is no longer among the most recent ones either.
    const since = Array.from({ length: 40 }, (_, i) => ({ a: ids[2 + (i % 8)], b: ids[2 + ((i + 3) % 8)], outcome: 'a' as const, at: now - 100 * DAY }));
    const recent = [...at(chain, now - 200 * DAY), ...at(split, now - 130 * DAY), ...since];
    let seen = false;
    for (let k = 0; k < 200 && !seen; k++) {
      const p = nextPair({ fit: f, recent, random: rnd, now })!;
      seen = [p.a, p.b].sort().join() === 't0,t1';
    }
    expect(seen).toBe(true);
  });
});

describe('simulated long session', () => {
  it('spreads duels beyond the top 10 once the list is placed', () => {
    const rnd = seeded(9);
    const n = 80;
    const all = Array.from({ length: n }, (_, i) => `s${i}`);
    const truth = new Map(all.map((id, i) => [id, 3 - (6 * i) / n] as const));
    const votes: (FitVote & { at: number })[] = [];
    let f = fit({ ids: all, anchors: {}, votes });
    const top10Pairs: number[] = [];
    for (let k = 0; k < 900; k++) {
      const p = nextPair({ fit: f, recent: votes, random: rnd, now: now + k })!;
      const d = truth.get(p.a)! - truth.get(p.b)!;
      votes.push({ a: p.a, b: p.b, outcome: rnd() < 1 / (1 + Math.exp(-d * 1.5)) ? 'a' : 'b', at: now + k });
      f = fit({ ids: all, anchors: {}, votes, warm: f.theta });
      if (k >= 700) {
        const top = new Set(f.order.slice(0, 10));
        top10Pairs.push(top.has(p.a) && top.has(p.b) ? 1 : 0);
      }
    }
    const share = top10Pairs.reduce((a, b) => a + b, 0) / top10Pairs.length;
    // Before pairs settled after two meetings, this was about 0.3 in the same simulation.
    expect(share).toBeLessThan(0.15);
  });
});

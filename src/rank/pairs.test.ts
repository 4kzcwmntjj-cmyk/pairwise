import { describe, expect, it } from 'vitest';
import { NEWCOMER_MIN_P, newcomerShare, nextPair, replaceSide } from './pairs';
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
      expect(p.fresh).toEqual(['new']);
      expect(p.b).toBe('new'); // always on the right
      const other = p.a;
      const rank = placed.order.indexOf(other);
      expect(rank).toBeGreaterThanOrEqual(3);
      expect(rank).toBeLessThanOrEqual(6);
    }
  });

  it('leaves long shots out', () => {
    const p = nextPair({ fit: placed, recent: [], newcomers: [{ id: 'new', p: NEWCOMER_MIN_P - 0.01 }], newcomerShare: 1, random: seeded(2), now })!;
    expect(p.fresh).toBeUndefined();
  });

  it('still brings newcomers in while a backlog of titles is being placed', () => {
    // Twenty titles marked seen but not duelled yet.
    const backlog = Array.from({ length: 20 }, (_, i) => `b${i}`);
    const f = fit({ ids: [...ids, ...backlog], anchors: {}, votes: chain });
    const rnd = seeded(3);
    let fresh = 0;
    for (let k = 0; k < 200; k++) {
      const p = nextPair({ fit: f, recent: [], newcomers: [{ id: 'new', p: 0.9 }], newcomerShare: 0.3, random: rnd, now })!;
      if (p.fresh) fresh++;
      else expect(p.mode).toBe('place');
    }
    expect(fresh).toBeGreaterThan(40);
    expect(fresh).toBeLessThan(80);
  });

  it('starts an empty list with two likely titles', () => {
    const empty = fit({ ids: [], anchors: {}, votes: [] });
    const cands = ['n1', 'n2', 'n3', 'n4', 'n5'].map((id, i) => ({ id, p: 0.9 - i * 0.1 }));
    const p = nextPair({ fit: empty, recent: [], newcomers: cands, random: seeded(4), now })!;
    expect(p.mode).toBe('new');
    expect(p.fresh).toHaveLength(2);
    expect(p.fresh).toContain(p.a);
    expect(p.fresh).toContain(p.b);
    expect(p.a).not.toBe(p.b);
  });

  it('pairs the only title on the list with a newcomer', () => {
    const one = fit({ ids: ['solo'], anchors: {}, votes: [] });
    const p = nextPair({ fit: one, recent: [], newcomers: [{ id: 'n1', p: 0.3 }], random: seeded(5), now })!;
    expect(p.fresh).toEqual(['n1']);
    expect([p.a, p.b]).toContain('solo');
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

describe('a title ranked in another view', () => {
  it('counts as new in a view where it is not listed', () => {
    // 'both' was ranked through anime duels, so the full fit knows it; the manga view's list doesn't include it.
    const full = fit({ ids: [...ids, 'both'], anchors: {}, votes: [...chain, { a: 'both', b: 't3', outcome: 'a' }] });
    const mangaView = { ...full, order: full.order.filter((id) => id !== 'both') };
    const p = nextPair({ fit: mangaView, recent: [], newcomers: [{ id: 'both', p: 0.9 }], newcomerShare: 1, random: seeded(6), now })!;
    expect(p.fresh).toEqual(['both']);
  });
});

describe("haven't seen in a duel", () => {
  it('keeps the other new title in its place when both were new', () => {
    const empty = fit({ ids: [], anchors: {}, votes: [] });
    const cands = ['n1', 'n2', 'n3'].map((id) => ({ id, p: 0.8 }));
    const p = replaceSide({ fit: empty, recent: [], newcomers: cands }, { a: 'n1', b: 'n2', mode: 'new', fresh: ['n1', 'n2'] }, 'n2')!;
    expect(p.a).toBe('n1');
    expect(p.b).toBe('n3');
    expect(p.fresh).toEqual(['n1', 'n3']);
  });

  it('brings the next newcomer in on the right when the new one is unseen', () => {
    const p = replaceSide(
      { fit: placed, recent: [], newcomers: [{ id: 'gone', p: 0.9 }, { id: 'next', p: 0.7 }] },
      { a: 't4', b: 'gone', mode: 'new', fresh: ['gone'] },
      'gone',
    )!;
    expect(p).toMatchObject({ a: 't4', b: 'next', fresh: ['next'] });
  });

  it('gives a ranked title its nearest neighbour when its opponent is unseen', () => {
    const p = replaceSide({ fit: placed, recent: [] }, { a: 't4', b: 't7', mode: 'refine' }, 't7')!;
    expect(p.a).toBe('t4');
    expect(['t3', 't5']).toContain(p.b);
    expect(p.fresh).toBeUndefined();
  });

  it('keeps a new title and finds it a mid-list opponent when the ranked side is unseen', () => {
    const p = replaceSide({ fit: placed, recent: [], random: seeded(8) }, { a: 't2', b: 'nn', mode: 'new', fresh: ['nn'] }, 't2')!;
    expect(p.b).toBe('nn');
    expect(p.fresh).toEqual(['nn']);
    const r = placed.order.indexOf(p.a);
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThanOrEqual(6);
  });
});

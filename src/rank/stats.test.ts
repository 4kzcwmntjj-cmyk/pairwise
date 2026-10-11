import { describe, expect, it } from 'vitest';
import type { Item, Mark, Vote } from '../types';
import { fit } from './solver';
import { crowdView, dayKey, duelStats, extremes, history, mainstream, movers, overview, settledBands, tasteBy } from './stats';

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
const vote = (a: string, b: string, outcome: Vote['outcome'], at = 0): Vote => ({ a, b, outcome, mode: 'refine', at });
const DAY = 86_400_000;
const t0 = new Date(2026, 5, 1, 12).getTime();

describe('tasteBy', () => {
  it('puts a group of well-ranked titles first and a badly ranked one last', () => {
    const ranked = [
      ...Array.from({ length: 10 }, (_, i) => item(`a${i}`, { genres: ['Drama'] })),
      ...Array.from({ length: 10 }, (_, i) => item(`b${i}`, { genres: ['Comedy'] })),
    ];
    const t = tasteBy(ranked, (i) => i.genres ?? [], 5);
    expect(t[0].name).toBe('Drama');
    expect(t[1].name).toBe('Comedy');
    expect(extremes(t).best.map((g) => g.name)).toEqual(['Drama']);
    expect(extremes(t).worst.map((g) => g.name)).toEqual(['Comedy']);
  });

  it('shrinks small groups so they do not beat a large, consistently good one', () => {
    const ranked = [
      item('lucky', { genres: ['Niche'] }),
      ...Array.from({ length: 12 }, (_, i) => item(`x${i}`, { genres: ['Big'] })),
      ...Array.from({ length: 12 }, (_, i) => item(`y${i}`, { genres: ['Other'] })),
    ];
    const t = tasteBy(ranked, (i) => i.genres ?? [], 1);
    const idx = (n: string) => t.findIndex((g) => g.name === n);
    expect(idx('Big')).toBeLessThan(idx('Niche'));
  });

  it('leaves out groups below the minimum size', () => {
    const t = tasteBy([item('a', { genres: ['One'] })], (i) => i.genres ?? [], 2);
    expect(t).toHaveLength(0);
  });
});

describe('crowdView', () => {
  const make = (yourOrder: number[]) =>
    yourOrder.map((score) => item(`s${score}`, { averageScore: score }));

  it('is 1 when you agree with the crowd exactly', () => {
    const v = crowdView(make(Array.from({ length: 30 }, (_, i) => 90 - i)))!;
    expect(v.agreement).toBeCloseTo(1, 10);
    expect(v.lovedMore).toHaveLength(0);
  });

  it('finds a title you rank far above its score', () => {
    const scores = Array.from({ length: 30 }, (_, i) => 90 - i);
    const ranked = make(scores);
    const [low] = ranked.splice(29, 1); // the crowd's lowest
    ranked.unshift(low); // your number one
    const v = crowdView(ranked)!;
    expect(v.lovedMore[0].item.id).toBe(low.id);
    expect(v.lovedMore[0].yourRank).toBe(1);
    expect(v.lovedMore[0].gap).toBe(29);
    expect(v.agreement).toBeLessThan(1);
  });

  it('declines with too few scored titles', () => {
    expect(crowdView(make([90, 80, 70]))).toBeNull();
  });
});

describe('mainstream', () => {
  it('counts how many of the most popular titles you have seen', () => {
    const items = Array.from({ length: 200 }, (_, i) => item(`i${i}`, { popularity: 1000 - i }));
    const marks = new Map<string, Mark>();
    for (let i = 0; i < 50; i++) marks.set(`i${i}`, { itemId: `i${i}`, status: 'seen', updatedAt: 0 });
    for (let i = 50; i < 70; i++) marks.set(`i${i}`, { itemId: `i${i}`, status: 'unseen', updatedAt: 0 });
    const m = mainstream(items, marks)!;
    expect(m.top100Seen).toBe(50);
    expect(m.top100Sorted).toBe(70);
    expect(m.medianTopPercent).toBeLessThanOrEqual(13);
  });
});

describe('duelStats', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  it('reports results the ranking disagrees with, biggest gap first', () => {
    const d = duelStats([vote('a', 'e', 'b'), vote('b', 'c', 'b')], order);
    expect(d.upsets[0]).toEqual({ winner: 'e', loser: 'a', gap: 4 });
    expect(d.upsets[1].gap).toBe(1);
  });

  it('finds pairs that keep going back and forth', () => {
    const d = duelStats([vote('a', 'b', 'a'), vote('b', 'a', 'a'), vote('a', 'c', 'a'), vote('a', 'c', 'a')], order);
    expect(d.rivalries[0]).toMatchObject({ a: 'a', b: 'b', aWins: 1, bWins: 1, flipped: true });
    expect(d.rivalries[1]).toMatchObject({ a: 'a', b: 'c', flipped: false });
  });

  it('lists undefeated and winless titles with at least three duels', () => {
    const votes = [vote('a', 'b', 'a'), vote('a', 'c', 'a'), vote('a', 'd', 'a'), vote('e', 'd', 'a'), vote('e', 'd', 'a')];
    const d = duelStats(votes, order);
    expect(d.undefeated.map((r) => r.id)).toEqual(['a']);
    expect(d.winless.map((r) => r.id)).toEqual(['d']);
  });
});

describe('overview', () => {
  it('counts duels, ties and streaks by calendar day', () => {
    const votes = [
      vote('a', 'b', 'a', t0),
      vote('a', 'b', 'tie', t0 + 1000),
      vote('a', 'b', 'a', t0 + DAY),
      vote('a', 'b', 'a', t0 + 2 * DAY),
      vote('a', 'b', 'a', t0 + 5 * DAY),
    ];
    const o = overview(votes, new Map(), t0 + 5 * DAY);
    expect(o.duels).toBe(5);
    expect(o.tieShare).toBeCloseTo(0.2);
    expect(o.activeDays).toBe(4);
    expect(o.busiest).toEqual({ day: dayKey(t0), count: 2 });
    expect(o.longestStreak).toBe(3);
    expect(o.currentStreak).toBe(1);
  });

  it('has no current streak after a few days away', () => {
    const o = overview([vote('a', 'b', 'a', t0)], new Map(), t0 + 4 * DAY);
    expect(o.currentStreak).toBe(0);
  });
});

/** A chain where the strongest title always wins, played over several days. */
function chain(ids: string[], days: number, perDay: number): Vote[] {
  const votes: Vote[] = [];
  let k = 0;
  for (let d = 0; d < days; d++) {
    for (let j = 0; j < perDay; j++, k++) {
      const x = k % (ids.length - 1);
      votes.push(vote(ids[x], ids[x + 1], 'a', t0 + d * DAY + j * 1000));
    }
  }
  return votes;
}

describe('history', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `t${i}`);
  it('replays the log into one checkpoint per day, ending at the latest vote', () => {
    const votes = chain(ids, 4, 7);
    const h = history(votes, ids, ids.slice(0, 3));
    expect(h).toHaveLength(4);
    expect(h[h.length - 1].at).toBe(votes[votes.length - 1].at);
    const final = fit({ ids, anchors: {}, votes });
    const last = h[h.length - 1].ranks;
    expect(last.get('t0')).toBe(final.order.indexOf('t0') + 1);
    expect(last.get('t0')).toBe(1);
  });

  it('thins to the requested number of checkpoints', () => {
    const h = history(chain(ids, 30, 3), ids, ['t0'], 8);
    expect(h.length).toBeLessThanOrEqual(8);
    expect(h.length).toBeGreaterThan(4);
  });

  it('leaves out titles that had not played yet', () => {
    const votes = [vote('t0', 't1', 'a', t0), vote('t2', 't3', 'a', t0 + DAY)];
    const h = history(votes, ids, ['t2']);
    expect(h[0].ranks.has('t2')).toBe(false);
    expect(h[1].ranks.has('t2')).toBe(true);
  });
});

describe('movers', () => {
  const ids = Array.from({ length: 6 }, (_, i) => `t${i}`);
  it('finds a title that climbed after the cut-off', () => {
    const early = chain(ids, 3, 12); // t0 on top, t5 at the bottom
    const late: Vote[] = Array.from({ length: 12 }, (_, i) => vote('t5', ids[i % 3], 'a', t0 + 10 * DAY + i));
    const m = movers([...early, ...late], ids, t0 + 5 * DAY, 3, 20)!;
    expect(m.climbers[0].id).toBe('t5');
    expect(m.climbers[0].to).toBeLessThan(m.climbers[0].from);
    expect(m.duelsSince).toBe(12);
  });

  it('declines when too little had been played by then', () => {
    expect(movers([vote('t0', 't1', 'a', t0 + DAY)], ids, t0, 3, 30)).toBeNull();
  });
});

describe('settledBands', () => {
  it('splits the order into bands and counts the settled ones', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const votes: Vote[] = [];
    for (let r = 0; r < 6; r++) for (let i = 0; i < 11; i++) votes.push(vote(ids[i], ids[i + 1], 'a'));
    const bands = settledBands(fit({ ids, anchors: {}, votes }));
    expect(bands.map((b) => b.label)).toEqual(['Top 10', '11 to 30']);
    expect(bands[0].total).toBe(10);
    expect(bands[1].total).toBe(2);
  });
});

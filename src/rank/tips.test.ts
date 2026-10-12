import { describe, expect, it } from 'vitest';
import { afterShown, NO_TIPS, pickTip, type TipContext, type TipState } from './tips';

const base: TipContext = {
  duels: 12,
  ranked: 10,
  onScreen: [],
  newcomerLog: [],
  recent: [],
  movedUp: null,
  knowsOneForm: false,
};
const ctx = (over: Partial<TipContext>): TipContext => ({ ...base, ...over });

describe('tips', () => {
  it('stays quiet in the first duels and when switched off', () => {
    expect(pickTip(NO_TIPS, ctx({ duels: 3, ranked: 30 }))).toBeNull();
    expect(pickTip({ ...NO_TIPS, off: true }, ctx({ ranked: 30 }))).toBeNull();
  });

  it('suggests Split up for a big franchise near the top, once', () => {
    const c = ctx({ onScreen: [{ title: 'Fate', rank: 12, entries: 14 }] });
    const tip = pickTip(NO_TIPS, c);
    expect(tip?.id).toBe('split');
    expect(tip?.text).toContain('Fate');
    expect(pickTip(afterShown(NO_TIPS, tip!, 12), ctx({ ...c, duels: 40 }))).toBeNull();
  });

  it('ignores big franchises lower down', () => {
    expect(pickTip(NO_TIPS, ctx({ onScreen: [{ title: 'Fate', rank: 80, entries: 14 }] }))).toBeNull();
  });

  it('points to Browse after five passes in a row', () => {
    expect(pickTip(NO_TIPS, ctx({ newcomerLog: [true, false, false, false, false, false] }))?.id).toBe('browse');
    expect(pickTip(NO_TIPS, ctx({ newcomerLog: [false, false, false, true, false] }))).toBeNull();
  });

  it('explains the view switch once you know one form of a title', () => {
    expect(pickTip(NO_TIPS, ctx({ knowsOneForm: true }))?.id).toBe('views');
  });

  it('notes big jumps and heavy tie use', () => {
    expect(pickTip(NO_TIPS, ctx({ movedUp: { title: 'X', places: 9 } }))?.id).toBe('jump');
    expect(pickTip(NO_TIPS, ctx({ movedUp: { title: 'X', places: 3 } }))).toBeNull();
    const recent = [...Array(10).fill('a'), ...Array(5).fill('tie')];
    expect(pickTip(NO_TIPS, ctx({ recent }))?.id).toBe('ties');
  });

  it('introduces For you at 20 ranked and Stats at 30 ranked and 100 duels', () => {
    expect(pickTip(NO_TIPS, ctx({ ranked: 20 }))?.id).toBe('foryou');
    const s: TipState = { ...NO_TIPS, seen: ['foryou'] };
    expect(pickTip(s, ctx({ ranked: 30, duels: 90 }))).toBeNull();
    expect(pickTip(s, ctx({ ranked: 30, duels: 100 }))?.id).toBe('stats');
  });

  it('spaces tips apart', () => {
    const s = afterShown(NO_TIPS, { id: 'foryou', text: '' }, 20);
    expect(pickTip(s, ctx({ duels: 25, knowsOneForm: true }))).toBeNull();
    expect(pickTip(s, ctx({ duels: 30, knowsOneForm: true }))?.id).toBe('views');
  });
});

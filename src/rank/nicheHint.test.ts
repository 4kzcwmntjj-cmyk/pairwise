import { describe, expect, it } from 'vitest';
import { NICHE_MAX_WAITING, NICHE_MIN_DUELS, showNicheHint } from './nicheHint';

describe('showNicheHint', () => {
  it('shows when no newcomer is waiting', () => {
    expect(showNicheHint(0, NICHE_MIN_DUELS)).toBe(true);
    expect(showNicheHint(NICHE_MAX_WAITING - 1, 200)).toBe(true);
  });

  it('stays away while newcomers are waiting', () => {
    expect(showNicheHint(NICHE_MAX_WAITING, 200)).toBe(false);
    expect(showNicheHint(20, 200)).toBe(false);
  });

  it('stays away on a list that has barely started', () => {
    expect(showNicheHint(0, 0)).toBe(false);
    expect(showNicheHint(0, NICHE_MIN_DUELS - 1)).toBe(false);
  });
});

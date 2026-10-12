import { describe, expect, it } from 'vitest';
import { BACKUP_AFTER_CHANGES, BACKUP_AFTER_DAYS, backupIsDue, snoozed } from './backup';

const DAY = 86_400_000;
const now = 1_000 * DAY;

describe('backup reminder', () => {
  it('stays quiet for an empty list', () => {
    expect(backupIsDue(0, null, now)).toBe(false);
  });

  it('first reminder comes after a third of the usual changes when nothing was ever saved', () => {
    const first = BACKUP_AFTER_CHANGES / 3;
    expect(backupIsDue(first - 1, null, now)).toBe(false);
    expect(backupIsDue(first, null, now)).toBe(true);
  });

  it('after a save, waits for enough changes or enough days', () => {
    const saved = { at: now - 2 * DAY, size: 300 };
    expect(backupIsDue(300 + BACKUP_AFTER_CHANGES - 1, saved, now)).toBe(false);
    expect(backupIsDue(300 + BACKUP_AFTER_CHANGES, saved, now)).toBe(true);
    const old = { at: now - (BACKUP_AFTER_DAYS + 1) * DAY, size: 300 };
    expect(backupIsDue(301, old, now)).toBe(true);
    expect(backupIsDue(300, old, now)).toBe(false);
  });

  it('"Not now" keeps it away for three days, then it returns', () => {
    const note = snoozed({ at: now - 2 * DAY, size: 300 }, now);
    expect(backupIsDue(900, note, now + 2 * DAY)).toBe(false);
    expect(backupIsDue(900, note, now + 3 * DAY + 1)).toBe(true);
  });

  it('a snooze keeps the last save, or none', () => {
    expect(snoozed(null, now)).toEqual({ at: 0, size: 0, snoozeUntil: now + 3 * DAY });
    expect(snoozed({ at: 5, size: 7 }, now)).toEqual({ at: 5, size: 7, snoozeUntil: now + 3 * DAY });
  });
});

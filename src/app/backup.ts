/** When the list was last saved to a file, how much was in it then, and when to stop reminding. */
export interface BackupNote {
  at: number;
  size: number;
  snoozeUntil?: number;
}
/** Remind after this many new marks and duels since the last copy (or since the start, if never saved)... */
export const BACKUP_AFTER_CHANGES = 150;
/** ...or after this long, if anything changed at all. */
export const BACKUP_AFTER_DAYS = 14;
/** "Not now" keeps the reminder away this long. */
export const BACKUP_SNOOZE_DAYS = 3;

const DAY = 86_400_000;

/** Whether the backup reminder is due: `size` is marks plus duels now. */
export function backupIsDue(size: number, backup: BackupNote | null, now: number): boolean {
  if (size === 0) return false;
  if (backup?.snoozeUntil && now < backup.snoozeUntil) return false;
  const changed = size - (backup?.size ?? 0);
  if (changed <= 0) return false;
  if (!backup) return changed >= BACKUP_AFTER_CHANGES / 3;
  return changed >= BACKUP_AFTER_CHANGES || now - backup.at > BACKUP_AFTER_DAYS * DAY;
}

export const snoozed = (backup: BackupNote | null, now: number): BackupNote => ({
  at: backup?.at ?? 0,
  size: backup?.size ?? 0,
  snoozeUntil: now + BACKUP_SNOOZE_DAYS * DAY,
});

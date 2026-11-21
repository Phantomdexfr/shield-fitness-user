// Data and backup helpers (Phase 63). Pure: the clock is a parameter.
import { istDayKey } from './dates';

/** The word the person types to wipe everything. */
export const WIPE_WORD = 'DELETE';

export const isWipeConfirm = (typed: string): boolean => typed.trim() === WIPE_WORD;

/** shield-fitness-backup-2026-11-20.json (the gym day, IST). */
export const backupFileName = (nowMs: number): string => `shield-fitness-backup-${istDayKey(nowMs)}.json`;

/** "12.4 MB", "830 KB", "0 KB" for the storage line. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

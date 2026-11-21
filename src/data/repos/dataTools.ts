// Data and backup repo (Phase 63): export, import, wipe and the storage numbers. The UI uses this, never the store directly.
import { exportAll, importAll, getQuota, requestPersist, resetDb, type ImportResult, type QuotaInfo } from '../local';
import { backupFileName } from '../../shared/dataTools';

/** The backup as JSON text and its file name. Progress photos are NOT in it: they stay on the device (Privacy). */
export async function makeBackup(nowMs: number): Promise<{ name: string; text: string }> {
  const file = await exportAll({ includePhotos: false, now: nowMs });
  return { name: backupFileName(nowMs), text: JSON.stringify(file) };
}

/** Merge a backup file's text into the device. A bad file throws BackupError and changes nothing. */
export function restoreBackup(text: string): Promise<ImportResult> {
  return importAll(text);
}

/** Delete the whole on-device database. The caller reloads the app afterwards. */
export async function wipeAllData(): Promise<void> {
  await resetDb(true);
}

export { getQuota, requestPersist, BackupError } from '../local';
export type { QuotaInfo, ImportResult };

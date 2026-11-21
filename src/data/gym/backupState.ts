// Phase 76-b2: the backup runtime's live state (memory only), read by the status line and the chip. Like syncState.ts.
import { useEffect, useState } from 'preact/hooks';

export interface BackupLive { saving: boolean; restoring: { done: number; total: number } | null; online: boolean }
let live: BackupLive = { saving: false, restoring: null, online: true };
const subs = new Set<() => void>();
export const getBackupLive = (): BackupLive => live;
export function setBackupLive(p: Partial<BackupLive>): void {
  live = { ...live, ...p };
  subs.forEach((f) => f());
}
export const subscribeBackup = (f: () => void): (() => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export function useBackupLive(): BackupLive {
  const [, force] = useState(0);
  useEffect(() => subscribeBackup(() => force((n) => n + 1)), []);
  return live;
}

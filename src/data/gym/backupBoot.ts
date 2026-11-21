// Phase 76-b2: starts the backup runtime for a gym-connected member (the ONLY caller of createBackupRemote and
// startBackupTriggers). Called from link.ts after sign-in work and at boot. Standalone / `cloud_backup` off: nothing runs.
// The free-account modes (Phase 78) will build their own deps and call `startBackup` the same way.
import type { BackupDeps } from './backupRun';
import { runBackupPass } from './backupRun';
import { createBackupScheduler, startBackupTriggers, type BackupScheduler } from './backupTriggers';
import { createBackupRemote } from './backupSupabase';
import type { RestoreRemote } from './backupRemote';
import { readLast, readMode, readRestoreRec, writeMode } from './backupMeta';
import { runRestore } from './backupRestore';
import { setBackupLive } from './backupState';
import { setChipInput } from './syncState';
import { resolveFeature } from '../../app/flags';
import type { BackupAccess } from './types';

let stop: (() => void) | null = null;
let scheduler: BackupScheduler | null = null;
let runningFor: string | null = null;
let current: { remote: RestoreRemote; deps: BackupDeps } | null = null;

const featureOn = (): boolean => resolveFeature('cloud_backup');

async function publishChip(): Promise<void> {
  const last = await readLast();
  const code = last?.error_code;
  setChipInput({ backup: { saving: false, blocked: code === 'S1', newer: code === 'SFE707' } });
}

/** Build the deps from a signed-in train shard. */
export function depsFromAccess(a: BackupAccess, functions?: { url: string; coreAnon: string }, now: () => number = Date.now, rand: () => number = Math.random): { remote: RestoreRemote; deps: BackupDeps } {
  const remote = createBackupRemote({ url: a.url, anonKey: a.anon, getToken: a.getToken, ownerUid: a.ownerUid, memberId: a.memberId, shardId: a.shardId, ...(functions ? { functions } : {}) });
  return { remote, deps: { remote, ownerUid: a.ownerUid, now, rand } };
}

/** Resume an interrupted restore (a `running` record). Returns whether one was found. */
export async function resumeRestoreIfRunning(c = current): Promise<boolean> {
  if (!c || (await readRestoreRec())?.status !== 'running') return false;
  const out = await runRestore({ ...c.deps, remote: c.remote }, { onProgress: (done, total) => setBackupLive({ restoring: { done, total } }) });
  setBackupLive({ restoring: null });
  await publishChip();
  return out.kind !== 'nothing';
}

/** Start (or restart) the runtime for one signed-in shard. Safe to call again: the previous triggers are stopped first. */
export async function startBackup(c: { remote: RestoreRemote; deps: BackupDeps }): Promise<void> {
  stopBackup();
  runningFor = c.deps.ownerUid;
  current = c;
  const enabled = async (): Promise<boolean> => featureOn() && (await readMode()) !== 'standalone';
  scheduler = createBackupScheduler({
    enabled,
    now: c.deps.now,
    rand: c.deps.rand,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    runPass: async () => {
      if (await resumeRestoreIfRunning(c)) return; // a resumed restore comes first; pushes stay blocked until it is done
      setBackupLive({ saving: true });
      setChipInput({ backup: { saving: true, blocked: false, newer: false } });
      try {
        const r = await runBackupPass(c.deps);
        if (Object.values(r.outcomes).some((o) => o.kind === 'auth')) setChipInput({ authPaused: true });
      } finally {
        setBackupLive({ saving: false });
        await publishChip();
      }
    },
  });
  stop = startBackupTriggers(scheduler);
}

export function stopBackup(): void {
  stop?.();
  stop = null;
  scheduler = null;
  runningFor = null;
}

/** After a successful row sync: one more backup pass (SYNC_SPEC B4). No-op when the runtime is not running. */
export const kickBackup = (): Promise<void> => scheduler?.kick() ?? Promise.resolve();

/** The gym path (link.ts). Mode follows the connection [A-P76.1]: connected + signed in -> `connected`; a stale `connected` with no gym -> `standalone`. */
export async function initGymBackup(remote: { backupAccess?: () => Promise<BackupAccess | null> } | null, functionsUrl?: string, coreAnon?: string): Promise<void> {
  if (!featureOn()) return;
  const mode = await readMode();
  if (mode === 'free_backup') return; // Phase 78: exactly one backup target; the free account keeps it until the Phase 80 switch
  if (!remote?.backupAccess) {
    if (mode === 'connected') await writeMode('standalone');
    return;
  }
  const a = await remote.backupAccess();
  if (!a) return; // signed out: backups wait
  if (mode === 'standalone') await writeMode('connected');
  if (runningFor === a.ownerUid && scheduler) return; // already running for this account: do not restart the triggers on every row sync
  setChipInput({ backup: { saving: false, blocked: false, newer: false } });
  await startBackup(depsFromAccess(a, functionsUrl && coreAnon ? { url: functionsUrl, coreAnon } : undefined));
}

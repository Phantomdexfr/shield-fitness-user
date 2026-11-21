// Phase 76-a: pure helpers for the backup runtime (SYNC_SPEC B1, B2, B4). No DOM, no network, no clock (time and
// randomness are parameters). The executor that uses them is `src/data/gym/backupRun.ts`.

export type BackupMode = 'standalone' | 'free_backup' | 'connected';
export const BACKUP_MODES: readonly BackupMode[] = ['standalone', 'free_backup', 'connected'];

/** Unknown or missing stored value = standalone (nothing is ever sent). */
export const parseMode = (v: unknown): BackupMode => (BACKUP_MODES as readonly unknown[]).includes(v) ? (v as BackupMode) : 'standalone';

// ---------------------------------------------------------------- dirty set (B2 `backup:dirty`: sorted list of chunk keys)

/** Sorted, unique, only strings. Anything else in a stored value is dropped. */
export function cleanKeys(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((k): k is string => typeof k === 'string' && k.length > 0))].sort();
}
export const addDirty = (list: readonly string[], key: string): string[] => cleanKeys([...list, key]);
export const removeDirty = (list: readonly string[], key: string): string[] => list.filter((k) => k !== key);

// ---------------------------------------------------------------- delays (B4)

/** Push 10-30 s after a change. `rand` is a number in [0, 1). */
export const triggerDelayMs = (rand: number): number => 10_000 + Math.floor(Math.min(Math.max(rand, 0), 0.999999) * 20_001);

/** B4 rule 6: `min(2^attempts x 5 s, 15 min) + jitter` (jitter up to 20 % of the base). */
export function retryDelayMs(attempts: number, rand: number): number {
  const base = Math.min(2 ** Math.max(attempts, 0) * 5_000, 15 * 60_000);
  return base + Math.floor(Math.min(Math.max(rand, 0), 0.999999) * base * 0.2);
}

export interface Attempts {
  n: number;
  /** Epoch ms before which the key is not tried again. `null` = never automatically (a plain-message code, B6). */
  nextTryAt: number | null;
  code?: string;
}

/** B6: these codes are never retried in a loop; the chunk stays dirty and the screen shows a plain message. */
export const NO_RETRY_CODES: ReadonlySet<string> = new Set(['SFE703', 'SFE704', 'SFE706', 'SFE707']);
export const isNoRetry = (code: string | undefined): boolean => !!code && NO_RETRY_CODES.has(code);

export function bumpAttempts(prev: Attempts | null, now: number, rand: number, code?: string): Attempts {
  const n = (prev?.n ?? 0) + 1;
  if (isNoRetry(code)) return { n, nextTryAt: null, code };
  return { n, nextTryAt: now + retryDelayMs(n, rand), ...(code ? { code } : {}) };
}

/** Dirty keys that may be tried now: not in back-off, not stopped by a plain-message code. */
export function dueKeys(dirty: readonly string[], attempts: Readonly<Record<string, Attempts | undefined>>, now: number): string[] {
  return dirty.filter((k) => {
    const a = attempts[k];
    if (!a) return true;
    return a.nextTryAt !== null && a.nextTryAt <= now;
  });
}

// ---------------------------------------------------------------- status line (Settings -> Data "Last backed up")

export const AMBER_AFTER_MS = 7 * 24 * 3600_000;
export type LastBackedUp = { state: 'never' } | { state: 'ok'; at: number } | { state: 'amber'; at: number };

/** Amber past about 7 days, and only while online (offline is the chip's job, not a warning). */
export function lastBackedUp(okAt: number | null | undefined, now: number, online: boolean): LastBackedUp {
  if (typeof okAt !== 'number') return { state: 'never' };
  return online && now - okAt > AMBER_AFTER_MS ? { state: 'amber', at: okAt } : { state: 'ok', at: okAt };
}

// ---------------------------------------------------------------- object path (contract: `<owner_uid>/<key with ':' -> '_'>/<sha256>.bin`)

export const objectPath = (ownerUid: string, key: string, sha256: string): string => `${ownerUid}/${key.replace(/:/g, '_')}/${sha256}.bin`;

/** Max lost-race retries inside one push (B6), then back off. */
export const MAX_CAS_TRIES = 5;

// ---------- Phase 76-b2: the status line (docs/GYM_CONNECTION.md P74-3, R13) ----------
export type BackupLineKey = 'bk.state.off' | 'bk.state.ok' | 'bk.state.wait' | 'bk.state.saving' | 'bk.state.blocked' | 'bk.state.update' | 'bk.state.attn' | 'bk.state.restoring';
export interface BackupLineInput {
  mode: BackupMode;
  /** The feature `cloud_backup` after policy resolution. */
  featureOn: boolean;
  online: boolean;
  saving: boolean;
  restoring: boolean;
  dirty: number;
  okAt: number | null;
  errorCode?: string;
  now: number;
}
/** One state, worst first: update > blocked (S1) > attention > restoring > saving > waiting > ok. Standalone or feature off = the "off" line. */
export function backupLine(i: BackupLineInput): { key: BackupLineKey; at?: number; amber?: boolean } {
  if (!i.featureOn || i.mode === 'standalone') return { key: 'bk.state.off' };
  if (i.errorCode === 'SFE707') return { key: 'bk.state.update' };
  if (i.errorCode === 'S1') return { key: 'bk.state.blocked' };
  if (i.errorCode === 'SFE703' || i.errorCode === 'SFE704' || i.errorCode === 'SFE706') return { key: 'bk.state.attn' };
  if (i.restoring) return { key: 'bk.state.restoring' };
  if (i.saving) return { key: 'bk.state.saving' };
  if (i.dirty > 0 && !i.online) return { key: 'bk.state.wait' };
  const l = lastBackedUp(i.okAt, i.now, i.online);
  if (l.state === 'never') return { key: i.dirty > 0 ? 'bk.state.wait' : 'bk.state.attn' };
  return { key: 'bk.state.ok', at: l.at, amber: l.state === 'amber' };
}

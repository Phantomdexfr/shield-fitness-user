// Phase 76-a: the `meta` keys of SYNC_SPEC B2 that the backup runtime owns. All device-local: never exported, never synced,
// never in a chunk. Values are plain JSON; anything unreadable is treated as absent.
import { getDb } from '../local';
import { addDirty, cleanKeys, parseMode, removeDirty, type Attempts, type BackupMode } from '../../shared/backupPlan';

export interface BaseRec { content_sha256: string; rev: number; rows: number; at: number }
export interface LastRec { ok_at: number | null; error_code?: string }
export interface RestoreRec { status: 'running' | 'done' | 'failed'; done_keys: string[]; total_keys: number }

const K = {
  mode: 'backup:mode',
  dirty: 'backup:dirty',
  last: 'backup:last',
  restore: 'backup:restore',
  base: (key: string) => `backup:base:${key}`,
  attempts: (key: string) => `backup:attempts:${key}`,
};

async function get(key: string): Promise<unknown> {
  return (await (await getDb()).get('meta', key))?.value;
}
async function put(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('meta', { key, value });
}
async function del(key: string): Promise<void> {
  await (await getDb()).delete('meta', key);
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const readMode = async (): Promise<BackupMode> => parseMode(await get(K.mode));
export const writeMode = (m: BackupMode): Promise<void> => put(K.mode, m);

// In-memory stamp per key, bumped by every `markDirty`: a push clears a key only if nothing re-dirtied it while it ran.
const stamps = new Map<string, number>();
let stampN = 0;
export const dirtyStamp = (key: string): number => stamps.get(key) ?? 0;

export const readDirty = async (): Promise<string[]> => cleanKeys(await get(K.dirty));
export async function markDirty(key: string): Promise<void> {
  stamps.set(key, ++stampN);
  await put(K.dirty, addDirty(await readDirty(), key));
}
/** Clears `key` only when its stamp still equals `stamp` (nothing changed it during the push). Returns whether it cleared. */
export async function clearDirty(key: string, stamp: number): Promise<boolean> {
  if (dirtyStamp(key) !== stamp) return false;
  await put(K.dirty, removeDirty(await readDirty(), key));
  return true;
}

export async function readBaseRec(key: string): Promise<BaseRec | null> {
  const v = await get(K.base(key));
  return isObj(v) && typeof v.content_sha256 === 'string' && typeof v.rows === 'number' ? (v as unknown as BaseRec) : null;
}
export const writeBaseRec = (key: string, rec: BaseRec): Promise<void> => put(K.base(key), rec);

export async function readAttempts(key: string): Promise<Attempts | null> {
  const v = await get(K.attempts(key));
  return isObj(v) && typeof v.n === 'number' ? (v as unknown as Attempts) : null;
}
export const writeAttempts = (key: string, a: Attempts): Promise<void> => put(K.attempts(key), a);
export const clearAttempts = (key: string): Promise<void> => del(K.attempts(key));

export async function readLast(): Promise<LastRec | null> {
  const v = await get(K.last);
  return isObj(v) ? (v as unknown as LastRec) : null;
}
export const writeLast = (r: LastRec): Promise<void> => put(K.last, r);

export async function readRestoreRec(): Promise<RestoreRec | null> {
  const v = await get(K.restore);
  return isObj(v) && typeof v.status === 'string' ? (v as unknown as RestoreRec) : null;
}
/** Phase 76-a only READS this (it blocks pushes while `running`); Phase 76-b writes it. */
export const writeRestoreRec = (r: RestoreRec): Promise<void> => put(K.restore, r);

/** Phase 78: forget every backup record (dirty list, bases, attempts, last, restore, daily check) when the backup account is deleted. Rows are not touched. */
export async function clearBackupMeta(): Promise<void> {
  const db = await getDb();
  const keys = (await db.getAllKeys('meta')).filter((k) => typeof k === 'string' && k.startsWith('backup:'));
  for (const k of keys) await db.delete('meta', k as string);
  stamps.clear();
}

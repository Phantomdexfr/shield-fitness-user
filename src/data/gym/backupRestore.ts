// Phase 76-b2: the RESUMABLE restore (SYNC_SPEC B7). Writes `backup:restore` {running, done_keys, total_keys}, takes one key at
// a time (newest month first, then `small`, then older months), records `done_keys` after EACH key, and on app start a `running`
// record is resumed with only the keys left. While it is `running` no push runs (pushKey / runBackupPass already enforce it).
// Merge, never overwrite (`applyChunk`). A key the server no longer lists is simply not restored.
import { applyChunk } from '../local/chunks';
import { encodeChunk } from '../../shared/chunks';
import { restoreOrder } from '../../shared/chunks';
import { classifyError } from '../../shared/sync';
import type { BackupDeps } from './backupRun';
import { fetchServerChunk } from './backupRun';
import type { RestoreRemote } from './backupRemote';
import { markDirty, readRestoreRec, writeBaseRec, writeLast, writeRestoreRec, readLast, type RestoreRec } from './backupMeta';

export type RestoreOutcome =
  | { kind: 'done'; restored: number; total: number }
  /** Stopped before the end (offline, 401, `stopAfter`): the record stays `running`, the next call resumes. */
  | { kind: 'paused'; reason: 'offline' | 'auth' | 'stopped'; done: number; total: number }
  /** A copy was refused (newer schema, bad hash on both revisions): the record is `failed`; nothing was changed for that key. */
  | { kind: 'failed'; reason: string; done: number; total: number }
  | { kind: 'nothing' };

export interface RestoreOptions {
  /** Test seam (the "kill"): stop cleanly after this many keys in THIS call. */
  stopAfter?: number;
  /** Called once when the last key is merged (the caller refreshes anything derived; PRs and XP are computed from the rows on read). */
  onDone?: () => void | Promise<void>;
  /** Progress for the "n of m" line. */
  onProgress?: (done: number, total: number) => void;
}

/** True while a restore record says `running` (the app start resumes it). */
export async function restoreIsRunning(): Promise<boolean> {
  return (await readRestoreRec())?.status === 'running';
}

/** Start a restore, or resume a `running` one. Safe to call twice: a finished (`done`) record starts over only when `fresh` is set. */
export async function runRestore(deps: BackupDeps & { remote: RestoreRemote }, opts: RestoreOptions = {}, fresh = false): Promise<RestoreOutcome> {
  const listed = await deps.remote.listManifests();
  if (listed.error) {
    const cls = classifyError(listed.error);
    return { kind: 'paused', reason: cls === 'auth' ? 'auth' : 'offline', done: (await readRestoreRec())?.done_keys.length ?? 0, total: (await readRestoreRec())?.total_keys ?? 0 };
  }
  const rows = new Map(listed.rows.map((r) => [r.key, r]));
  const order = restoreOrder([...rows.keys()]);
  if (order.length === 0) return { kind: 'nothing' };

  let rec: RestoreRec | null = await readRestoreRec();
  if (!rec || rec.status === 'failed' || (rec.status === 'done' && fresh)) rec = { status: 'running', done_keys: [], total_keys: order.length };
  else if (rec.status === 'done') return { kind: 'done', restored: rec.done_keys.length, total: rec.total_keys };
  else rec = { ...rec, total_keys: Math.max(rec.total_keys, order.length) }; // resume: keep what is done, count any new keys
  await writeRestoreRec(rec); // the push block starts here

  let stepped = 0;
  for (const key of order) {
    if (rec.done_keys.includes(key)) continue;
    if (opts.stopAfter !== undefined && stepped >= opts.stopAfter) return { kind: 'paused', reason: 'stopped', done: rec.done_keys.length, total: rec.total_keys };
    const row = rows.get(key)!;
    const f = await fetchServerChunk(deps, key, row);
    if (!f.ok) {
      if (f.out.kind === 'auth') return { kind: 'paused', reason: 'auth', done: rec.done_keys.length, total: rec.total_keys };
      if (f.out.kind === 'refused') {
        const failed: RestoreRec = { ...rec, status: 'failed' };
        await writeRestoreRec(failed);
        await writeLast({ ok_at: (await readLast())?.ok_at ?? null, error_code: f.out.reason === 'too_new' ? 'SFE707' : 'SFE706' });
        return { kind: 'failed', reason: f.out.reason, done: rec.done_keys.length, total: rec.total_keys };
      }
      return { kind: 'paused', reason: 'offline', done: rec.done_keys.length, total: rec.total_keys };
    }
    const ap = await applyChunk(key, f.chunk);
    // Local had rows the server copy lacks: the base is the SERVER copy, so the next pass sees a local change and pushes the merge.
    const baseChunk = ap.needsPush ? f.chunk : ap.merged;
    await writeBaseRec(key, { content_sha256: (await encodeChunk(baseChunk)).contentSha256, rev: row.rev, rows: baseChunk.rows, at: deps.now() });
    if (ap.needsPush) await markDirty(key);
    rec = { ...rec, done_keys: [...rec.done_keys, key] };
    await writeRestoreRec(rec); // after EACH key: a kill here resumes with the rest
    stepped++;
    opts.onProgress?.(rec.done_keys.length, rec.total_keys);
  }
  rec = { ...rec, status: 'done' };
  await writeRestoreRec(rec);
  await writeLast({ ok_at: deps.now() });
  await opts.onDone?.();
  return { kind: 'done', restored: rec.done_keys.length, total: rec.total_keys };
}

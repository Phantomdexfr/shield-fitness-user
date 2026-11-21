// Phase 76-a: the backup push executor (SYNC_SPEC B4-B6). Chunk first, manifest last, compare-and-swap, two revisions kept,
// an ambiguous failure is settled by re-reading the manifest. It talks to a `BackupRemote` only (a fake in tests; the real
// adapter is Phase 76-b). Standalone mode sends nothing. No push runs while a restore is running (B7).
import { applyChunk, buildChunk } from '../local/chunks';
import { decodeChunk, encodeChunk, planSync, type Chunk, type ChunkRejectReason, type LocalFp } from '../../shared/chunks';
import { classifyError, type RemoteError } from '../../shared/sync';
import { MAX_CAS_TRIES, bumpAttempts, dueKeys, isNoRetry, objectPath, type Attempts } from '../../shared/backupPlan';
import type { BackupRemote, ManifestRow } from './backupRemote';
import { clearAttempts, clearDirty, dirtyStamp, readAttempts, readBaseRec, readDirty, readLast, readMode, readRestoreRec, writeAttempts, writeBaseRec, writeLast } from './backupMeta';

export interface BackupDeps {
  remote: BackupRemote;
  /** The signed-in auth uid in the target shard (first folder of the object path). */
  ownerUid: string;
  now: () => number;
  /** A number in [0, 1) for jitter. */
  rand: () => number;
}

export type PushOutcome =
  | { kind: 'pushed'; rev: number }
  | { kind: 'noop' }
  | { kind: 'pulled'; changed: number }
  | { kind: 'standalone' }
  | { kind: 'blocked_restore' }
  /** S1 (fewer than 70 % of the base rows): nothing was sent; the screen offers Restore. */
  | { kind: 'blocked_s1' }
  | { kind: 'both_gone' }
  | { kind: 'retry'; code?: string }
  | { kind: 'auth' }
  /** A plain-message code (SFE703/704/706/707): no retry loop, the chunk stays dirty. */
  | { kind: 'stopped'; code: string }
  /** A downloaded copy was refused (hash, header, newer schema...): nothing was changed. */
  | { kind: 'refused'; reason: ChunkRejectReason | 'no_object' };

const sameBytes = (r: ManifestRow | null, sha: string): boolean => !!r && r.sha256 === sha;

/** Turns a RemoteError into an outcome, and records back-off or the stop code. */
async function failed(deps: BackupDeps, key: string, e: RemoteError): Promise<PushOutcome> {
  const cls = classifyError(e);
  if (cls === 'auth') return { kind: 'auth' };
  const prev = await readAttempts(key);
  const a: Attempts = bumpAttempts(prev, deps.now(), deps.rand(), e.code);
  await writeAttempts(key, a);
  await writeLast({ ok_at: await readLastOk(), error_code: e.code ?? (e.offline ? 'offline' : String(e.status ?? 'error')) });
  if (isNoRetry(e.code)) return { kind: 'stopped', code: e.code! };
  return { kind: 'retry', code: e.code };
}
async function readLastOk(): Promise<number | null> {
  return (await readLast())?.ok_at ?? null;
}

type Fetched = { ok: true; chunk: Chunk; row: ManifestRow } | { ok: false; out: PushOutcome };

/** Download + verify the server copy; on a bad current revision fall back to `prev_*` (S4); report and change nothing otherwise. */
export async function fetchServerChunk(deps: BackupDeps, key: string, row: ManifestRow): Promise<Fetched> {
  const tries: string[] = [row.sha256, ...(row.prev_sha256 ? [row.prev_sha256] : [])];
  let last: ChunkRejectReason | 'no_object' = 'no_object';
  for (const sha of tries) {
    const d = await deps.remote.download(objectPath(deps.ownerUid, key, sha));
    if (d.error) return { ok: false, out: await failed(deps, key, d.error) };
    if (!d.bytes) { last = 'no_object'; continue; }
    const r = await decodeChunk(d.bytes, { key, sha256: sha });
    if (r.ok) return { ok: true, chunk: r.chunk, row };
    last = r.reason;
    // A login page or HTML body is a network error, never data (B7): retry later, do not try the older revision.
    if (r.reason === 'html') return { ok: false, out: await failed(deps, key, { status: 0, offline: true, message: 'html' }) };
    // A newer schema is the app's problem (S7), not the object's: do not fall back.
    if (r.reason === 'too_new') break;
  }
  return { ok: false, out: { kind: 'refused', reason: last } };
}

/** Success bookkeeping: base (S6), back-off cleared, last ok, dirty cleared only if unchanged during the run. */
async function done(deps: BackupDeps, key: string, stamp: number, base: { content_sha256: string; rev: number; rows: number }): Promise<void> {
  await writeBaseRec(key, { ...base, at: deps.now() });
  await clearAttempts(key);
  await writeLast({ ok_at: deps.now() });
  await clearDirty(key, stamp);
}

/** Push (or pull-merge) ONE chunk key. Safe to call at any time; it decides with `planSync` (B5). */
export async function pushKey(deps: BackupDeps, key: string): Promise<PushOutcome> {
  if ((await readMode()) === 'standalone') return { kind: 'standalone' };
  if ((await readRestoreRec())?.status === 'running') return { kind: 'blocked_restore' };
  const stamp = dirtyStamp(key);

  for (let tryNo = 0; tryNo < MAX_CAS_TRIES; tryNo++) {
    const local = await buildChunk(key);
    const enc = local ? await encodeChunk(local) : null;
    const L: LocalFp = enc ? enc.contentSha256 : 'EMPTY';
    const base = await readBaseRec(key);
    const m = await deps.remote.readManifest(key);
    if (m.error) return failed(deps, key, m.error);
    const S = m.row ? m.row.content_sha256 : 'MISSING';
    const action = planSync({ L, B: base?.content_sha256 ?? null, S, rowsL: local?.rows, rowsB: base?.rows });

    if (action === 'NOOP') {
      if (m.row && enc) await done(deps, key, stamp, { content_sha256: L, rev: m.row.rev, rows: enc.rows });
      else await clearDirty(key, stamp); // nothing local, nothing remote: never push an empty chunk (S1)
      return { kind: 'noop' };
    }
    if (action === 'NOOP_REPORT_BOTH_GONE') return { kind: 'both_gone' };
    if (action === 'STOP_OFFER_RESTORE') {
      await writeLast({ ok_at: await readLastOk(), error_code: 'S1' });
      return { kind: 'blocked_s1' };
    }

    // Everything below needs the server copy (restore / pull / merge) or ends in a push.
    let toPush: Chunk | null = local;
    if (action === 'RESTORE' || action === 'PULL_MERGE' || action === 'MERGE_THEN_PUSH' || action === 'MERGE_NEVER_OVERWRITE') {
      const f = await fetchServerChunk(deps, key, m.row!);
      if (!f.ok) return f.out;
      const ap = await applyChunk(key, f.chunk);
      if (action === 'RESTORE' || action === 'PULL_MERGE' || !ap.needsPush) {
        await done(deps, key, stamp, { content_sha256: (await encodeChunk(ap.merged)).contentSha256, rev: m.row!.rev, rows: ap.merged.rows });
        return { kind: 'pulled', changed: ap.changed };
      }
      toPush = ap.merged;
    }
    if (!toPush || toPush.rows === 0) { await clearDirty(key, stamp); return { kind: 'noop' }; }

    const out = await pushOne(deps, key, toPush, m.row);
    if (out === 'lost_race') continue; // re-read, re-merge, retry (B6), at most MAX_CAS_TRIES times
    if (out.kind === 'based') {
      await done(deps, key, stamp, out.base);
      return { kind: 'pushed', rev: out.base.rev };
    }
    return out;
  }
  return failed(deps, key, { status: 409, message: 'lost the race too often' });
}

type PushStep = 'lost_race' | { kind: 'based'; base: { content_sha256: string; rev: number; rows: number } } | PushOutcome;

/** B6 steps 1-5 for one chunk: hash, skip if the manifest already has it, upload, write the manifest LAST, prune. */
async function pushOne(deps: BackupDeps, key: string, chunk: Chunk, old: ManifestRow | null): Promise<PushStep> {
  const enc = await encodeChunk(chunk);
  const path = objectPath(deps.ownerUid, key, enc.sha256);

  if (old && old.content_sha256 === enc.contentSha256) return { kind: 'based', base: { content_sha256: enc.contentSha256, rev: old.rev, rows: enc.rows } };

  const up = await deps.remote.upload(path, enc.bytes);
  if (up.error) return failed(deps, key, up.error);

  const row = { key, sha256: enc.sha256, content_sha256: enc.contentSha256, bytes: enc.bytes.length, rows: enc.rows, schema: chunk.schema };
  let newRev: number;
  let error: RemoteError | undefined;
  if (!old) {
    const r = await deps.remote.insertManifest(row);
    newRev = 1;
    if (!r.error && !r.inserted) return 'lost_race';
    error = r.error;
  } else {
    const r = await deps.remote.updateManifest(old.rev, { ...row, prev_sha256: old.sha256, prev_bytes: old.bytes });
    newRev = old.rev + 1;
    if (!r.error && !r.updated) return 'lost_race';
    error = r.error;
  }

  if (error) {
    // Ambiguous failure (timeout after the server saved): re-read; if the manifest already names OUR bytes, it worked.
    if (classifyError(error) === 'retry') {
      const again = await deps.remote.readManifest(key);
      if (!again.error && sameBytes(again.row, enc.sha256)) { newRev = again.row!.rev; error = undefined; }
    }
    if (error) return failed(deps, key, error);
  }

  // Best effort from here on: a failure never fails the push.
  if (old?.prev_sha256 && old.prev_sha256 !== old.sha256) await deps.remote.remove(objectPath(deps.ownerUid, key, old.prev_sha256)).catch(() => undefined);
  await deps.remote.ingest(key, enc.sha256).catch(() => undefined);
  return { kind: 'based', base: { content_sha256: enc.contentSha256, rev: newRev, rows: enc.rows } };
}

export interface PassResult { tried: string[]; outcomes: Record<string, PushOutcome>; stoppedBy?: 'auth' | 'restore' | 'standalone' }

/**
 * One pass over every dirty key that is due (B4 rule 3). Stops at once on a 401 (auth pause, the other keys are not
 * tried) or while a restore runs. Callers (triggers, Phase 76-b) decide WHEN; this decides WHAT.
 */
export async function runBackupPass(deps: BackupDeps): Promise<PassResult> {
  const res: PassResult = { tried: [], outcomes: {} };
  if ((await readMode()) === 'standalone') return { ...res, stoppedBy: 'standalone' };
  if ((await readRestoreRec())?.status === 'running') return { ...res, stoppedBy: 'restore' };
  const dirty = await readDirty();
  const attempts: Record<string, Attempts | undefined> = {};
  for (const k of dirty) attempts[k] = (await readAttempts(k)) ?? undefined;
  for (const key of dueKeys(dirty, attempts, deps.now())) {
    res.tried.push(key);
    const o = await pushKey(deps, key);
    res.outcomes[key] = o;
    if (o.kind === 'auth') { res.stoppedBy = 'auth'; break; }
  }
  return res;
}

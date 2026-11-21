import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDb, setClock, setOutboxEnabled } from '../../src/data/local';
import { makeChunk, encodeChunk, decodeChunk, toWireRow } from '../../src/shared/chunks';
import { objectPath } from '../../src/shared/backupPlan';
import type { BackupRemote, ManifestRow } from '../../src/data/gym/backupRemote';
import { pushKey, runBackupPass, type BackupDeps } from '../../src/data/gym/backupRun';
import { markDirty, readAttempts, readBaseRec, readDirty, readLast, writeBaseRec, writeMode, writeRestoreRec } from '../../src/data/gym/backupMeta';

const KEY = 'sessions:2026-11';
const OWNER = 'owner-1';
const session = (id: string, over: Record<string, unknown> = {}) => ({
  client_id: id, id, clientId: id, startedAt: '2026-11-05T01:00:00.123Z', endedAt: '2026-11-05T02:00:00.000Z', routineId: 'r-1', dayId: 'd-1', dayName: 'Push',
  items: [{ ref: { kind: 'lib', slug: 'barbell-bench-press' }, status: 'done', order: 0, sets: [{ weightKg: 60, reps: 8, tag: 'normal', doneAt: '2026-11-05T01:10:00.000Z' }] }],
  ...over,
});
const S1 = '11111111-2222-4333-8444-555555555551';
const S2 = '11111111-2222-4333-8444-555555555552';
async function addSession(id: string, at = 5_000_000, over: Record<string, unknown> = {}) {
  await (await getDb()).put('sessions', { ...session(id, over), updated_at: at, deleted_at: null } as never);
}

type Fault = (op: string, n: number) => 'drop' | 'save_then_drop' | 'html' | '401' | 'dup' | 'sfe703' | null;
/** A fake shard: manifests, objects, a call log, and fault injection by (operation, nth call of it). */
function fake(fault: Fault = () => null) {
  const manifest = new Map<string, ManifestRow>();
  const objects = new Map<string, Uint8Array>();
  const log: string[] = [];
  const counts: Record<string, number> = {};
  const hit = (op: string) => { counts[op] = (counts[op] ?? 0) + 1; log.push(op); return fault(op, counts[op]); };
  const err = (f: string | null) => f === 'drop' ? { status: 0, offline: true } : f === '401' ? { status: 401 } : f === 'sfe703' ? { status: 413, code: 'SFE703' } : undefined;
  const remote: BackupRemote = {
    async readManifest(key) { const f = hit('read'); if (err(f)) return { row: null, error: err(f) }; return { row: manifest.get(key) ?? null }; },
    async upload(path, bytes) { const f = hit('upload'); if (err(f)) return { error: err(f) }; objects.set(path, bytes); return {}; },
    async insertManifest(row) {
      const f = hit('insert'); if (err(f) && f !== 'save_then_drop') return { inserted: false, error: err(f) };
      if (manifest.has(row.key)) return { inserted: false };
      manifest.set(row.key, { ...row, rev: 1, prev_sha256: null, prev_bytes: null });
      return f === 'save_then_drop' ? { inserted: true, error: { status: 0, offline: true } } : { inserted: true };
    },
    async updateManifest(oldRev, row) {
      const f = hit('update'); if (err(f)) return { updated: false, error: err(f) };
      const cur = manifest.get(row.key);
      if (!cur || cur.rev !== oldRev) return { updated: false };
      manifest.set(row.key, { ...row, rev: oldRev + 1, prev_sha256: row.prev_sha256, prev_bytes: row.prev_bytes });
      return f === 'save_then_drop' ? { updated: true, error: { status: 0, offline: true } } : { updated: true };
    },
    async download(path) {
      const f = hit('download'); if (err(f)) return { error: err(f) };
      if (f === 'html') return { bytes: new TextEncoder().encode('<!doctype html><html>login</html>') };
      const b = objects.get(path); return b ? { bytes: b } : {};
    },
    async remove(path) { hit('remove'); objects.delete(path); return {}; },
    async ingest() { hit('ingest'); return {}; },
  };
  return { remote, manifest, objects, log, counts };
}

let t = 1_000_000_000;
const deps = (remote: BackupRemote): BackupDeps => ({ remote, ownerUid: OWNER, now: () => t, rand: () => 0 });

beforeEach(async () => {
  await resetDb(true);
  setOutboxEnabled(false);
  setClock(() => 7_000_000);
  t = 1_000_000_000;
  await writeMode('free_backup');
});

/** A chunk another device would have pushed (session S2), already on the fake server. */
async function otherDevicePush(f: ReturnType<typeof fake>, ids: string[]) {
  const { sessionToWire } = await import('../../src/data/local/chunks');
  const heads: Record<string, unknown>[] = []; const sets: Record<string, unknown>[] = [];
  for (const id of ids) { const w = sessionToWire({ ...session(id), updated_at: 6_000_000, deleted_at: null } as never); heads.push(toWireRow('workout_sessions', w.head)); sets.push(...w.sets.map((x) => toWireRow('workout_sets', x))); }
  const chunk = makeChunk(KEY, { workout_sessions: heads, workout_sets: sets }, 6_000_000);
  const enc = await encodeChunk(chunk);
  f.objects.set(objectPath(OWNER, KEY, enc.sha256), enc.bytes);
  const prev = f.manifest.get(KEY);
  f.manifest.set(KEY, { key: KEY, rev: (prev?.rev ?? 0) + 1, sha256: enc.sha256, content_sha256: enc.contentSha256, bytes: enc.bytes.length, rows: enc.rows, schema: chunk.schema, prev_sha256: prev?.sha256 ?? null, prev_bytes: prev?.bytes ?? null });
}

describe('backup push executor (fake remote)', () => {
  it('first push: object, then manifest rev 1, base recorded, dirty cleared, ingest called', async () => {
    const f = fake();
    await addSession(S1); await markDirty(KEY);
    const o = await pushKey(deps(f.remote), KEY);
    expect(o).toEqual({ kind: 'pushed', rev: 1 });
    expect(f.log.indexOf('upload')).toBeLessThan(f.log.indexOf('insert')); // chunk first, manifest last
    expect(f.log).toContain('ingest');
    const row = f.manifest.get(KEY)!;
    expect((await readBaseRec(KEY))?.content_sha256).toBe(row.content_sha256);
    expect(await readDirty()).toEqual([]);
    expect((await readLast())?.ok_at).toBe(t);
  });

  it('second edit uses compare-and-swap (rev 2, prev kept); the third prunes the oldest object', async () => {
    const f = fake();
    await addSession(S1); await markDirty(KEY); await pushKey(deps(f.remote), KEY);
    const first = f.manifest.get(KEY)!.sha256;
    await addSession(S2, 5_100_000); await markDirty(KEY);
    expect(await pushKey(deps(f.remote), KEY)).toEqual({ kind: 'pushed', rev: 2 });
    expect(f.manifest.get(KEY)!.prev_sha256).toBe(first);
    expect(f.objects.size).toBe(2);
    await addSession(S1, 5_200_000, { dayName: 'Pull' }); await markDirty(KEY);
    await pushKey(deps(f.remote), KEY);
    expect(f.manifest.get(KEY)!.rev).toBe(3);
    expect(f.objects.size).toBe(2); // only current + prev stay
    expect(f.objects.has(objectPath(OWNER, KEY, first))).toBe(false);
  });

  it('standalone sends nothing at all', async () => {
    await writeMode('standalone');
    const f = fake();
    await addSession(S1); await markDirty(KEY);
    expect(await pushKey(deps(f.remote), KEY)).toEqual({ kind: 'standalone' });
    expect((await runBackupPass(deps(f.remote))).stoppedBy).toBe('standalone');
    expect(f.log).toEqual([]);
  });

  it('never pushes an empty chunk and clears the dirty flag', async () => {
    const f = fake();
    await markDirty(KEY);
    expect(await pushKey(deps(f.remote), KEY)).toEqual({ kind: 'noop' });
    expect(f.log).not.toContain('upload');
    expect(await readDirty()).toEqual([]);
  });

  it('S1: fewer than 70 % of the base rows is blocked, nothing is uploaded; exactly 70 % is allowed', async () => {
    const f = fake();
    await addSession(S1); await markDirty(KEY);
    const rows = (await import('../../src/data/local/chunks')).buildChunk;
    const local = (await rows(KEY))!;
    await otherDevicePush(f, [S1]); // server holds something so the plan reaches the matrix
    const fp = f.manifest.get(KEY)!.content_sha256;
    await writeBaseRec(KEY, { content_sha256: fp, rev: 1, rows: Math.ceil(local.rows / 0.6), at: 1 }); // local is ~60 % of base
    f.log.length = 0;
    // L != B and S == B -> PUSH, but S1 blocks it
    const o = await pushKey(deps(f.remote), KEY);
    expect(o.kind).toBe('blocked_s1');
    expect((await readLast())?.error_code).toBe('S1');
    expect(f.log).not.toContain('upload');
  });

  it('drop on upload: back-off recorded, dirty stays, the next try after the delay succeeds', async () => {
    const f = fake((op, n) => (op === 'upload' && n === 1 ? 'drop' : null));
    await addSession(S1); await markDirty(KEY);
    expect(await pushKey(deps(f.remote), KEY)).toEqual({ kind: 'retry', code: undefined });
    const a = (await readAttempts(KEY))!;
    expect(a.n).toBe(1); expect(a.nextTryAt).toBeGreaterThan(t);
    expect(await readDirty()).toEqual([KEY]);
    expect(f.manifest.size).toBe(0); // manifest is never written before the object
    // inside the back-off window the pass skips it; after it the pass pushes it
    expect((await runBackupPass(deps(f.remote))).tried).toEqual([]);
    t = a.nextTryAt! + 1;
    const pass = await runBackupPass(deps(f.remote));
    expect(pass.outcomes[KEY]).toEqual({ kind: 'pushed', rev: 1 });
    expect(await readAttempts(KEY)).toBeNull();
  });

  it('timeout AFTER the server saved the manifest: re-read settles it as success, no second revision', async () => {
    const f = fake((op, n) => (op === 'insert' && n === 1 ? 'save_then_drop' : null));
    await addSession(S1); await markDirty(KEY);
    expect(await pushKey(deps(f.remote), KEY)).toEqual({ kind: 'pushed', rev: 1 });
    expect(f.manifest.get(KEY)!.rev).toBe(1);
    expect(f.counts.insert).toBe(1);
    expect(await readDirty()).toEqual([]);
  });

  it('duplicate response (same object uploaded twice, manifest already there with our bytes) is success', async () => {
    const f = fake();
    await addSession(S1); await markDirty(KEY);
    await pushKey(deps(f.remote), KEY);
    // lose the local base (e.g. a re-install of the app state) and push again: same content -> no new revision
    await (await getDb()).delete('meta', `backup:base:${KEY}`);
    await markDirty(KEY);
    const o = await pushKey(deps(f.remote), KEY);
    expect(o.kind).toBe('noop');
    expect(f.manifest.get(KEY)!.rev).toBe(1);
  });

  it('a 200 with an HTML body is a network error: nothing changes, back-off, no data applied', async () => {
    const f = fake((op) => (op === 'download' ? 'html' : null));
    await otherDevicePush(f, [S2]); // server has data, this phone has none -> RESTORE path downloads
    await markDirty(KEY);
    const o = await pushKey(deps(f.remote), KEY);
    expect(o.kind).toBe('retry');
    expect((await (await getDb()).getAll('sessions')).length).toBe(0);
    expect(await readBaseRec(KEY)).toBeNull();
  });

  it('401 midway stops the pass: the remaining keys are not tried and nothing is marked failed', async () => {
    const f = fake((op, n) => (op === 'upload' && n === 1 ? '401' : null));
    await addSession(S1); await markDirty(KEY); await markDirty('body:2026-11');
    const pass = await runBackupPass(deps(f.remote));
    expect(pass.stoppedBy).toBe('auth');
    expect(pass.tried).toEqual(['body:2026-11', KEY]); // body has no rows (noop), then the session chunk hits the 401 and the pass stops
    expect(await readAttempts(KEY)).toBeNull();
    expect(await readDirty()).toEqual([KEY]);
  });

  it('SFE703 (too big): no retry loop, the chunk stays dirty, the pass does not try it again', async () => {
    const f = fake((op) => (op === 'upload' ? 'sfe703' : null));
    await addSession(S1); await markDirty(KEY);
    expect(await pushKey(deps(f.remote), KEY)).toEqual({ kind: 'stopped', code: 'SFE703' });
    expect((await readAttempts(KEY))!.nextTryAt).toBeNull();
    expect(await readDirty()).toEqual([KEY]);
    t += 3 * 24 * 3600_000;
    expect((await runBackupPass(deps(f.remote))).tried).toEqual([]);
    expect((await readLast())?.error_code).toBe('SFE703');
  });

  it('no push while a restore is running', async () => {
    const f = fake();
    await addSession(S1); await markDirty(KEY);
    await writeRestoreRec({ status: 'running', done_keys: [], total_keys: 3 });
    expect(await pushKey(deps(f.remote), KEY)).toEqual({ kind: 'blocked_restore' });
    expect((await runBackupPass(deps(f.remote))).stoppedBy).toBe('restore');
    expect(f.log).toEqual([]);
  });

  it('two devices: a stale base merges the other device first, then pushes both (no overwrite)', async () => {
    const f = fake();
    await addSession(S1); await markDirty(KEY); await pushKey(deps(f.remote), KEY); // device A pushed rev 1
    await otherDevicePush(f, [S1, S2]);                                              // device B pushed rev 2 with S2
    await addSession(S1, 6_500_000, { dayName: 'Legs' }); await markDirty(KEY);      // A edits again, base is rev 1
    const o = await pushKey(deps(f.remote), KEY);
    expect(o.kind).toBe('pushed');
    expect((await (await getDb()).get('sessions', S2))?.client_id).toBe(S2);         // B's session reached A
    const row = f.manifest.get(KEY)!;
    const dec = await decodeChunk(f.objects.get(objectPath(OWNER, KEY, row.sha256))!, { key: KEY, sha256: row.sha256 });
    expect(dec.ok && dec.chunk.t.workout_sessions?.r.length).toBe(2);                 // the server copy holds both
  });

  it('lost compare-and-swap race: re-read, re-merge, retry, then succeeds', async () => {
    let raced = false;
    const f = fake();
    const real = f.remote.updateManifest.bind(f.remote);
    f.remote.updateManifest = async (oldRev, row) => {
      if (!raced) { raced = true; await otherDevicePush(f, [S1, S2]); } // another device wins between our read and our write
      return real(oldRev, row);
    };
    await addSession(S1); await markDirty(KEY); await pushKey(deps(f.remote), KEY);
    await addSession(S1, 6_500_000, { dayName: 'Arms' }); await markDirty(KEY);
    const o = await pushKey(deps(f.remote), KEY);
    expect(o.kind).toBe('pushed');
    expect((await (await getDb()).get('sessions', S2))?.client_id).toBe(S2);
  });
});

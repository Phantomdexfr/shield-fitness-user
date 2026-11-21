import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDb, setClock, setOutboxEnabled } from '../../src/data/local';
import { makeChunk, encodeChunk, toWireRow } from '../../src/shared/chunks';
import { objectPath } from '../../src/shared/backupPlan';
import type { ManifestRow, RestoreRemote } from '../../src/data/gym/backupRemote';
import { pushKey, type BackupDeps } from '../../src/data/gym/backupRun';
import { runRestore } from '../../src/data/gym/backupRestore';
import { readBaseRec, readRestoreRec, writeMode, readLast } from '../../src/data/gym/backupMeta';

const OWNER = 'owner-1';
const KEYS: [string, string, string] = ['sessions:2026-11', 'sessions:2026-10', 'sessions:2026-09'];
const ID = (n: number) => `11111111-2222-4333-8444-55555555555${n}`;
const session = (id: string, startedAt: string) => ({
  client_id: id, id, clientId: id, startedAt, endedAt: startedAt, routineId: 'r-1', dayId: 'd-1', dayName: 'Push',
  items: [{ ref: { kind: 'lib', slug: 'barbell-bench-press' }, status: 'done', order: 0, sets: [{ weightKg: 60, reps: 8, tag: 'normal', doneAt: startedAt }] }],
});

/** A fake shard with a manifest list; `fault(op, n)` can drop or 401 a call. */
function fake(fault: (op: string, n: number) => 'drop' | '401' | 'html' | null = () => null) {
  const manifest = new Map<string, ManifestRow>();
  const objects = new Map<string, Uint8Array>();
  const counts: Record<string, number> = {};
  const hit = (op: string) => { counts[op] = (counts[op] ?? 0) + 1; return fault(op, counts[op]); };
  const err = (f: string | null) => f === 'drop' ? { status: 0, offline: true } : f === '401' ? { status: 401 } : undefined;
  const remote: RestoreRemote = {
    async listManifests() { const f = hit('list'); if (err(f)) return { rows: [], error: err(f) }; return { rows: [...manifest.values()] }; },
    async readManifest(key) { return { row: manifest.get(key) ?? null }; },
    async upload(path, bytes) { objects.set(path, bytes); return {}; },
    async insertManifest() { return { inserted: false }; },
    async updateManifest() { return { updated: false }; },
    async download(path) {
      const f = hit('download'); if (err(f)) return { error: err(f) };
      if (f === 'html') return { bytes: new TextEncoder().encode('<!doctype html><html>login</html>') };
      const b = objects.get(path); return b ? { bytes: b } : {};
    },
    async remove() { return {}; },
    async ingest() { return {}; },
  };
  return { remote, manifest, objects, counts };
}

async function serverHas(f: ReturnType<typeof fake>, key: string, id: string, startedAt: string) {
  const { sessionToWire } = await import('../../src/data/local/chunks');
  const w = sessionToWire({ ...session(id, startedAt), updated_at: 6_000_000, deleted_at: null } as never);
  const chunk = makeChunk(key, { workout_sessions: [toWireRow('workout_sessions', w.head)], workout_sets: w.sets.map((x) => toWireRow('workout_sets', x)) }, 6_000_000);
  const enc = await encodeChunk(chunk);
  f.objects.set(objectPath(OWNER, key, enc.sha256), enc.bytes);
  f.manifest.set(key, { key, rev: 1, sha256: enc.sha256, content_sha256: enc.contentSha256, bytes: enc.bytes.length, rows: enc.rows, schema: chunk.schema, prev_sha256: null, prev_bytes: null });
}

let t = 1_000_000_000;
const deps = (remote: RestoreRemote): BackupDeps & { remote: RestoreRemote } => ({ remote, ownerUid: OWNER, now: () => t, rand: () => 0 });
const sessionCount = async () => (await (await getDb()).getAll('sessions')).length;

beforeEach(async () => {
  await resetDb(true);
  setOutboxEnabled(false);
  setClock(() => 7_000_000);
  t = 1_000_000_000;
  await writeMode('free_backup');
});

describe('resumable restore (fake remote)', () => {
  it('restores newest month first, records done_keys after each key, ends done with bases recorded', async () => {
    const f = fake();
    await serverHas(f, KEYS[2], ID(3), '2026-09-05T01:00:00.000Z');
    await serverHas(f, KEYS[0], ID(1), '2026-11-05T01:00:00.000Z');
    await serverHas(f, KEYS[1], ID(2), '2026-10-05T01:00:00.000Z');
    const seen: string[] = [];
    const out = await runRestore(deps(f.remote), { onProgress: (d, n) => seen.push(`${d}/${n}`) });
    expect(out).toEqual({ kind: 'done', restored: 3, total: 3 });
    expect(seen).toEqual(['1/3', '2/3', '3/3']);
    expect((await readRestoreRec())!.done_keys).toEqual([KEYS[0], KEYS[1], KEYS[2]]); // newest first
    expect(await sessionCount()).toBe(3);
    expect(await readBaseRec(KEYS[0])).toMatchObject({ rev: 1 });
  });

  it('kill after 1 key, then resume: only the rest is fetched, nothing twice', async () => {
    const f = fake();
    for (const [i, k] of KEYS.entries()) await serverHas(f, k, ID(i + 1), `2026-${11 - i}-05T01:00:00.000Z`.replace('-9-', '-09-'));
    const first = await runRestore(deps(f.remote), { stopAfter: 1 });
    expect(first).toMatchObject({ kind: 'paused', reason: 'stopped', done: 1, total: 3 });
    expect((await readRestoreRec())!.status).toBe('running');
    const downloadsBefore = f.counts.download ?? 0;
    const second = await runRestore(deps(f.remote));
    expect(second).toEqual({ kind: 'done', restored: 3, total: 3 });
    expect((f.counts.download ?? 0) - downloadsBefore).toBe(2); // only the two keys left
    expect(await sessionCount()).toBe(3);
  });

  it('pushes are blocked while running, and allowed again once done', async () => {
    const f = fake();
    await serverHas(f, KEYS[0], ID(1), '2026-11-05T01:00:00.000Z');
    await serverHas(f, KEYS[1], ID(2), '2026-10-05T01:00:00.000Z');
    await runRestore(deps(f.remote), { stopAfter: 1 });
    expect((await pushKey(deps(f.remote), KEYS[0])).kind).toBe('blocked_restore');
    await runRestore(deps(f.remote));
    // Not blocked any more. (A hand-built fixture chunk may not round-trip byte for byte, so the pass can do one harmless pull-merge.)
    expect(['noop', 'pulled']).toContain((await pushKey(deps(f.remote), KEYS[0])).kind);
  });

  it('a dropped download pauses (stays running); a 401 pauses with reason auth; resume then finishes', async () => {
    const f = fake((op, n) => (op === 'download' && n === 2 ? 'drop' : op === 'download' && n === 4 ? '401' : null));
    for (const [i, k] of KEYS.entries()) await serverHas(f, k, ID(i + 1), `2026-${11 - i}-05T01:00:00.000Z`.replace('-9-', '-09-'));
    expect(await runRestore(deps(f.remote))).toMatchObject({ kind: 'paused', reason: 'offline', done: 1 });
    expect(await runRestore(deps(f.remote))).toMatchObject({ kind: 'paused', reason: 'auth', done: 2 });
    expect(await runRestore(deps(f.remote))).toEqual({ kind: 'done', restored: 3, total: 3 });
  });

  it('an HTML 200 is a network error: paused, nothing written for that key', async () => {
    const f = fake((op, n) => (op === 'download' && n === 1 ? 'html' : null));
    await serverHas(f, KEYS[0], ID(1), '2026-11-05T01:00:00.000Z');
    const out = await runRestore(deps(f.remote));
    expect(out).toMatchObject({ kind: 'paused', reason: 'offline', done: 0 });
    expect(await sessionCount()).toBe(0);
    expect((await readRestoreRec())!.status).toBe('running');
  });

  it('a bad object (hash mismatch on both revisions) fails the restore and changes nothing', async () => {
    const f = fake();
    await serverHas(f, KEYS[0], ID(1), '2026-11-05T01:00:00.000Z');
    const row = f.manifest.get(KEYS[0])!;
    f.objects.set(objectPath(OWNER, KEYS[0], row.sha256), new Uint8Array([1, 2, 3, 4]));
    const out = await runRestore(deps(f.remote));
    expect(out.kind).toBe('failed');
    expect((await readRestoreRec())!.status).toBe('failed');
    expect((await readLast())!.error_code).toBe('SFE706');
    expect(await sessionCount()).toBe(0);
  });

  it('merges, never overwrites: a local session survives and its key is marked for a push', async () => {
    const f = fake();
    await serverHas(f, KEYS[0], ID(1), '2026-11-05T01:00:00.000Z');
    const { sessionToWire } = await import('../../src/data/local/chunks');
    void sessionToWire;
    await (await getDb()).put('sessions', { ...session(ID(2), '2026-11-06T01:00:00.000Z'), updated_at: 5_000_000, deleted_at: null } as never);
    await runRestore(deps(f.remote));
    expect(await sessionCount()).toBe(2);
    const { readDirty } = await import('../../src/data/gym/backupMeta');
    expect(await readDirty()).toContain(KEYS[0]);
  });

  it('an empty account restores nothing and leaves no record', async () => {
    const f = fake();
    expect(await runRestore(deps(f.remote))).toEqual({ kind: 'nothing' });
    expect(await readRestoreRec()).toBeNull();
  });
});

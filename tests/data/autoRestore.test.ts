import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDb, setClock, setOutboxEnabled } from '../../src/data/local';
import { setPolicyResolver } from '../../src/app/flags';
import { makeChunk, encodeChunk, toWireRow } from '../../src/shared/chunks';
import { objectPath } from '../../src/shared/backupPlan';
import type { ManifestRow, RestoreRemote } from '../../src/data/gym/backupRemote';
import type { BackupDeps } from '../../src/data/gym/backupRun';
import { readMode, readRestoreRec } from '../../src/data/gym/backupMeta';
import { autoRestoreIfNeeded, assessRestore, getRestoreView, runChunkRestore, type RestoreCtx } from '../../src/data/gym/autoRestore';
import { readBase, readOwner, writeBase, writeOwner } from '../../src/data/gym/restore';
import { readCursor, writeCursor } from '../../src/data/gym/connection';
import { saveConnection, type Connection } from '../../src/data/gym/connection';
import type { Remote } from '../../src/data/gym/types';

const OWNER = 'owner-1';
const ID = (n: number) => `11111111-2222-4333-8444-55555555555${n}`;
const session = (id: string, startedAt: string) => ({
  client_id: id, id, clientId: id, startedAt, endedAt: startedAt, routineId: 'r-1', dayId: 'd-1', dayName: 'Push',
  items: [{ ref: { kind: 'lib', slug: 'barbell-bench-press' }, status: 'done', order: 0, sets: [{ weightKg: 60, reps: 8, tag: 'normal', doneAt: startedAt }] }],
});

function fake(fault: (op: string, n: number) => 'drop' | null = () => null) {
  const manifest = new Map<string, ManifestRow>();
  const objects = new Map<string, Uint8Array>();
  const counts: Record<string, number> = {};
  const hit = (op: string) => { counts[op] = (counts[op] ?? 0) + 1; return fault(op, counts[op]); };
  const remote: RestoreRemote = {
    async listManifests() { if (hit('list')) return { rows: [], error: { status: 0, offline: true } }; return { rows: [...manifest.values()] }; },
    async readManifest(key) { return { row: manifest.get(key) ?? null }; },
    async upload() { return {}; },
    async insertManifest() { return { inserted: false }; },
    async updateManifest() { return { updated: false }; },
    async download(path) { if (hit('download')) return { error: { status: 0, offline: true } }; const b = objects.get(path); return b ? { bytes: b } : {}; },
    async remove() { return {}; },
    async ingest() { return {}; },
  };
  return { remote, manifest, objects, counts };
}
async function put(f: ReturnType<typeof fake>, key: string, id: string, startedAt: string, schema = 1) {
  const { sessionToWire } = await import('../../src/data/local/chunks');
  const w = sessionToWire({ ...session(id, startedAt), updated_at: 6_000_000, deleted_at: null } as never);
  const chunk = { ...makeChunk(key, { workout_sessions: [toWireRow('workout_sessions', w.head)], workout_sets: w.sets.map((x) => toWireRow('workout_sets', x)) }, 6_000_000), schema };
  const enc = await encodeChunk(chunk);
  f.objects.set(objectPath(OWNER, key, enc.sha256), enc.bytes);
  f.manifest.set(key, { key, rev: 1, sha256: enc.sha256, content_sha256: enc.contentSha256, bytes: enc.bytes.length, rows: enc.rows, schema, prev_sha256: null, prev_bytes: null });
}

const conn = (o: Partial<Connection> = {}): Connection => ({
  config: { v: 1, name: 'Gym', contract: '1.1.0', core: { url: 'https://c.supabase.co', anon: 'anon-anon' }, train: [{ id: 't1', url: 'https://t.supabase.co', anon: 'anon-anon' }], functions: 'https://f.supabase.co', issued: '2026-11-21' },
  host: 'c.supabase.co', connectedAt: 1, signedIn: true, mustChangePassword: false, versionMismatch: false, trainShard: 't1', memberCode: 'm1', ...o,
});
const gymRemote = (session = true): Remote => ({
  hasSession: async () => session,
  backupAccess: async () => ({ url: 'u', anon: 'a', shardId: 't1', ownerUid: OWNER, memberId: 'mem', getToken: async () => 'tok' }),
}) as unknown as Remote;
let f: ReturnType<typeof fake>;
const ctx = (o: Partial<RestoreCtx> & { conn?: Connection; session?: boolean } = {}): RestoreCtx => ({
  remote: gymRemote(o.session ?? true), conn: o.conn ?? conn(),
  build: () => ({ remote: f.remote, deps: { remote: f.remote, ownerUid: OWNER, now: () => 1_000_000_000, rand: () => 0 } as BackupDeps }),
});
const sessionCount = async () => (await (await getDb()).getAll('sessions')).length;

beforeEach(async () => {
  await resetDb(true);
  setOutboxEnabled(false);
  setClock(() => 7_000_000);
  setPolicyResolver((k, d) => (k === 'cloud_backup' || k === 'auto_restore' ? true : d));
  await saveConnection(conn());
  f = fake();
  await put(f, 'sessions:2026-11', ID(1), '2026-11-05T01:00:00.000Z');
  await put(f, 'sessions:2026-10', ID(2), '2026-10-05T01:00:00.000Z');
});
afterEach(() => setPolicyResolver(null));

describe('new-device auto restore (fake remote)', () => {
  it('empty phone: restores by itself, writes owner stamp + base, sets mode connected, view = done', async () => {
    const r = await autoRestoreIfNeeded(ctx());
    expect(r.outcome).toEqual({ kind: 'done', restored: 2, total: 2 });
    expect(await sessionCount()).toBe(2);
    expect(await readOwner()).toBe('member:M1');
    expect(await readBase()).toBeGreaterThan(0);
    expect(await readMode()).toBe('connected');
    expect(getRestoreView()).toEqual({ s: 'done', restored: 2 });
  });
  it('1: password change pending or signed out = nothing is fetched', async () => {
    expect((await autoRestoreIfNeeded(ctx({ conn: conn({ mustChangePassword: true }) }))).decision).toEqual({ kind: 'wait', why: 'password' });
    expect((await autoRestoreIfNeeded(ctx({ session: false }))).decision).toEqual({ kind: 'wait', why: 'signin' });
    expect(f.counts.list ?? 0).toBe(0);
    expect(await sessionCount()).toBe(0);
  });
  it('2: another member stamped on the phone = owner decision, nothing restored', async () => {
    await writeOwner('member:OTHER');
    const r = await autoRestoreIfNeeded(ctx());
    expect(r.decision).toEqual({ kind: 'owner' });
    expect(await sessionCount()).toBe(0);
  });
  it('3: phone has data = offer only; the button merges and keeps the local row', async () => {
    const { sessionsRepo } = await import('../../src/data/local');
    await sessionsRepo.put(session('local-1', '2026-11-06T01:00:00.000Z') as never);
    const r = await autoRestoreIfNeeded(ctx());
    expect(r.decision.kind).toBe('offer');
    expect(await sessionCount()).toBe(1);
    expect(await runChunkRestore(r)).toMatchObject({ kind: 'done' });
    expect(await sessionCount()).toBe(3);
  });
  it('4: killed run resumes (record stays running, then the next call finishes)', async () => {
    const a = await assessRestore(ctx());
    const { runRestore } = await import('../../src/data/gym/backupRestore');
    await runRestore({ ...a.rt!.deps, remote: a.rt!.remote }, { stopAfter: 1 });
    expect((await readRestoreRec())!.status).toBe('running');
    const r = await autoRestoreIfNeeded(ctx());
    expect(r.decision).toMatchObject({ kind: 'start', resume: true });
    expect(r.outcome).toMatchObject({ kind: 'done' });
    expect(await sessionCount()).toBe(2);
  });
  it('5 [A-R4]: an expired member still restores', async () => {
    const r = await autoRestoreIfNeeded({ ...ctx(), memberStatus: 'expired' });
    expect(r.outcome).toMatchObject({ kind: 'done' });
  });
  it('7: shard missing from the config = closed, no request', async () => {
    const r = await autoRestoreIfNeeded(ctx({ conn: conn({ trainShard: 'gone' }) }));
    expect(r.decision).toEqual({ kind: 'closed' });
    expect(f.counts.list ?? 0).toBe(0);
  });
  it('11: a chunk from a newer schema = update the app, nothing applied', async () => {
    await put(f, 'sessions:2026-09', ID(3), '2026-09-07T01:00:00.000Z', 2);
    const r = await autoRestoreIfNeeded(ctx());
    expect(r.decision).toEqual({ kind: 'update' });
    expect(await sessionCount()).toBe(0);
  });
  it('12: an empty phone with surviving pull cursors gets them reset before the restore', async () => {
    await writeCursor('workout_sessions', { u: '2026-01-01T00:00:00.000Z', t: 'x' } as never);
    expect(await readCursor('workout_sessions')).toBeTruthy();
    await autoRestoreIfNeeded(ctx());
    expect(await readCursor('workout_sessions')).toBeFalsy();
  });
  it('offline during the list = wait (nothing changed); a dropped download pauses, then resumes', async () => {
    f = fake((op, n) => (op === 'list' && n === 1) || (op === 'download' && n === 2) ? 'drop' : null);
    await put(f, 'sessions:2026-11', ID(1), '2026-11-05T01:00:00.000Z');
    await put(f, 'sessions:2026-10', ID(2), '2026-10-05T01:00:00.000Z');
    expect((await autoRestoreIfNeeded(ctx())).decision).toEqual({ kind: 'wait', why: 'offline' });
    const second = await autoRestoreIfNeeded(ctx());
    expect(second.outcome).toMatchObject({ kind: 'paused', reason: 'offline', done: 1 });
    expect(getRestoreView()).toMatchObject({ s: 'paused' });
    expect((await autoRestoreIfNeeded(ctx())).outcome).toMatchObject({ kind: 'done' });
    expect(await sessionCount()).toBe(2);
  });
  it('auto_restore off = button only; cloud_backup off = nothing, no request', async () => {
    setPolicyResolver((k, d) => (k === 'cloud_backup' ? true : k === 'auto_restore' ? false : d));
    expect((await autoRestoreIfNeeded(ctx())).decision.kind).toBe('offer');
    expect(await sessionCount()).toBe(0);
    setPolicyResolver((k, d) => (k === 'cloud_backup' ? false : d));
    f.counts.list = 0;
    expect((await autoRestoreIfNeeded(ctx())).decision).toEqual({ kind: 'none' });
    expect(f.counts.list).toBe(0);
  });
});
void writeBase;

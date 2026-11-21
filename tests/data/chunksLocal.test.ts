import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, listOutbox, resetDb, routinesRepo, sessionsRepo, setOutboxEnabled, setClock, marksRepo } from '../../src/data/local';
import { applyChunk, buildAllChunks, buildChunk } from '../../src/data/local/chunks';
import { decodeChunk, encodeChunk } from '../../src/shared/chunks';

const SID = '11111111-2222-4333-8444-555555555555';
const session = (over: Record<string, unknown> = {}) => ({
  client_id: SID, id: SID, clientId: SID,
  startedAt: '2026-11-05T01:00:00.123Z', endedAt: '2026-11-05T02:00:00.000Z', routineId: 'r-1', dayId: 'd-1', dayName: 'Push',
  items: [
    { ref: { kind: 'lib', slug: 'barbell-bench-press' }, status: 'done', order: 0, plan: { sets: 3, repMin: 5, repMax: 8, restSec: 90 }, sets: [
      { weightKg: 60, reps: 8, tag: 'normal', doneAt: '2026-11-05T01:10:00.000Z', rpe: 8 },
      { weightKg: 60, reps: 7, tag: 'drop', doneAt: '2026-11-05T01:12:00.000Z' } ] },
    { ref: { kind: 'lib', slug: 'treadmill' }, status: 'done', order: 1, sets: [{ weightKg: null, reps: null, tag: 'normal', doneAt: '2026-11-05T01:40:00.000Z', distanceM: 2000 }] },
    { ref: { kind: 'lib', slug: 'lat-pulldown' }, status: 'skipped', skipReason: 'busy', order: 2, sets: [] },
  ],
  ...over,
});

beforeEach(async () => {
  await resetDb(true);
  setOutboxEnabled(false);
  setClock(() => 7_000_000);
});

async function seed() {
  const db = await getDb();
  await db.put('sessions', { ...session(), updated_at: 5_000_000, deleted_at: null } as never);
  await db.put('routines', { client_id: 'r1', name: 'Push', updated_at: 4_000_000, deleted_at: null } as never);
  await db.put('routines', { client_id: 'gym-prog:x', name: 'Gym', followed: true, updated_at: 4_000_000, deleted_at: null } as never);
  await db.put('marks', { client_id: 'mk:biceps', muscle: 'biceps', kind: 'avoid', updated_at: 3_000_000, deleted_at: null } as never);
  await db.put('bodyStats', { client_id: 'bw:2026-11-02', day: '2026-11-02', kg: 80, updated_at: 3_000_000, deleted_at: null } as never);
}

describe('local chunk helpers', () => {
  it('builds sessions:2026-11, body:2026-11 and small; followed routines stay out', async () => {
    await seed();
    const { chunks, problems } = await buildAllChunks();
    expect(problems).toEqual([]);
    expect(chunks.map((c) => c.key)).toEqual(['body:2026-11', 'sessions:2026-11', 'small']);
    expect(await buildChunk('sessions:2026-10')).toBeNull();
    const small = chunks.find((c) => c.key === 'small')!;
    expect(small.rows).toBe(2); // one routine + one mark, no followed program
    expect(chunks.find((c) => c.key === 'sessions:2026-11')!.rows).toBe(4); // head + 2 sets + 1 cardio
  });

  it('round trip: wipe, apply from decoded bytes, the session comes back whole and nothing is queued', async () => {
    await seed();
    const before = (await (await getDb()).get('sessions', SID)) as unknown as Record<string, unknown>;
    const built = await Promise.all(['sessions:2026-11', 'body:2026-11', 'small'].map(async (k) => encodeChunk((await buildChunk(k))!)));
    await resetDb(true);
    setOutboxEnabled(true);
    for (const [i, k] of ['sessions:2026-11', 'body:2026-11', 'small'].entries()) {
      const r = await decodeChunk(built[i]!.bytes, { key: k, sha256: built[i]!.sha256 });
      expect(r.ok).toBe(true);
      if (r.ok) expect((await applyChunk(k, r.chunk)).changed).toBeGreaterThan(0);
    }
    const after = (await (await getDb()).get('sessions', SID)) as unknown as Record<string, unknown>;
    expect(after).toEqual(before);
    expect((await routinesRepo.get('r1'))?.name).toBe('Push');
    expect((await marksRepo.list()).length).toBe(1);
    expect(await listOutbox()).toHaveLength(0);
    // applying the same chunk again changes nothing
    const again = await decodeChunk(built[0]!.bytes, { key: 'sessions:2026-11' });
    if (again.ok) expect((await applyChunk('sessions:2026-11', again.chunk)).changed).toBe(0);
  });

  it('a local tombstone is not revived and a done session is not reverted', async () => {
    await seed();
    const old = await encodeChunk((await buildChunk('sessions:2026-11'))!);
    const db = await getDb();
    await db.put('sessions', { ...session(), updated_at: 6_000_000, deleted_at: 6_000_000 } as never);
    const r = await decodeChunk(old.bytes, { key: 'sessions:2026-11' });
    if (!r.ok) throw new Error('decode');
    const res = await applyChunk('sessions:2026-11', r.chunk);
    expect(res.changed).toBe(0);
    expect(((await db.get('sessions', SID)) as unknown as { deleted_at: number }).deleted_at).toBe(6_000_000);
    await sessionsRepo.list();
  });
});

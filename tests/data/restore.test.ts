import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, isOutboxEnabled, listOutbox, resetDb, routinesRepo, sessionsRepo, setOutboxEnabled } from '../../src/data/local';
import { writeCursor, readCursor, __resetConnectionCache } from '../../src/data/gym/connection';
import { __resetEngine, type EngineDeps } from '../../src/data/gym/syncEngine';
import { checkRestore, liveRowCount, readBase, readOwner, runRestore, serverHasData, stampOwnerIfNone, writeBase, writeOwner } from '../../src/data/gym/restore';
import { saveConnection } from '../../src/data/gym/connection';
import type { Remote } from '../../src/data/gym/types';

const ISO = (n: number) => new Date(n).toISOString();
const SESSION = { client_id: 's1', updated_at: ISO(2000), started_at: 1000, ended_at: 1500, deleted_at: null, member_id: 'm' };
const SETS = [
  { client_id: 's1:0:0', session_client_id: 's1', exercise_ref: 'barbell-bench-press', item_order: 0, set_index: 0, weight: 60, reps: 8, updated_at: ISO(2000) },
  { client_id: 's1:0:1', session_client_id: 's1', exercise_ref: 'barbell-bench-press', item_order: 0, set_index: 1, weight: 60, reps: 7, updated_at: ISO(2000) },
];
const ROUTINE = { client_id: 'r1', name: 'Push', updated_at: ISO(3000), deleted_at: null, member_id: 'm' };

/** A fake server that pages by `limit`, honours a cursor on (updated_at, client_id) loosely, and can fail on one table. */
function fake(data: Record<string, Record<string, unknown>[]>, failTable?: string): Remote & { pulls: string[] } {
  const pulls: string[] = [];
  const r = {
    pulls,
    async pull(table: string, _cols: string, cursor: { u: string; t: string } | null, limit: number) {
      pulls.push(`${table}:${cursor ? cursor.t : '-'}`);
      if (table === failTable) return { rows: [], error: { status: 0, offline: true } };
      const all = (data[table] ?? []).slice().sort((a, b) => String(a.client_id).localeCompare(String(b.client_id)));
      const rows = cursor ? all.filter((x) => String(x.client_id) > cursor.t) : all;
      return { rows: rows.slice(0, limit) };
    },
  };
  return r as unknown as Remote & { pulls: string[] };
}
const deps = (remote: Remote): EngineDeps => ({ remote, now: () => 5000, rand: () => 0, online: () => true });

beforeEach(async () => {
  await resetDb(true);
  __resetConnectionCache();
  __resetEngine();
  setOutboxEnabled(false);
});

describe('restore (fake remote)', () => {
  it('empty phone + server data: refills sessions with their sets, routines, and stamps the owner', async () => {
    await saveConnection({ config: {} as never, host: 'h', connectedAt: 1, signedIn: true, mustChangePassword: false, versionMismatch: false, memberCode: 'ab12' });
    const remote = fake({ workout_sessions: [SESSION], workout_sets: SETS, routines: [ROUTINE] });
    expect(await serverHasData(remote)).toBe(true);
    expect(await checkRestore(true)).toBe('restore_offer');
    const res = await runRestore(deps(remote));
    expect(res.ok).toBe(true);
    const s = await sessionsRepo.get('s1');
    const items = (s as unknown as { items: { ref: { slug: string }; sets: { weight: number; __i?: number }[] }[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]!.ref.slug).toBe('barbell-bench-press');
    expect(items[0]!.sets.map((x) => x.weight)).toEqual([60, 60]);
    expect(items[0]!.sets[0]).not.toHaveProperty('__i');
    expect((await routinesRepo.get('r1'))?.name).toBe('Push');
    expect(await readOwner()).toBe('member:AB12');
    expect(await readBase()).toBe(await liveRowCount());
    expect(await checkRestore(true)).toBe('ok');
  });

  it('restored rows are never pushed back (outbox stays empty) and the push switch is put back', async () => {
    setOutboxEnabled(true);
    await runRestore(deps(fake({ workout_sessions: [SESSION], routines: [ROUTINE] })));
    expect(await listOutbox()).toHaveLength(0);
    expect(isOutboxEnabled()).toBe(true);
  });

  it('rows gone but cursors kept: the cursors are reset so the pull fetches everything again', async () => {
    await writeCursor('workout_sessions', { u: 'x', t: 'zzzz' });
    await writeCursor('routines', { u: 'x', t: 'zzzz' });
    const remote = fake({ workout_sessions: [SESSION], routines: [ROUTINE] });
    const res = await runRestore(deps(remote));
    expect(res.ok).toBe(true);
    expect(remote.pulls).toContain('workout_sessions:-'); // started from no cursor
    expect(await sessionsRepo.get('s1')).toBeTruthy();
  });

  it('shrunk phone: base says 10 rows, phone has 2 -> block_push', async () => {
    await writeBase(10);
    await routinesRepo.put({ client_id: 'a', name: 'A' } as never);
    await routinesRepo.put({ client_id: 'b', name: 'B' } as never);
    await writeOwner('member:AB12');
    await saveConnection({ config: {} as never, host: 'h', connectedAt: 1, signedIn: true, mustChangePassword: false, versionMismatch: false, memberCode: 'ab12' });
    expect(await checkRestore(true)).toBe('block_push');
  });

  it('different member on the same phone -> different_owner, and the stamp is never replaced', async () => {
    await writeOwner('member:OLD1');
    await saveConnection({ config: {} as never, host: 'h', connectedAt: 1, signedIn: true, mustChangePassword: false, versionMismatch: false, memberCode: 'new2' });
    expect(await checkRestore(true)).toBe('different_owner');
    await stampOwnerIfNone();
    expect(await readOwner()).toBe('member:OLD1');
  });

  it('merge, not overwrite: a newer local row and a local deletion survive the restore; missing rows come back', async () => {
    await routinesRepo.put({ client_id: 'r1', name: 'Local newer' } as never); // updated_at = now (large)
    await routinesRepo.put({ client_id: 'r2', name: 'Doomed' } as never);
    await routinesRepo.remove('r2');
    const remote = fake({
      routines: [{ ...ROUTINE }, { client_id: 'r2', name: 'Doomed', updated_at: ISO(Date.now() + 10_000), deleted_at: null }, { client_id: 'r3', name: 'Only on server', updated_at: ISO(3000), deleted_at: null }],
    });
    const res = await runRestore(deps(remote));
    expect(res.ok).toBe(true);
    expect((await routinesRepo.get('r1'))?.name).toBe('Local newer');
    expect(await routinesRepo.get('r2')).toBeUndefined(); // local tombstone is final
    expect((await routinesRepo.get('r3'))?.name).toBe('Only on server');
    const db = await getDb();
    expect(((await db.get('routines', 'r2')) as { deleted_at: number | null }).deleted_at).not.toBeNull();
  });

  it('a second run changes nothing (resumable, idempotent)', async () => {
    const remote = fake({ workout_sessions: [SESSION], workout_sets: SETS, routines: [ROUTINE] });
    await runRestore(deps(remote));
    const before = JSON.stringify(await sessionsRepo.get('s1'));
    const again = await runRestore(deps(remote));
    expect(again.added).toBe(0);
    expect(JSON.stringify(await sessionsRepo.get('s1'))).toBe(before);
  });

  it('a stop in the middle reports why and keeps what was stored; the next run completes it', async () => {
    const data = { workout_sessions: [SESSION], workout_sets: SETS, routines: [ROUTINE] };
    const bad = await runRestore(deps(fake(data, 'routines')));
    expect(bad).toMatchObject({ ok: false, error: 'offline' });
    expect(await sessionsRepo.get('s1')).toBeTruthy();
    expect(await routinesRepo.get('r1')).toBeUndefined();
    const ok = await runRestore(deps(fake(data)));
    expect(ok.ok).toBe(true);
    expect(await routinesRepo.get('r1')).toBeTruthy();
    expect(await readCursor('routines')).not.toBeNull();
  });

  it('an unknown or deleted session gets no sets back', async () => {
    const remote = fake({ workout_sets: SETS });
    const res = await runRestore(deps(remote));
    expect(res.ok).toBe(true);
    expect(await sessionsRepo.get('s1')).toBeUndefined();
  });
});

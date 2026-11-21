import { describe, expect, it } from 'vitest';
import {
  BATCH_MAX,
  PUSH_ORDER,
  batchOps,
  chipState,
  classifyError,
  nextCursor,
  pageIsLast,
  passwordProblem,
  pullFilter,
  retryDelayMs,
  sortForPush,
  toServerOps,
  type ServerOp,
} from '../../src/shared/sync';

const row = (extra: Record<string, unknown> = {}) => ({ client_id: 'c1', updated_at: 1000, deleted_at: null, ...extra });

describe('retry delay', () => {
  it('doubles from 10 s and caps at 15 min, jitter adds at most 20%', () => {
    expect(retryDelayMs(1, 0)).toBe(10_000);
    expect(retryDelayMs(2, 0)).toBe(20_000);
    expect(retryDelayMs(20, 0)).toBe(900_000);
    expect(retryDelayMs(20, 0.999)).toBeLessThanOrEqual(900_000 * 1.2);
  });
});

describe('error classes', () => {
  it('network, 5xx, 429 and foreign-key retry; 401 pauses; rules fail', () => {
    expect(classifyError({ offline: true })).toBe('retry');
    expect(classifyError({ status: 503 })).toBe('retry');
    expect(classifyError({ status: 429 })).toBe('retry');
    expect(classifyError({ status: 409, code: '23503' })).toBe('retry');
    expect(classifyError({ status: 401 })).toBe('auth');
    expect(classifyError({ status: 403, code: '42501' })).toBe('failed');
    expect(classifyError({ status: 409, code: '23505' })).toBe('failed');
  });
});

describe('server ops', () => {
  it('a routine is one merge upsert; updated_at is dropped, deleted_at becomes ISO', () => {
    const [o] = toServerOps('routines', 'put', row({ name: 'Push' }));
    expect(o).toMatchObject({ table: 'routines', kind: 'upsert', clientId: 'c1' });
    expect(o!.body).toEqual({ client_id: 'c1', name: 'Push' });
    expect(o!.body).not.toHaveProperty('updated_at');
  });
  it('a removed routine is a soft delete by client_id; a removed mark is an upsert (natural key)', () => {
    expect(toServerOps('routines', 'remove', row({ deleted_at: 5000 }))[0]).toMatchObject({ kind: 'soft-delete', body: { deleted_at: '1970-01-01T00:00:05.000Z' } });
    expect(toServerOps('marks', 'remove', row({ deleted_at: 5000 }))[0]).toMatchObject({ table: 'injury_marks', kind: 'upsert' });
  });
  it('prefs and photos never leave the device', () => {
    expect(toServerOps('prefs', 'put', row())).toEqual([]);
    expect(toServerOps('photos', 'put', row())).toEqual([]);
  });
  it('a session splits into the session, sets and cardio, with derived child ids that never change on replay', () => {
    const s = row({
      client_id: 's1',
      items: [
        { ref: { kind: 'lib', slug: 'bench' }, order: 0, sets: [{ reps: 5, weightKg: 60 }, { reps: 5, weightKg: 60 }] },
        { ref: { kind: 'custom', id: 'my-run' }, order: 1, sets: [{ distanceM: 1000 }] },
      ],
    });
    const a = toServerOps('sessions', 'put', s);
    const b = toServerOps('sessions', 'put', s);
    expect(a.map((o) => o.table)).toEqual(['workout_sessions', 'workout_sets', 'workout_sets', 'cardio_logs']);
    expect(a.map((o) => o.clientId)).toEqual(['s1', 's1:0:0', 's1:0:1', 's1:1:0']);
    expect(a.map((o) => o.clientId)).toEqual(b.map((o) => o.clientId));
    expect(a[1]!.body).toMatchObject({ exercise_ref: 'bench', session_client_id: 's1' });
    expect(a[0]!.body).not.toHaveProperty('items');
  });
});

describe('push order and batches', () => {
  const op = (table: ServerOp['table'], n = 0): ServerOp => ({ table, kind: 'upsert', body: { n }, clientId: `${table}${n}` });
  it('parents come before children', () => {
    const sorted = sortForPush([op('workout_sets'), op('exercise_prefs'), op('workout_sessions'), op('routines')]);
    expect(sorted.map((o) => o.table)).toEqual(['workout_sessions', 'workout_sets', 'routines', 'exercise_prefs']);
    expect(PUSH_ORDER[0]).toBe('workout_sessions');
  });
  it('batches hold at most 50 rows of one table; soft deletes go alone', () => {
    const ops = Array.from({ length: 120 }, (_, i) => op('workout_sets', i));
    expect(batchOps(ops).map((b) => b.length)).toEqual([BATCH_MAX, BATCH_MAX, 20]);
    const mixed: ServerOp[] = [op('routines', 1), { ...op('routines', 2), kind: 'soft-delete' }, { ...op('routines', 3), kind: 'soft-delete' }];
    expect(batchOps(mixed).map((b) => b.length)).toEqual([1, 1, 1]);
  });
});

describe('delta cursor', () => {
  it('first pull has no filter; later ones use updated_at and the tie column, kept as strings', () => {
    expect(pullFilter('routines', null)).toBeNull();
    const c = { u: '2026-11-21T04:00:00.123456+00:00', t: 'abc' };
    expect(pullFilter('routines', c)).toBe('(updated_at.gt.2026-11-21T04:00:00.123456+00:00,and(updated_at.eq.2026-11-21T04:00:00.123456+00:00,id.gt.abc))');
    expect(pullFilter('gym_settings', c)).toContain('key.gt.abc');
    expect(pullFilter('member_stats', c)).toContain('member_id.gt.abc');
  });
  it('the cursor is the last row; a short page ends the loop', () => {
    expect(nextCursor('routines', [{ updated_at: 'a', id: '1' }, { updated_at: 'b', id: '2' }], null)).toEqual({ u: 'b', t: '2' });
    expect(nextCursor('routines', [], { u: 'x', t: 'y' })).toEqual({ u: 'x', t: 'y' });
    expect(pageIsLast(new Array(499))).toBe(true);
    expect(pageIsLast(new Array(500))).toBe(false);
  });
});

describe('chip', () => {
  const base = { connected: true, running: false, online: true, waiting: 0, failed: 0, authPaused: false, versionMismatch: false, lastSyncedAt: 5 };
  it('is hidden standalone and ranks attention, syncing, offline, idle', () => {
    expect(chipState({ ...base, connected: false })).toBeNull();
    expect(chipState({ ...base, running: true, failed: 1 })?.kind).toBe('attention');
    expect(chipState({ ...base, authPaused: true })).toMatchObject({ kind: 'attention', reason: 'signin' });
    expect(chipState({ ...base, versionMismatch: true })).toMatchObject({ reason: 'version' });
    expect(chipState({ ...base, running: true })?.kind).toBe('syncing');
    expect(chipState({ ...base, online: false, waiting: 3 })).toEqual({ kind: 'offline', waiting: 3 });
    expect(chipState(base)).toEqual({ kind: 'idle', lastSyncedAt: 5 });
  });
});

describe('password words', () => {
  it('needs 10-72 characters, a letter and a number; refuses the member code or phone', () => {
    expect(passwordProblem('short1', '', '')).toBe('weak');
    expect(passwordProblem('onlyletterspassword', '', '')).toBe('weak');
    expect(passwordProblem('1234567890123', '', '')).toBe('weak');
    expect(passwordProblem('a'.repeat(70) + '12345', '', '')).toBe('weak');
    expect(passwordProblem('Strong-pass-77', 'SF-0042', '9876543210')).toBeNull();
    expect(passwordProblem('xxSF-0042xx9', 'SF-0042', '')).toBe('same');
    expect(passwordProblem('abcdef9876543210', '', '98765 43210')).toBe('same');
  });
});

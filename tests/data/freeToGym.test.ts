import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDb, setOutboxEnabled } from '../../src/data/local';
import { readMode, writeMode } from '../../src/data/gym/backupMeta';
import { readOwner, writeOwner } from '../../src/data/gym/restore';
import { __resetMove, agreeMove, answerMine, dropMoveAsk, moveHooks, readMove, readMoveScreen, readOldFreeId, stepMove, type MovePorts } from '../../src/data/gym/freeToGym';
import { saveConnection } from '../../src/data/gym/connection';

const MEMBER = 'member:ABC123';
const CTX = { hasSession: true, mustChange: false, online: true };

async function put(key: string, value: unknown) {
  await (await getDb()).put('meta', { key, value });
}
async function get(key: string) {
  return (await (await getDb()).get('meta', key))?.value;
}
async function rowCount(n: number) {
  const db = await getDb();
  for (let i = 0; i < n; i++) await db.put('routines' as never, { client_id: `r${i}`, updated_at: 1, deleted_at: null } as never).catch(() => undefined);
}

interface Log { calls: string[]; modeAtPass: string | null; backupAtPass: unknown }
function ports(o: Partial<{ pass: 'ok' | 'fail' | 'throw'; del: 'ok' | 'fail'; free: boolean | null; member: string | null; freeId: string | null }> = {}): MovePorts & { log: Log } {
  const log: Log = { calls: [], modeAtPass: null, backupAtPass: undefined };
  return {
    log,
    memberOwner: async () => (o.member === undefined ? MEMBER : o.member),
    freeId: async () => (o.freeId === undefined ? 'FR1-7K2Q9' : o.freeId),
    freeHasData: async () => (o.free === undefined ? true : o.free),
    stopFree: () => void log.calls.push('stopFree'),
    startFree: async () => void log.calls.push('startFree'),
    gymPass: async () => {
      log.calls.push('gymPass');
      log.modeAtPass = await readMode();
      log.backupAtPass = await get('backup:dirty');
      if (o.pass === 'throw') throw new Error('boom');
      if (o.pass === 'fail') return { ok: false, code: 'SFE201' };
      return { ok: true, start: async () => void log.calls.push('startGym') };
    },
    deleteFree: async () => {
      log.calls.push('deleteFree');
      return o.del === 'fail' ? { ok: false, code: 'OFFLINE' } : { ok: true };
    },
  };
}

beforeEach(async () => {
  await resetDb();
  setOutboxEnabled(false);
  __resetMove();
  await writeMode('free_backup');
  await writeOwner('free:FR1-7K2Q9');
  await put('free:account', { free_id: 'FR1-7K2Q9' });
  await put('backup:dirty', ['a']);
  await put('backup:base:a', { content_sha256: 'x', rev: 7, rows: 2, at: 1 });
  await put('backup:last', { ok_at: 5 });
  await put(MOVE, { mine: true, agreed: true });
  await rowCount(3);
});
const MOVE = 'free:move';

describe('free to gym transition (fake ports, fake IndexedDB)', () => {
  it('happy path: the first gym backup is written while the mode is still free, then connected, then the free account goes', async () => {
    const p = ports();
    const out = await stepMove(p, CTX);
    expect(out).toEqual({ kind: 'moved', freeDeleted: true });
    expect(p.log.calls).toEqual(['stopFree', 'gymPass', 'startGym', 'deleteFree']);
    expect(p.log.modeAtPass).toBe('free_backup'); // the flip comes after the write
    expect(p.log.backupAtPass).toBeUndefined(); // the free bookkeeping was cleared for the gym's first pass
    expect(await readMode()).toBe('connected');
    expect(await readOwner()).toBe(MEMBER);
    expect(await readMove()).toBeNull();
    expect(await readOldFreeId()).toBe('FR1-7K2Q9'); // kept in Settings
  });

  it('a failed first gym backup (or a throw) leaves the old mode, stamp and bookkeeping exactly as they were', async () => {
    for (const pass of ['fail', 'throw'] as const) {
      __resetMove();
      await writeOwner('free:FR1-7K2Q9');
      await put('backup:dirty', ['a']);
      const p = ports({ pass });
      const out = await stepMove(p, CTX);
      expect(out).toMatchObject({ kind: 'failed' });
      expect(p.log.calls).not.toContain('deleteFree');
      expect(p.log.calls).toContain('startFree'); // the free runtime is running again
      expect(await readMode()).toBe('free_backup');
      expect(await readOwner()).toBe('free:FR1-7K2Q9');
      expect(await get('backup:dirty')).toEqual(['a']);
      expect(await get('backup:base:a')).toMatchObject({ rev: 7 });
      const rec = await readMove();
      expect(rec?.phase).toBeUndefined();
      expect(rec?.agreed).toBe(true); // it will try again
      expect(rec?.failCode).toBeTruthy();
    }
  });

  it('two copies: the free delete failing keeps the move flipped and retries later; nothing is lost', async () => {
    const p = ports({ del: 'fail' });
    expect(await stepMove(p, CTX)).toEqual({ kind: 'moved', freeDeleted: false });
    expect(await readMode()).toBe('connected');
    expect((await readMove())?.phase).toBe('flipped');
    expect((await readMoveScreen()).view).toBe('kept');
    // offline: waits, no call
    const q = ports();
    expect(await stepMove(q, { ...CTX, online: false })).toEqual({ kind: 'waiting' });
    expect(q.log.calls).toEqual([]);
    // online again: only the delete runs (no second gym write)
    expect(await stepMove(q, CTX)).toEqual({ kind: 'moved', freeDeleted: true });
    expect(q.log.calls).toEqual(['deleteFree']);
    expect(await readMove()).toBeNull();
  });

  it('waits for sign in, the password change and the consent; nothing is touched', async () => {
    const p = ports();
    expect(await stepMove(p, { ...CTX, hasSession: false })).toEqual({ kind: 'waiting' });
    expect(await stepMove(p, { ...CTX, mustChange: true })).toEqual({ kind: 'waiting' });
    await put(MOVE, { mine: true });
    expect(await stepMove(p, CTX)).toEqual({ kind: 'waiting' });
    expect(p.log.calls).toEqual([]);
    expect(await readMode()).toBe('free_backup');
    expect(await get('backup:dirty')).toEqual(['a']);
  });

  it('shared phone: "Is this your data?" blocks until Yes; No never moves', async () => {
    await saveConnection({ config: { name: 'g' } as never, host: 'h', connectedAt: 1, signedIn: true, mustChangePassword: false, versionMismatch: false, memberCode: 'abc123' });
    await put(MOVE, {});
    expect((await readMoveScreen()).view).toBe('ask');
    await answerMine(false);
    expect((await readMoveScreen()).view).toBe('other');
    const p = ports();
    await agreeMove();
    expect(await stepMove(p, CTX)).toEqual({ kind: 'waiting' });
    expect(p.log.calls).toEqual([]);
    expect(await readOwner()).toBe('free:FR1-7K2Q9'); // not restamped
    await answerMine(true);
    expect((await readMoveScreen()).view).toBe('waiting');
    expect(await stepMove(p, CTX)).toEqual({ kind: 'moved', freeDeleted: true });
  });

  it('the hook gives the member stamp only to a confirmed owner, before the verdict', async () => {
    const conn = { config: { name: 'g' } as never, host: 'h', connectedAt: 1, signedIn: true, mustChangePassword: false, versionMismatch: false, memberCode: 'abc123' };
    await saveConnection(conn);
    const env = { online: () => true };
    await put(MOVE, { agreed: true }); // not asked yet, stamp is someone else's
    let h = await moveHooks({} as never, conn, env, ports());
    await h!.before();
    expect(await readOwner()).toBe('free:FR1-7K2Q9');
    await put(MOVE, { agreed: true, mine: true });
    h = await moveHooks({} as never, conn, env, ports());
    await h!.before();
    expect(await readOwner()).toBe(MEMBER);
    expect((await readMove())?.oldStamp).toBe('free:FR1-7K2Q9');
    expect(h!.freeFirst).toBe(true);
  });

  it('phone dies while writing: the next sync undoes it, the free mode still works, then the move retries', async () => {
    const live = ports();
    // Simulate the dead phone: the record says `writing`, the free bookkeeping is gone, the stamp is the member's.
    await put(MOVE, { mine: true, agreed: true, phase: 'writing', freeId: 'FR1-7K2Q9', oldStamp: 'free:FR1-7K2Q9', snapshot: [{ key: 'backup:dirty', value: ['a'] }, { key: 'backup:base:a', value: { content_sha256: 'x', rev: 7, rows: 2, at: 1 } }] });
    const db = await getDb();
    await db.delete('meta', 'backup:dirty');
    await db.delete('meta', 'backup:base:a');
    await writeOwner(MEMBER);
    expect(await stepMove(live, CTX)).toEqual({ kind: 'failed', code: 'CRASH' });
    expect(await readMode()).toBe('free_backup');
    expect(await readOwner()).toBe('free:FR1-7K2Q9');
    expect(await get('backup:dirty')).toEqual(['a']);
    expect(await get('backup:base:a')).toMatchObject({ rev: 7 });
    expect(live.log.calls).toEqual(['startFree']);
    expect(await stepMove(live, CTX)).toEqual({ kind: 'moved', freeDeleted: true }); // the next sync retries
  });

  it('phone dies after the flip, before the free delete: the delete finishes later, the gym stays the target', async () => {
    await writeMode('connected');
    await put(MOVE, { mine: true, agreed: true, phase: 'flipped', freeId: 'FR1-7K2Q9' });
    const p = ports();
    expect(await stepMove(p, CTX)).toEqual({ kind: 'moved', freeDeleted: true });
    expect(p.log.calls).toEqual(['deleteFree']);
    expect(await readMode()).toBe('connected');
  });

  it('an empty phone whose free copy holds the data restores first and writes nothing to the gym', async () => {
    const db = await getDb();
    await db.clear('routines' as never);
    await put(MOVE, { mine: true, agreed: true });
    const p = ports({ free: true });
    expect(await stepMove(p, CTX)).toEqual({ kind: 'restore_first' });
    expect(p.log.calls).toEqual([]);
    expect((await readMoveScreen()).view).toBe('restore_first');
  });

  it('a free copy that cannot be asked (offline server) waits instead of guessing', async () => {
    const p = ports({ free: null });
    expect(await stepMove(p, CTX)).toEqual({ kind: 'waiting' });
    expect(p.log.calls).toEqual([]);
  });

  it('leaving a gym mid-way drops an unfinished consent but keeps a flipped record', async () => {
    await dropMoveAsk();
    expect(await readMove()).toBeNull();
    await put(MOVE, { phase: 'flipped', freeId: 'F' });
    await dropMoveAsk();
    expect((await readMove())?.phase).toBe('flipped');
  });

  it('a plain gym member (no free backup, no move) gets no hooks at all', async () => {
    await writeMode('connected');
    await (await getDb()).delete('meta', MOVE);
    expect(await moveHooks({} as never, {} as never, { online: () => true }, ports())).toBeNull();
  });
});

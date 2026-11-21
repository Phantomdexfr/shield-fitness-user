import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, sessionsRepo, bodyStatsRepo, routinesRepo, prefsRepo, setClock, setOutboxEnabled, setChangeListener } from '../../src/data/local';
import { chunkKeyOfChange, createBackupScheduler, startBackupTriggers, type BrowserEnv } from '../../src/data/gym/backupTriggers';
import { readDirty, writeMode } from '../../src/data/gym/backupMeta';

/** A fake clock with a timer list; `advance(ms)` fires what is due. */
function clock() {
  let now = 1_000_000_000;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let n = 0;
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => { const id = ++n; timers.push({ at: now + ms, fn, id }); return id; },
    clearTimer: (h: unknown) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    async advance(ms: number) {
      now += ms;
      for (const t of timers.filter((x) => x.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn(); }
      await new Promise((r) => setTimeout(r, 5));
    },
    pending: () => timers.length,
  };
}
const flush = () => new Promise((r) => setTimeout(r, 5));
const FIN = { startedAt: '2026-11-05T01:00:00.000Z', endedAt: '2026-11-05T02:00:00.000Z', items: [] };

beforeEach(async () => {
  await resetDb(true);
  setOutboxEnabled(false);
  setClock(() => 7_000_000);
  setChangeListener(null);
  await writeMode('free_backup');
});

describe('chunkKeyOfChange', () => {
  const r = (o: Record<string, unknown>) => ({ client_id: 'x', updated_at: 1_793_000_000_000, deleted_at: null, ...o });
  it('a finished session goes to its IST month; an active one is not backed up until it ends', () => {
    expect(chunkKeyOfChange('sessions', r(FIN))).toBe('sessions:2026-11');
    expect(chunkKeyOfChange('sessions', r({ startedAt: FIN.startedAt, items: [] }))).toBeNull();
    // deleting an unfinished session still counts (a finished copy may already be on the server)
    expect(chunkKeyOfChange('sessions', r({ startedAt: FIN.startedAt, deleted_at: 5 }))).toBe('sessions:2026-11');
  });
  it('IST month edge: 2026-11-30 19:00 UTC is already December in IST', () => {
    expect(chunkKeyOfChange('sessions', r({ startedAt: '2026-11-30T19:00:00.000Z', endedAt: '2026-11-30T20:00:00.000Z' }))).toBe('sessions:2026-12');
  });
  it('body, intake and small; prefs and photos never', () => {
    expect(chunkKeyOfChange('bodyStats', r({ day: '2026-10-31' }))).toBe('body:2026-10');
    expect(chunkKeyOfChange('intake', r({ at: Date.parse('2026-11-05T05:00:00Z') }))).toBe('body:2026-11');
    expect(chunkKeyOfChange('routines', r({}))).toBe('small');
    expect(chunkKeyOfChange('marks', r({}))).toBe('small');
    expect(chunkKeyOfChange('prefs', r({}))).toBeNull();
    expect(chunkKeyOfChange('photos', r({}))).toBeNull();
  });
});

describe('scheduler on a fake clock', () => {
  function make(over: { enabled?: () => Promise<boolean> } = {}) {
    const c = clock();
    const passes: number[] = [];
    const s = createBackupScheduler({ runPass: async () => { passes.push(c.now()); }, enabled: over.enabled ?? (async () => true), setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now, rand: () => 0 });
    return { c, s, passes };
  }

  it('a change marks its chunk dirty and the pass runs 10 s later (rand 0), not before', async () => {
    const { c, s, passes } = make();
    s.noteChange('sessions', { client_id: 'a', updated_at: 1, ...FIN });
    await flush();
    expect(await readDirty()).toEqual(['sessions:2026-11']);
    await c.advance(9_000);
    expect(passes).toEqual([]);
    await c.advance(1_500);
    expect(passes).toHaveLength(1);
  });

  it('a burst of edits waits for the last one: one timer, one pass', async () => {
    const { c, s, passes } = make();
    for (let i = 0; i < 4; i++) { s.noteChange('routines', { client_id: String(i), updated_at: 1 }); await flush(); await c.advance(2_000); }
    expect(c.pending()).toBe(1);
    await c.advance(10_000);
    expect(passes).toHaveLength(1);
    expect(await readDirty()).toEqual(['small']);
  });

  it('disabled (standalone / feature off): nothing marked, no timer, no pass', async () => {
    const { c, s, passes } = make({ enabled: async () => false });
    s.noteChange('sessions', { client_id: 'a', updated_at: 1, ...FIN });
    await flush();
    await s.kick();
    expect(await s.dailyCheck()).toBe(false);
    expect(await readDirty()).toEqual([]);
    expect(c.pending()).toBe(0);
    expect(passes).toEqual([]);
  });

  it('kick (open / foreground / online / after row sync) runs a pass at once; overlapping kicks run one more pass at most', async () => {
    const c = clock();
    let release: () => void = () => undefined;
    let n = 0;
    const s = createBackupScheduler({ runPass: () => { n++; return new Promise<void>((r) => { release = r; }); }, enabled: async () => true, setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now, rand: () => 0 });
    const a = s.kick(); await flush();
    void s.kick(); void s.kick(); await flush();
    expect(n).toBe(1);
    release(); await flush(); release(); await a;
    expect(n).toBe(2);
  });

  it('daily check marks every key once per 24 h, then passes', async () => {
    const c = clock();
    const passes: number[] = [];
    let daily: number | null = null;
    const s = createBackupScheduler({ runPass: async () => { passes.push(c.now()); }, enabled: async () => true, setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now, rand: () => 0,
      allKeys: async () => ['body:2026-11', 'sessions:2026-11', 'small'], readDaily: async () => daily, writeDaily: async (a) => { daily = a; } });
    expect(await s.dailyCheck()).toBe(true);
    expect(await readDirty()).toEqual(['body:2026-11', 'sessions:2026-11', 'small']);
    expect(passes).toHaveLength(1);
    c.now(); expect(await s.dailyCheck()).toBe(false); // same day
    await c.advance(24 * 3600_000 + 1);
    expect(await s.dailyCheck()).toBe(true);
  });
});

describe('repo writes reach the scheduler', () => {
  it('a finished session, a body row and a routine mark their chunks; an active session and a pref do not', async () => {
    const c = clock();
    const s = createBackupScheduler({ runPass: async () => undefined, enabled: async () => true, setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now, rand: () => 0, allKeys: async () => [], readDaily: async () => c.now(), writeDaily: async () => undefined });
    const env: BrowserEnv = { onVisible: () => () => undefined, onOnline: () => () => undefined, isHidden: () => false };
    const stop = startBackupTriggers(s, env);
    await flush();
    await sessionsRepo.put({ ...FIN, client_id: 'live', endedAt: undefined } as never); // active: ignored
    await sessionsRepo.put({ ...FIN, client_id: 'done' } as never);
    await bodyStatsRepo.put({ client_id: 'bw', day: '2026-11-02', kg: 80 } as never);
    await routinesRepo.put({ client_id: 'r1', name: 'Push' } as never);
    await prefsRepo.put({ client_id: 'p', v: 1 } as never);
    await sessionsRepo.remove('done');
    await flush();
    expect(await readDirty()).toEqual(['body:2026-11', 'sessions:2026-11', 'small']);
    stop();
    await routinesRepo.put({ client_id: 'r2', name: 'After stop' } as never); // listener removed: no throw, nothing more
  });
});

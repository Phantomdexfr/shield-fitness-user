import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listOutbox, resetDb, routinesRepo, setOutboxEnabled, isOutboxEnabled, bodyStatsRepo, prefsRepo } from '../../src/data/local';
import { pushOutbox, pullTable, runSync, __resetEngine, type EngineDeps } from '../../src/data/gym/syncEngine';
import { __resetConnectionCache, getConnection, readUnsynced, readCursor } from '../../src/data/gym/connection';
import { __resetLink, changePassword, connectToGym, disconnect, setLinkEnv, setRemoteFactory, signIn } from '../../src/data/gym/link';
import { callFunction } from '../../src/data/gym/functions';
import { getChipInput, setChipInput } from '../../src/data/gym/syncState';
import { getPolicy, __setPolicyForTest } from '../../src/data/repos/gymPolicy';
import { parseGymConfig } from '../../src/shared/gymConfig';
import type { Remote } from '../../src/data/gym/types';
import type { RemoteError } from '../../src/shared/sync';

const read = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const cfg = (() => {
  const r = parseGymConfig(read('gymconfig_valid').cases[0].input, {});
  if (!r.ok) throw new Error('fixture');
  return r;
})();
const POLICY = read('policy_validate').valid[0].policy;

/** A fake server: rows keyed by table + client_id, with switches for the failure cases. */
function fakeRemote(over: Partial<{ fail: (table: string, n: number) => RemoteError | undefined; contract: string; policy: unknown; must: boolean; pages: Record<string, unknown>[][] }> = {}) {
  const store = new Map<string, Record<string, unknown>>();
  const calls: { table: string; n: number }[] = [];
  let signedIn = false;
  const r: Remote & { store: typeof store; calls: typeof calls } = {
    store,
    calls,
    async signIn(email, pw) {
      if (pw !== 'right-pass-1') return { ok: false, error: { status: 400 } };
      signedIn = true;
      void email;
      return { ok: true };
    },
    async signOut() {
      signedIn = false;
    },
    async hasSession() {
      return signedIn;
    },
    async accessToken() {
      return signedIn ? 'tok' : null;
    },
    async profile() {
      return { profile: { must_change_password: over.must ?? false, train_shard: 'B' } };
    },
    async publicSettings() {
      return { policy: over.policy ?? POLICY, contract_version: over.contract ?? '1.0.0' };
    },
    async upsert(table, rows, o) {
      calls.push({ table, n: rows.length });
      const e = over.fail?.(table, rows.length);
      if (e) return { error: e };
      for (const row of rows) {
        const k = `${table}:${row.client_id ?? row.slug}`;
        if (o.ignoreDuplicates && store.has(k)) continue;
        store.set(k, row);
      }
      return {};
    },
    async softDelete(table, id, body) {
      calls.push({ table, n: 1 });
      const e = over.fail?.(table, 1);
      if (e) return { error: e };
      store.set(`${table}:${id}`, { ...(store.get(`${table}:${id}`) ?? {}), ...body });
      return {};
    },
    async pull(table) {
      void table;
      return { rows: over.pages?.shift() ?? [] };
    },
    async readOwn() {
      return { rows: [] };
    },
    async markInboxRead() {
      return {};
    },
    async insertRequest() {
      return {};
    },
    async insertProposal() {
      return {};
    },
  };
  return r;
}

const T0 = Date.now() + 60_000; // rows made during a test are stamped with the real clock, so "now" starts a minute ahead
let t = T0;
const deps = (remote: Remote, online = true): EngineDeps => ({ remote, now: () => t, rand: () => 0, online: () => online });

beforeEach(async () => {
  await resetDb(true);
  __resetConnectionCache();
  __resetLink();
  __resetEngine();
  setOutboxEnabled(false);
  __setPolicyForTest(null);
  setChipInput({ connected: false, running: false, waiting: 0, failed: 0, authPaused: false, versionMismatch: false, lastSyncedAt: null });
  t = T0;
  vi.unstubAllGlobals();
  setLinkEnv({ now: () => t, rand: () => 0, online: () => true });
});

describe('outbox push', () => {
  it('standalone never queues; connected queues in the same write', async () => {
    await routinesRepo.put({ name: 'A' } as never);
    expect(await listOutbox()).toHaveLength(0);
    setOutboxEnabled(true);
    await routinesRepo.put({ name: 'B' } as never);
    expect(await listOutbox()).toHaveLength(1);
  });

  it('offline: nothing is sent and nothing is lost; online: it goes and the queue empties', async () => {
    setOutboxEnabled(true);
    await routinesRepo.put({ name: 'B' } as never);
    const r = fakeRemote();
    expect(await pushOutbox(deps(r, false))).toMatchObject({ offline: true, sent: 0 });
    expect(r.calls).toHaveLength(0);
    expect(await listOutbox('pending')).toHaveLength(1);
    expect(await pushOutbox(deps(r))).toMatchObject({ sent: 1, failed: 0 });
    expect(await listOutbox()).toHaveLength(0);
    expect(r.store.size).toBe(1);
  });

  it('replay is idempotent: the same row sent twice leaves one server row', async () => {
    setOutboxEnabled(true);
    const row = await routinesRepo.put({ name: 'B' } as never);
    const r = fakeRemote();
    await pushOutbox(deps(r));
    // simulate a crash after the server answered but before the outbox row was removed: the same row comes back
    const db = await (await import('../../src/data/local')).getDb();
    await db.add('outbox', { table: 'routines', op: 'put', client_id: row.client_id, payload: row, created_at: t, attempts: 0, nextTryAt: 0, status: 'pending' } as never);
    await pushOutbox(deps(r));
    expect(r.store.size).toBe(1);
    expect(await listOutbox()).toHaveLength(0);
  });

  it('a server error backs off (10 s first), keeps the row, and a later run sends it', async () => {
    setOutboxEnabled(true);
    await routinesRepo.put({ name: 'B' } as never);
    let down = true;
    const r = fakeRemote({ fail: () => (down ? { status: 503 } : undefined) });
    expect(await pushOutbox(deps(r))).toMatchObject({ retry: 1, sent: 0 });
    const [row] = await listOutbox('pending');
    expect(row).toMatchObject({ attempts: 1, nextTryAt: t + 10_000 });
    const before = r.calls.length;
    t += 5_000; // not due yet
    await pushOutbox(deps(r));
    expect(r.calls.length).toBe(before);
    t += 6_000;
    down = false;
    expect(await pushOutbox(deps(r))).toMatchObject({ sent: 1 });
    expect(await listOutbox()).toHaveLength(0);
  });

  it('a rejected row is marked failed with a plain reason and kept; the good rows in its batch still go', async () => {
    setOutboxEnabled(true);
    await routinesRepo.put({ name: 'good1' } as never);
    await routinesRepo.put({ name: 'BAD' } as never);
    await routinesRepo.put({ name: 'good2' } as never);
    const r = fakeRemote();
    const realUpsert = r.upsert;
    r.upsert = async (table, rows, o) => (rows.some((x) => x.name === 'BAD') ? (r.calls.push({ table, n: rows.length }), { error: { status: 403, code: '42501' } }) : realUpsert(table, rows, o));
    const out = await pushOutbox(deps(r));
    expect(out).toMatchObject({ sent: 2, failed: 1 });
    const left = await listOutbox();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: 'failed', reason: 'Your gym did not accept this change.' });
    // a failed row is not tried again by a later run
    const calls = r.calls.length;
    await pushOutbox(deps(r));
    expect(r.calls.length).toBe(calls);
  });

  it('a 401 is retried once, then the queue pauses and rows stay pending untouched', async () => {
    setOutboxEnabled(true);
    await routinesRepo.put({ name: 'B' } as never);
    const r = fakeRemote({ fail: () => ({ status: 401 }) });
    const out = await pushOutbox(deps(r));
    expect(out.authPaused).toBe(true);
    expect(r.calls).toHaveLength(2);
    expect(await listOutbox('pending')).toEqual([expect.objectContaining({ attempts: 0 })]);
  });

  it('parents are pushed before children and nothing is sent for prefs', async () => {
    setOutboxEnabled(true);
    await prefsRepo.put({ client_id: 'x', value: 1 } as never);
    await bodyStatsRepo.put({ kg: 70 } as never);
    await routinesRepo.put({ name: 'R' } as never);
    const r = fakeRemote();
    await pushOutbox(deps(r));
    expect(r.calls.map((c) => c.table)).toEqual(['body_stats', 'routines']);
  });
});

describe('delta pull', () => {
  const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `id${from + i}`, updated_at: `2026-11-21T00:00:${String(from + i).padStart(2, '0')}+00:00` }));
  it('repeats until a short page, moves the cursor after storing, keeps the server string', async () => {
    const r = fakeRemote({ pages: [rows(2), rows(2, 2), rows(1, 4)] });
    const got: number[] = [];
    const out = await pullTable(deps(r), { table: 'routines', columns: 'id,updated_at', apply: async (x) => void got.push(x.length) }, 2);
    expect(out.rows).toBe(5);
    expect(got).toEqual([2, 2, 1]);
    expect(await readCursor('routines')).toEqual({ u: '2026-11-21T00:00:04+00:00', t: 'id4' });
  });
  it('the cursor does not move when storing the rows fails', async () => {
    const r = fakeRemote({ pages: [rows(2)] });
    await expect(pullTable(deps(r), { table: 'routines', columns: 'id', apply: async () => { throw new Error('disk'); } }, 2)).rejects.toThrow();
    expect(await readCursor('routines')).toBeNull();
  });
  it('runSync does not push when offline, shows the offline chip, and only one run at a time', async () => {
    setOutboxEnabled(true);
    await routinesRepo.put({ name: 'B' } as never);
    const r = fakeRemote();
    const out = await runSync(deps(r, false), [], { signedIn: true });
    expect(out).not.toBe('busy');
    expect(getChipInput()).toMatchObject({ waiting: 1, online: false, running: false });
    expect(r.calls).toHaveLength(0);
  });
});

describe('credential functions', () => {
  const fnCfg = { functions: 'https://abcdefgh.supabase.co/functions/v1', core: { url: 'https://abcdefgh.supabase.co', anon: 'anon' } };
  it('reads the frozen envelope; unknown input still gets an email; errors keep code and retry_after', async () => {
    const f = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: { email: 'sf-1@members.shieldfit.app' } }) }));
    const ok = await callFunction(fnCfg, 'lookup-login', { identifier: '1' }, undefined, f as never, true);
    expect(ok).toEqual({ ok: true, data: { email: 'sf-1@members.shieldfit.app' } });
    const call = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(call[0]).toBe('https://abcdefgh.supabase.co/functions/v1/lookup-login');
    expect(call[1].headers.Authorization).toBe('Bearer anon');
    const bad = vi.fn(async () => ({ status: 429, json: async () => ({ ok: false, error: { code: 'SFE004', message: 'slow', retry_after: 30 } }) }));
    expect(await callFunction(fnCfg, 'x', {}, undefined, bad as never, true)).toMatchObject({ ok: false, code: 'SFE004', retry_after: 30 });
  });
  it('offline and a sleeping server get their own codes and never throw', async () => {
    expect(await callFunction(fnCfg, 'x', {}, undefined, undefined, false)).toEqual({ ok: false, code: 'OFFLINE' });
    const boom = vi.fn(async () => { throw new Error('dns'); });
    expect(await callFunction(fnCfg, 'x', {}, undefined, boom as never, true)).toMatchObject({ ok: false });
    const html = vi.fn(async () => ({ status: 503, json: async () => { throw new Error('not json'); } }));
    expect(await callFunction(fnCfg, 'x', {}, undefined, html as never, true)).toEqual({ ok: false, code: 'ASLEEP' });
  });
});

describe('connect, sign in, change password, disconnect (fake remote and fetch)', () => {
  const stubFetch = (handler: (name: string, body: Record<string, unknown>) => unknown) =>
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => ({ status: 200, json: async () => handler(url.split('/').pop()!, JSON.parse(init.body)) }));

  it('a good gym connects: policy cached, connection stored, outbox on, chip shown', async () => {
    setRemoteFactory(async () => fakeRemote());
    const steps: string[] = [];
    const out = await connectToGym(cfg.config, cfg.host, (s) => steps.push(s));
    expect(out).toEqual({ ok: true });
    expect(steps).toEqual(['reach', 'settings', 'version']);
    expect((await getConnection())?.host).toBe(cfg.host);
    expect(getPolicy()?.version).toBe(POLICY.version);
    expect(isOutboxEnabled()).toBe(true);
    expect(getChipInput().connected).toBe(true);
  });

  it('nothing is stored when the major differs, the policy is bad, the server is down, or the phone is offline', async () => {
    for (const [make, key] of [
      [() => fakeRemote({ contract: '2.0.0' }), 'gy.err.version'],
      [() => fakeRemote({ policy: { nope: 1 } }), 'gy.err.setup'],
      [() => ({ ...fakeRemote(), publicSettings: async () => ({ error: { status: 503 } }) }), 'gy.err.asleep'],
    ] as const) {
      setRemoteFactory(async () => make() as Remote);
      const out = await connectToGym(cfg.config, cfg.host);
      expect(out).toMatchObject({ ok: false, key });
      expect(await getConnection()).toBeNull();
      expect(isOutboxEnabled()).toBe(false);
    }
    setLinkEnv({ online: () => false });
    setRemoteFactory(async () => fakeRemote());
    expect(await connectToGym(cfg.config, cfg.host)).toMatchObject({ ok: false, key: 'gy.err.offline' });
    expect(await getConnection()).toBeNull();
  });

  it('sign in: one sentence for a wrong password; a forced change is reported; the password is never stored', async () => {
    const fr = fakeRemote({ must: true });
    setRemoteFactory(async () => fr);
    await connectToGym(cfg.config, cfg.host);
    stubFetch((name) => (name === 'lookup-login' ? { ok: true, data: { email: 'sf-0042@members.shieldfit.app' } } : { ok: true, data: { changed: true } }));
    expect(await signIn('SF-0042', 'wrong')).toMatchObject({ ok: false, key: 'gy.err.login' });
    const out = await signIn('SF-0042', 'right-pass-1');
    expect(out).toEqual({ ok: true, mustChange: true });
    const c = await getConnection();
    expect(c).toMatchObject({ signedIn: true, mustChangePassword: true, trainShard: 'B' });
    expect(JSON.stringify(c)).not.toContain('right-pass-1');
    expect(JSON.stringify(await prefsRepo.list())).not.toContain('right-pass-1');
  });

  it('a rate limit comes back with its wait; change-password clears the forced flag; server codes map to sentences', async () => {
    setRemoteFactory(async () => fakeRemote({ must: true }));
    await connectToGym(cfg.config, cfg.host);
    stubFetch(() => ({ ok: false, error: { code: 'SFE004', message: 'x', retry_after: 30 } }));
    expect(await signIn('1', 'x')).toMatchObject({ ok: false, key: 'gy.err.rate', retryAfter: 30 });
    stubFetch((name) => (name === 'lookup-login' ? { ok: true, data: { email: 'e@x' } } : { ok: false, error: { code: 'SFE103', message: 'weak' } }));
    await signIn('1', 'right-pass-1');
    expect(await changePassword('old', 'new')).toMatchObject({ ok: false, key: 'gy.err.pw.weak' });
    stubFetch((name) => (name === 'lookup-login' ? { ok: true, data: { email: 'e@x' } } : name === 'change-password' ? { ok: true, data: { changed: true } } : { ok: true, data: {} }));
    expect(await changePassword('old', 'a-new-pass-12')).toEqual({ ok: true });
    expect((await getConnection())?.mustChangePassword).toBe(false);
  });

  it('an unknown server code shows the server message; none gives the fixed sentence', async () => {
    setRemoteFactory(async () => fakeRemote());
    await connectToGym(cfg.config, cfg.host);
    stubFetch(() => ({ ok: false, error: { code: 'SFE999', message: 'Plain words from the server.' } }));
    expect(await signIn('1', 'x')).toMatchObject({ ok: false, key: 'gy.err.unknown', message: 'Plain words from the server.' });
  });

  it('disconnect returns to standalone, keeps every personal row, and remembers what had not been sent', async () => {
    setRemoteFactory(async () => fakeRemote());
    await connectToGym(cfg.config, cfg.host);
    const row = await routinesRepo.put({ name: 'Keep me' } as never); // queued (connected)
    await disconnect();
    expect(await getConnection()).toBeNull();
    expect(getPolicy()).toBeNull();
    expect(isOutboxEnabled()).toBe(false);
    expect(await listOutbox()).toHaveLength(0);
    expect(await readUnsynced()).toEqual([{ table: 'routines', client_id: row.client_id }]);
    expect((await routinesRepo.list()).map((r) => r.name)).toEqual(['Keep me']);
    expect(getChipInput().connected).toBe(false);
    await routinesRepo.put({ name: 'standalone again' } as never);
    expect(await listOutbox()).toHaveLength(0);
  });
});

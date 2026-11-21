import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, resetDb, setClock, setOutboxEnabled } from '../../src/data/local';
import { freeEmail } from '../../src/shared/freeAccount';
import { setFreeConfigForTest } from '../../src/app/freeBuild';
import { backupHomeView } from '../../src/shared/freeAccount';
import { stopBackup } from '../../src/data/gym/backupBoot';
import { readDirty, readLast, readMode, writeMode } from '../../src/data/gym/backupMeta';
import { cancelReset, checkReset, forgetTicket, readForgotLock, readTicket, recoverySaved, redeemReset, requestReset, confirmSaved, setRecoveryAnswers, createFreeAccount, deleteFreeBackup, finishSetup, freeTokenGetter, readAccount, restoreAfterSignIn, signInFree, takeShownOnce, type FreeDeps } from '../../src/data/gym/freeAccount';
import { initFreeBackup } from '../../src/data/gym/freeBoot';
import { writeOwner } from '../../src/data/gym/restore';

const CORE = 'https://core.supabase.co/functions/v1';
const SHARD = { id: 'F1', url: 'https://f1.supabase.co', anonKey: 'shard-anon-1234' };
const config = { shards: [SHARD], functionsUrl: CORE, coreAnon: 'core-anon-1234' };
const SID = '11111111-2222-4333-8444-555555555551';

/** One fake world behind the global `fetch`: core functions, the free shard's Auth, PostgREST manifest, Storage. */
function world() {
  const w = {
    calls: [] as string[],
    accounts: new Map<string, { freeId: string; username: string; password: string; uid: string }>(),
    manifest: new Map<string, Record<string, unknown>>(),
    objects: new Map<string, Uint8Array>(),
    tokens: new Map<string, string>(),
    refresh: new Map<string, string>(),
    collisions: 0,
    closed: false,
    failManifestPost: false,
    offline: false,
    refreshCalls: 0,
    locked: false,
    resetCalls: 0,
    tickets: new Map<string, { identifier: string; status: string; used: boolean }>(),
    n: 0,
  };
  const res = (status: number, body: unknown) => {
    const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body));
    return { status, headers: { get: () => null }, json: async () => JSON.parse(new TextDecoder().decode(bytes)), text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  const fn = (ok: boolean, data: unknown, status = 200) => res(status, ok ? { ok: true, data } : { ok: false, error: data });
  const uidOf = (init: { headers: Record<string, string> }) => w.tokens.get((init.headers.Authorization ?? '').replace('Bearer ', ''));
  const issue = (uid: string) => {
    const a = `acc-${++w.n}`, r = `ref-${w.n}`;
    w.tokens.set(a, uid);
    w.refresh.set(r, uid);
    return { access_token: a, refresh_token: r, expires_in: 3600, user: { id: uid } };
  };
  async function route(url: string, init: { method: string; headers: Record<string, string>; body?: unknown }) {
    if (w.offline) throw new TypeError('Failed to fetch');
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const path = url.replace(/^https:\/\/[^/]+/, '');
    if (url.startsWith(CORE)) {
      const name = url.slice(CORE.length + 1);
      w.calls.push(name);
      if (name === 'free-signup') {
        if (w.closed) return fn(false, { code: 'SFE705', message: 'paused' }, 503);
        if (w.collisions > 0) { w.collisions--; return fn(false, { code: 'SFE701', message: 'taken' }, 409); }
        const username = String(body.username);
        const freeId = 'FR1-7K2Q9';
        w.accounts.set(freeId, { freeId, username, password: String(body.password), uid: SID });
        return fn(true, { free_id: freeId, username, shard: SHARD });
      }
      if (name === 'free-lookup') {
        const id = String(body.identifier);
        const a = [...w.accounts.values()].find((x) => x.freeId === id || x.username === id);
        return fn(true, { shard: SHARD, email: a ? freeEmail(a.freeId) : 'fr1-zzzzz@free.shieldfit.app' });
      }
      if (name === 'free-recovery-set') {
        if (!uidOf(init as never)) return fn(false, { code: 'SFE201', message: 'no' }, 401);
        return fn(true, { set: true });
      }
      if (name === 'free-reset-request') {
        if (w.locked) return fn(false, { code: 'SFE708', message: 'locked' }, 429);
        w.resetCalls++;
        const code = `T-${w.resetCalls}`;
        w.tickets.set(code, { identifier: String(body.identifier), status: 'cooling', used: false });
        return fn(true, { ticket_code: code, ready_after: '2026-11-22T06:00:00.000Z' });
      }
      if (name === 'free-reset-status') {
        const t = w.tickets.get(String(body.ticket_code));
        if (!t || t.identifier !== String(body.identifier)) return fn(false, { code: 'SFE101', message: 'no' }, 401);
        return fn(true, { status: t.status, ready_after: '2026-11-22T06:00:00.000Z', redeem_until: '2026-11-23T06:00:00.000Z' });
      }
      if (name === 'free-reset-cancel') {
        if (!uidOf(init as never)) return fn(false, { code: 'SFE201', message: 'no' }, 401);
        const t = w.tickets.get(String(body.ticket_code));
        if (!t || t.status === 'cancelled' || t.status === 'redeemed') return fn(false, { code: 'SFE709', message: 'none' }, 404);
        t.status = 'cancelled';
        return fn(true, { cancelled: true });
      }
      if (name === 'free-reset-redeem') {
        const t = w.tickets.get(String(body.ticket_code));
        if (!t || t.status !== 'approved' || t.used) return fn(false, { code: 'SFE710', message: 'no' }, 409);
        t.used = true;
        t.status = 'redeemed';
        const a = [...w.accounts.values()].find((x) => x.freeId === t.identifier || x.username === t.identifier);
        if (a) { a.password = String(body.new_password); w.tokens.clear(); w.refresh.clear(); }
        return fn(true, { redeemed: true });
      }
      if (name === 'free-delete') {
        const uid = uidOf(init as never);
        if (!uid) return fn(false, { code: 'SFE201', message: 'no' }, 401);
        for (const [k, a] of w.accounts) if (a.uid === uid) w.accounts.delete(k);
        w.manifest.clear();
        w.objects.clear();
        return fn(true, { deleted: true });
      }
      if (name === 'ingest') return fn(true, { accepted: true });
    }
    if (path.startsWith('/auth/v1/token')) {
      if (path.includes('grant_type=password')) {
        const a = [...w.accounts.values()].find((x) => freeEmail(x.freeId) === body.email);
        return !a || a.password !== body.password ? res(400, { error: 'invalid_grant' }) : res(200, issue(a.uid));
      }
      w.refreshCalls++;
      const uid = w.refresh.get(String(body.refresh_token));
      if (!uid) return res(400, { error: 'invalid_grant' });
      w.refresh.delete(String(body.refresh_token)); // single-use
      return res(200, issue(uid));
    }
    const uid = uidOf(init as never);
    if (!uid) return res(401, { message: 'no token' });
    if (path.startsWith('/rest/v1/backup_manifest')) {
      const q = new URL(url).searchParams;
      if (init.method === 'GET') {
        const k = q.get('key')?.replace(/^eq\./, '');
        return res(200, [...w.manifest.values()].filter((r) => !k || r.key === k));
      }
      if (init.method === 'POST') {
        if (w.failManifestPost) return res(500, { message: 'boom' });
        if (w.manifest.has(String(body.key))) return res(201, []);
        w.manifest.set(String(body.key), body);
        return res(201, [body]);
      }
      if (init.method === 'PATCH') {
        const k = q.get('key')!.replace(/^eq\./, '');
        const cur = w.manifest.get(k);
        if (!cur || String(cur.rev) !== q.get('rev')!.replace(/^eq\./, '')) return res(200, []);
        const next = { ...cur, ...body };
        w.manifest.set(k, next);
        return res(200, [next]);
      }
    }
    const m = /^\/storage\/v1\/object\/(?:authenticated\/)?backups\/(.+)$/.exec(path);
    if (m) {
      const p = decodeURIComponent(m[1]!);
      if (init.method === 'POST') { w.objects.set(p, init.body as Uint8Array); return res(200, {}); }
      if (init.method === 'DELETE') { w.objects.delete(p); return res(200, {}); }
      const b = w.objects.get(p);
      return b ? res(200, b) : res(404, {});
    }
    return res(404, {});
  }
  return { w, route };
}

const session = (id: string) => ({
  client_id: id, id, clientId: id, startedAt: '2026-11-05T01:00:00.123Z', endedAt: '2026-11-05T02:00:00.000Z', routineId: 'r-1', dayId: 'd-1', dayName: 'Push',
  items: [{ ref: { kind: 'lib', slug: 'barbell-bench-press' }, status: 'done', order: 0, sets: [{ weightKg: 60, reps: 8, tag: 'normal', doneAt: '2026-11-05T01:10:00.000Z' }] }],
});
const addSession = async (id: string) => (await getDb()).put('sessions', { ...session(id), updated_at: 5_000_000, deleted_at: null } as never);
const sessionCount = async () => (await (await getDb()).getAll('sessions')).length;

let W: ReturnType<typeof world>;
let usernames: number;
const deps = (): FreeDeps => ({ config, online: () => !W.w.offline, now: () => Date.now(), rand: () => ((usernames++ * 0.137) % 1), randInt: (n) => (usernames++ * 7) % n });
const S1 = '11111111-2222-4333-8444-5555555555a1';

beforeEach(async () => {
  W = world();
  usernames = 1;
  setFreeConfigForTest(config); // the build carries the free shard values, so cloud_backup is on
  vi.stubGlobal('fetch', (u: string, i: never) => W.route(u, i));
  // the trigger wiring only listens for browser events; nothing fires in these tests
  const target = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
  vi.stubGlobal('document', target);
  vi.stubGlobal('window', target);
  await resetDb(true);
  setOutboxEnabled(false);
  setClock(() => 7_000_000);
});
afterEach(async () => {
  stopBackup();
  await new Promise((r) => setTimeout(r, 60)); // let the open-time pass of the trigger wiring finish before the next test resets the store
  setFreeConfigForTest(null);
  vi.unstubAllGlobals();
});

/** Opt in end to end: create, take the password, tick, finish. Returns the password. */
async function optIn(): Promise<string> {
  const c = await createFreeAccount(deps());
  expect(c.ok).toBe(true);
  const shown = takeShownOnce()!;
  await confirmSaved();
  expect(await setRecoveryAnswers(deps(), { p1: 'answer one', p2: 'answer two' })).toEqual({ ok: true }); // R3
  const f = await finishSetup(deps());
  expect(f).toEqual({ ok: true });
  return shown.password;
}

describe('free account: opt-in', () => {
  it('nothing is sent before the opt-in: a standalone phone boots, reads one row and makes no request', async () => {
    await initFreeBackup();
    expect(W.w.calls).toHaveLength(0);
    expect(await readMode()).toBe('standalone');
    expect(await readAccount()).toBeNull();
  });

  it('a username collision regenerates the username and retries before showing anything; the password is shown once and never stored', async () => {
    W.w.collisions = 2;
    const c = await createFreeAccount(deps());
    expect(c.ok).toBe(true);
    expect(W.w.calls.filter((x) => x === 'free-signup')).toHaveLength(3);
    const shown = takeShownOnce()!;
    expect(shown.password).toHaveLength(16);
    expect(shown.freeId).toBe('FR1-7K2Q9');
    expect(takeShownOnce()).toBeNull(); // shown once
    const meta = JSON.stringify(await (await getDb()).getAll('meta'));
    expect(meta).not.toContain(shown.password);
    expect((await readAccount())!.saved).toBe(false);
    expect(await readMode()).toBe('standalone'); // not backing up yet
  });

  it('three collisions in a row end with the plain generic line and no account', async () => {
    W.w.collisions = 3;
    const c = await createFreeAccount(deps());
    expect(c).toMatchObject({ ok: false, error: { key: 'bk.err.generic' } });
    expect(W.w.calls.filter((x) => x === 'free-signup')).toHaveLength(3);
    expect(await readAccount()).toBeNull();
  });

  it('signups closed (SFE705): the paused line, nothing created, one call', async () => {
    W.w.closed = true;
    const c = await createFreeAccount(deps());
    expect(c).toMatchObject({ ok: false, code: 'SFE705', error: { key: 'bk.err.paused' } });
    expect(W.w.calls.filter((x) => x === 'free-signup')).toHaveLength(1);
    expect(await readAccount()).toBeNull();
    expect(await readMode()).toBe('standalone');
  });

  it('offline: a plain line and no request', async () => {
    W.w.offline = true;
    expect(await createFreeAccount(deps())).toMatchObject({ ok: false, error: { key: 'bk.offline' } });
    expect(W.w.calls).toHaveLength(0);
  });

  it('first backup: after "I saved it" the chunks are written, then the mode flips to free_backup', async () => {
    await addSession(S1);
    await optIn();
    expect(await readMode()).toBe('free_backup');
    expect([...W.w.manifest.keys()]).toContain('sessions:2026-11');
    expect([...W.w.objects.keys()].some((k) => k.startsWith(`${SID}/sessions_2026-11/`))).toBe(true);
    expect(await readDirty()).toEqual([]);
    expect(W.w.calls).toContain('ingest');
  });

  it('an empty phone can opt in: no chunk is written, the mode flips, and the status line has a "last backup" time (no false alarm)', async () => {
    await optIn();
    expect(await readMode()).toBe('free_backup');
    expect(W.w.manifest.size).toBe(0);
    expect((await readLast())?.ok_at).toBeTruthy();
  });

  it('finish before the password was confirmed saved is refused', async () => {
    await createFreeAccount(deps());
    expect(await finishSetup(deps())).toMatchObject({ ok: false });
    expect(await readMode()).toBe('standalone');
  });

  it('a first push that fails leaves the mode standalone and the account in place (R1 offers "Finish setting up"), then a retry finishes', async () => {
    await addSession(S1);
    W.w.failManifestPost = true;
    await createFreeAccount(deps());
    takeShownOnce();
    await confirmSaved();
    await setRecoveryAnswers(deps(), { p1: 'answer one', p2: 'answer two' });
    const f = await finishSetup(deps());
    expect(f.ok).toBe(false);
    expect(await readMode()).toBe('standalone');
    const acct = await readAccount();
    expect(acct?.saved).toBe(true);
    expect(backupHomeView({ cloudBackupOn: true, freeAccountOn: true, configReady: true, mode: 'standalone', account: acct, phoneEmpty: false })).toEqual({ kind: 'finish' });
    W.w.failManifestPost = false;
    // the failed key is in back-off; a later pass (or "Finish setting up") sends it
    await (await getDb()).delete('meta', 'backup:attempts:sessions:2026-11');
    expect(await finishSetup(deps())).toEqual({ ok: true });
    expect(await readMode()).toBe('free_backup');
  });

  it('an account whose password was never saved is deleted before a new one is made', async () => {
    await createFreeAccount(deps());
    takeShownOnce();
    W.w.calls.length = 0;
    await createFreeAccount(deps());
    expect(W.w.calls[0]).toBe('free-delete');
    expect(W.w.accounts.size).toBe(1);
  });
});

describe('free account: reinstall sign-in, restore, delete', () => {
  it('reinstall: sign in with the username, the data comes back; a wrong password and an unknown id read the same', async () => {
    await addSession(S1);
    const pw = await optIn();
    stopBackup();
    await resetDb(true); // a reinstall: the phone is empty, the server keeps the backup
    expect(await sessionCount()).toBe(0);
    const bad = await signInFree(deps(), 'lifter-nope', pw);
    const wrong = await signInFree(deps(), [...W.w.accounts.values()][0]!.username, 'wrong-password-1');
    expect(bad).toMatchObject({ ok: false, error: { key: 'bk.err.id' } });
    expect(wrong).toMatchObject({ ok: false, error: { key: 'bk.err.id' } });
    expect(await readMode()).toBe('standalone');
    const username = [...W.w.accounts.values()][0]!.username;
    const ok = await signInFree(deps(), username, pw);
    expect(ok).toMatchObject({ ok: true, freeId: 'FR1-7K2Q9', rows: 0 });
    expect(await readMode()).toBe('free_backup');
    await restoreAfterSignIn(deps());
    expect(await sessionCount()).toBe(1);
  });

  it('sign in with the free id works too (upper-cased by the app)', async () => {
    const pw = await optIn();
    stopBackup();
    await resetDb(true);
    const ok = await signInFree(deps(), 'fr1-7k2q9', pw);
    expect(ok).toMatchObject({ ok: true, freeId: 'FR1-7K2Q9' });
    expect((await readAccount())!.username).toBeNull();
  });

  it('another person\'s data on this phone is never merged: a stamped owner with rows blocks the sign-in', async () => {
    const pw = await optIn();
    stopBackup();
    await resetDb(true);
    await addSession(S1);
    await writeOwner('free:FR9-AAAAA');
    const r = await signInFree(deps(), 'FR1-7K2Q9', pw);
    expect(r).toMatchObject({ ok: false, owner: true });
    expect(await readMode()).toBe('standalone');
    expect(await readAccount()).toBeNull();
  });

  it('delete: the server removes everything, the phone forgets the account and goes standalone, every workout on the phone stays', async () => {
    await addSession(S1);
    await optIn();
    await new Promise((r) => setTimeout(r, 60)); // the person opens Delete a moment later; the open-time pass has finished by then
    const r = await deleteFreeBackup(deps());
    expect(r).toEqual({ ok: true });
    expect(W.w.accounts.size).toBe(0);
    expect(W.w.manifest.size).toBe(0);
    expect(await readMode()).toBe('standalone');
    expect(await readAccount()).toBeNull();
    expect(await readDirty()).toEqual([]);
    expect(await sessionCount()).toBe(1);
  });

  it('delete while offline changes nothing (the account stays, the mode stays)', async () => {
    await optIn();
    W.w.offline = true;
    expect(await deleteFreeBackup(deps())).toMatchObject({ ok: false, error: { key: 'bk.offline' } });
    expect(await readMode()).toBe('free_backup');
    expect(await readAccount()).not.toBeNull();
  });

  it('boot in free_backup mode starts the runtime for the stored account; with no account nothing runs', async () => {
    await writeMode('free_backup');
    expect(await initFreeBackup()).toBeUndefined(); // freeBoot reads the mode, finds no account and stops quietly
    expect(W.w.calls).toHaveLength(0);
  });
});

describe('free account: session token', () => {
  it('an expired access token is refreshed once even when two calls ask at the same time (a refresh token is single-use)', async () => {
    await optIn();
    const rec = (await readAccount())!;
    const db = await getDb();
    const s = (await db.get('meta', 'free:session'))!.value as { access_token: string; refresh_token: string; expires_at: number };
    await db.put('meta', { key: 'free:session', value: { ...s, expires_at: Date.now() - 1000 } });
    const get = freeTokenGetter(deps(), rec.shard);
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(W.w.refreshCalls).toBe(1);
  });

  it('an evicted session (refresh refused) gives no token, so the runtime pauses and the person signs in again', async () => {
    await optIn();
    const rec = (await readAccount())!;
    const db = await getDb();
    await db.put('meta', { key: 'free:session', value: { access_token: 'x', refresh_token: 'gone', expires_at: Date.now() - 1000 } });
    expect(await freeTokenGetter(deps(), rec.shard)()).toBeNull();
  });
});

describe('Phase 79: recovery questions (R3) and forgot password (R7-R9)', () => {
  const ASK = { identifier: 'Lifter-7K2Q', firstMonth: '2025-01', lastMonth: '2026-10', band: '30-99', answers: { p1: 'answer one', p2: 'answer two' } };

  it('the first backup is refused until the recovery answers are saved; no answers stay on the phone', async () => {
    await createFreeAccount(deps());
    takeShownOnce();
    await confirmSaved();
    expect(await finishSetup(deps())).toMatchObject({ ok: false, code: 'RECOVERY' });
    expect(await readMode()).toBe('standalone');
    expect(await setRecoveryAnswers(deps(), { p1: 'a', p2: 'long enough' })).toMatchObject({ ok: false, fields: ['p1'] });
    expect(await recoverySaved()).toBe(false);
    expect(await setRecoveryAnswers(deps(), { p1: 'secret one', p2: 'secret two' })).toEqual({ ok: true });
    expect(await recoverySaved()).toBe(true);
    const dump = JSON.stringify(await (await getDb()).getAll('meta'));
    expect(dump).not.toContain('secret one');
    expect(dump).not.toContain('secret two');
    expect(await finishSetup(deps())).toEqual({ ok: true });
  });

  it('a request keeps one open ticket: a second is not sent', async () => {
    const r = await requestReset(deps(), ASK);
    expect(r).toMatchObject({ ok: true, code: 'T-1' });
    expect((await readTicket())?.identifier).toBe('lifter-7k2q');
    expect(await requestReset(deps(), ASK)).toMatchObject({ ok: false, code: 'OPEN' });
    expect(W.w.resetCalls).toBe(1);
  });

  it('wrong answers lock the button for 24 hours (SFE708) and nothing is stored', async () => {
    W.w.locked = true;
    expect(await requestReset(deps(), ASK)).toMatchObject({ ok: false, code: 'SFE708', error: { key: 'bk.err.locked' } });
    expect(await readTicket()).toBeNull();
    expect(await readForgotLock()).toBeGreaterThan(Date.now());
  });

  it('a bad box is caught before anything is sent', async () => {
    const r = await requestReset(deps(), { ...ASK, band: '' });
    expect(r).toMatchObject({ ok: false, code: 'SFE001', fields: ['sessions_band'] });
    expect(W.w.resetCalls).toBe(0);
  });

  it('status follows the server; a closed ticket is forgotten; a code typed by hand is remembered while open', async () => {
    await requestReset(deps(), ASK);
    expect(await checkReset(deps(), 'lifter-7k2q', 'T-1')).toMatchObject({ ok: true, status: 'cooling' });
    expect(await checkReset(deps(), 'lifter-7k2q', 'WRONG')).toMatchObject({ ok: false, code: 'SFE101' });
    W.w.tickets.get('T-1')!.status = 'denied';
    expect(await checkReset(deps(), 'lifter-7k2q', 'T-1')).toMatchObject({ ok: true, status: 'denied' });
    expect(await readTicket()).toBeNull();
    W.w.tickets.set('T-9', { identifier: 'lifter-7k2q', status: 'waiting', used: false });
    await checkReset(deps(), 'lifter-7k2q', 'T-9');
    expect((await readTicket())?.code).toBe('T-9');
  });

  it('a signed-in phone can cancel; cancelling twice says there is no open request', async () => {
    await optIn();
    await requestReset(deps(), { ...ASK, identifier: 'lifter-0000' });
    const t = (await readTicket())!;
    expect(await cancelReset(deps(), t.code)).toEqual({ ok: true });
    expect(W.w.tickets.get(t.code)!.status).toBe('cancelled');
    expect(await readTicket()).toBeNull();
    expect(await cancelReset(deps(), t.code)).toMatchObject({ ok: false, code: 'SFE709', error: { key: 'bk.err.noticket' } });
  });

  it('redeem works once; a second try, or one before approval, gets the not-ready message', async () => {
    await requestReset(deps(), ASK);
    expect(await redeemReset(deps(), 'lifter-7k2q', 'T-1', 'NewPassw0rdNewPw')).toMatchObject({ ok: false, code: 'SFE710', error: { key: 'bk.err.notready' } });
    W.w.tickets.get('T-1')!.status = 'approved';
    expect(await redeemReset(deps(), 'lifter-7k2q', 'T-1', 'NewPassw0rdNewPw')).toEqual({ ok: true });
    expect(await readTicket()).toBeNull();
    expect(await redeemReset(deps(), 'lifter-7k2q', 'T-1', 'AnotherPassw0rd99')).toMatchObject({ ok: false, code: 'SFE710' });
  });

  it('a stale ticket (run out on the server) reads as expired and is forgotten', async () => {
    await requestReset(deps(), ASK);
    W.w.tickets.get('T-1')!.status = 'expired';
    expect(await checkReset(deps(), 'lifter-7k2q', 'T-1')).toMatchObject({ ok: true, status: 'expired' });
    expect(await readTicket()).toBeNull();
    await forgetTicket();
  });

  it('offline: nothing is sent and the ticket is untouched', async () => {
    W.w.offline = true;
    expect(await requestReset(deps(), ASK)).toMatchObject({ ok: false, code: 'OFFLINE' });
    expect(await readTicket()).toBeNull();
  });
});

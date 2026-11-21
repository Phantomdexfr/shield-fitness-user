// Phase 78: the free backup account (no gym needed). Talks to the core Edge Functions (`free-signup`, `free-lookup`, `free-delete`) and to
// the free shard's Auth over plain fetch (no Supabase library), then hands the signed-in shard to the Phase 76 backup runtime.
// Contract connected-api 1.1.0 "Backups and free accounts"; screens docs/GYM_CONNECTION.md P74-1. Lazy: only the backup pages and
// `freeBoot.ts` import this, so a standalone phone that never opts in never loads it. The password is generated on the phone, shown
// once and NEVER stored; only the refresh token of the session is kept. Unproven until it runs against a real free shard (Admin 51).
import { getDb } from '../local';
import { buildAllChunks } from '../local/chunks';
import { resolveFeature } from '../../app/flags';
import { CHUNK_SCHEMA } from '../../shared/chunks';
import { isResetStatus, lockedUntil, TICKET_LIFE_MS, sameAccount, validateAnswers, validateForgot, type ForgotInput, type RecoveryAnswers, type ResetStatus, type TicketRec } from '../../shared/freeRecovery';
import { planAutoRestore } from '../../shared/restoreFlow';
import {
  FREE_CONSENT_VERSION, MAX_SIGNUP_TRIES, freeEmail, freeError, freeIdFromEmail, makePassword, makeUsername, normaliseIdentifier, parseFreeShards,
  type FreeAccountRec, type FreeConfig, type FreeErrorView, type FreeShard,
} from '../../shared/freeAccount';
import { callFunction, type FetchLike, type FnResult } from './functions';
import { clearBackupMeta, markDirty, readLast, readMode, writeLast, writeMode } from './backupMeta';
import { runBackupPass } from './backupRun';
import { depsFromAccess, startBackup, stopBackup } from './backupBoot';
import { restoreIsRunning } from './backupRestore';
import { liveRowCount, readOwner, writeOwner } from './restore';
import type { Assessment } from './autoRestore';
import type { BackupAccess } from './types';

export interface FreeDeps {
  config: FreeConfig;
  /** Test seam (default: the browser `fetch`). Used for the core functions and the shard's Auth alike. */
  fetchFn?: FetchLike;
  now?: () => number;
  /** A number in [0, 1). */
  rand?: () => number;
  /** An unbiased integer in [0, n). */
  randInt?: (n: number) => number;
  online?: () => boolean;
}

/** Unbiased integer from the browser's secure random source. */
export function secureRandomInt(n: number): number {
  const buf = new Uint32Array(1);
  const lim = Math.floor(0x100000000 / n) * n;
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] ?? 0;
    if (v < lim) return v % n;
  }
}
const D = (d: FreeDeps) => ({
  fetchFn: d.fetchFn ?? ((u: string, i: Parameters<FetchLike>[1]) => fetch(u, i as RequestInit) as never),
  now: d.now ?? Date.now,
  rand: d.rand ?? (() => secureRandomInt(1_000_000) / 1_000_000),
  randInt: d.randInt ?? secureRandomInt,
  online: d.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false),
});
const fnConfig = (d: FreeDeps) => ({ functions: d.config.functionsUrl, core: { url: '', anon: d.config.coreAnon } }) as never;

// ---------------------------------------------------------------- what the phone remembers (`meta`, never exported, never synced)

const ACCOUNT_KEY = 'free:account';
const SESSION_KEY = 'free:session';
/** Phase 79: only the fact that the answers were saved (a flag), never the answers. */
const RECOVERY_KEY = 'free:recovery';
const TICKET_KEY = 'free:ticket';
const LOCK_KEY = 'free:forgot_lock';
interface Sess { access_token: string; refresh_token: string; expires_at: number }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

async function getMeta(key: string): Promise<unknown> {
  return (await (await getDb()).get('meta', key))?.value;
}
async function putMeta(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('meta', { key, value });
}
async function delMeta(key: string): Promise<void> {
  await (await getDb()).delete('meta', key);
}

export async function readAccount(): Promise<FreeAccountRec | null> {
  const v = await getMeta(ACCOUNT_KEY);
  if (!isObj(v) || typeof v.free_id !== 'string' || typeof v.uid !== 'string' || !isObj(v.shard)) return null;
  const [shard] = parseFreeShards([v.shard]);
  if (!shard) return null;
  return { free_id: v.free_id, username: typeof v.username === 'string' ? v.username : null, shard, uid: v.uid, saved: v.saved === true };
}
const writeAccount = (r: FreeAccountRec): Promise<void> => putMeta(ACCOUNT_KEY, r);
async function readSession(): Promise<Sess | null> {
  const v = await getMeta(SESSION_KEY);
  return isObj(v) && typeof v.access_token === 'string' && typeof v.refresh_token === 'string' && typeof v.expires_at === 'number' ? (v as unknown as Sess) : null;
}
const writeSession = (s: Sess): Promise<void> => putMeta(SESSION_KEY, s);
async function clearAccount(): Promise<void> {
  await delMeta(ACCOUNT_KEY);
  await delMeta(SESSION_KEY);
  await delMeta(RECOVERY_KEY); // a deleted or replaced account has no answers and no open request
  await delMeta(TICKET_KEY);
}
const ownerOf = (freeId: string): string => `free:${freeId}`;
async function clearFreeOwner(): Promise<void> {
  const o = await readOwner();
  if (o && o.startsWith('free:')) await delMeta('owner');
}

// ---------------------------------------------------------------- shard Auth (GoTrue REST)

type AuthOk = { ok: true; session: Sess; uid: string };
type AuthFail = { ok: false; code: 'SFE101' | 'SFE004' | 'OFFLINE' | 'ASLEEP' | 'DEAD'; retryAfter?: number };

async function authToken(d: FreeDeps, shard: FreeShard, grant: 'password' | 'refresh_token', body: Record<string, string>): Promise<AuthOk | AuthFail> {
  const x = D(d);
  if (!x.online()) return { ok: false, code: 'OFFLINE' };
  try {
    const res = await x.fetchFn(`${shard.url}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: shard.anonKey }, body: JSON.stringify(body) });
    if (res.status === 429) return { ok: false, code: 'SFE004', retryAfter: 30 };
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422) return { ok: false, code: grant === 'password' ? 'SFE101' : 'DEAD' };
    if (res.status < 200 || res.status >= 300) return { ok: false, code: 'ASLEEP' };
    let j: unknown;
    try { j = await res.json(); } catch { return { ok: false, code: 'ASLEEP' }; }
    const o = j as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; user?: { id?: unknown } };
    if (typeof o?.access_token !== 'string' || typeof o.refresh_token !== 'string' || typeof o.user?.id !== 'string') return { ok: false, code: 'ASLEEP' }; // a captive-portal page is never a session
    const secs = typeof o.expires_in === 'number' && o.expires_in > 0 ? o.expires_in : 3600;
    return { ok: true, uid: o.user.id, session: { access_token: o.access_token, refresh_token: o.refresh_token, expires_at: x.now() + secs * 1000 } };
  } catch {
    return { ok: false, code: 'OFFLINE' };
  }
}

/** The token getter for the backup remote: the stored access token, refreshed a minute before it ends (one refresh at a time: a refresh token is single-use). */
export function freeTokenGetter(d: FreeDeps, shard: FreeShard): () => Promise<string | null> {
  let inflight: Promise<string | null> | null = null;
  return async () => {
    const s = await readSession();
    if (!s) return null;
    if (s.expires_at - D(d).now() > 60_000) return s.access_token;
    inflight ??= (async () => {
      const r = await authToken(d, shard, 'refresh_token', { refresh_token: s.refresh_token });
      if (r.ok) { await writeSession(r.session); return r.session.access_token; }
      if (r.code === 'DEAD') { await delMeta(SESSION_KEY); return null; } // evicted: the runtime pauses, the person signs in again (R5)
      return s.access_token; // offline: the call fails as offline by itself
    })().finally(() => { inflight = null; });
    return inflight;
  };
}

/** The signed-in free shard as the backup runtime wants it. */
export function freeRuntime(d: FreeDeps, rec: FreeAccountRec) {
  const a: BackupAccess = { url: rec.shard.url, anon: rec.shard.anonKey, shardId: rec.shard.id, ownerUid: rec.uid, memberId: null, getToken: freeTokenGetter(d, rec.shard) };
  const x = D(d);
  return depsFromAccess(a, { url: d.config.functionsUrl, coreAnon: d.config.coreAnon }, x.now, x.rand);
}

// ---------------------------------------------------------------- R2 -> R4: create the account

/** Held in memory between the account being made and the person ticking "I saved it". Reading it once clears it. */
let shownOnce: { freeId: string; username: string; password: string } | null = null;
export function takeShownOnce(): { freeId: string; username: string; password: string } | null {
  const v = shownOnce;
  shownOnce = null;
  return v;
}

export type CreateResult = { ok: true; freeId: string; username: string } | { ok: false; error: FreeErrorView; code: string };
const fail = (code: string | undefined, r?: Partial<Extract<FnResult, { ok: false }>>): { ok: false; error: FreeErrorView; code: string } => ({ ok: false, code: code ?? 'UNKNOWN', error: freeError(code, { retryAfter: r?.retry_after, fields: r?.fields }) });

/**
 * R2 "I agree and continue": the phone makes the username and password, `free-signup`, then signs in once to hold the session. On
 * `SFE701` it regenerates the username and tries again BEFORE showing anything (3 tries). A half-made account from an earlier
 * attempt whose password was never saved is deleted first. Nothing is sent before this call (standalone stays complete).
 */
export async function createFreeAccount(d: FreeDeps): Promise<CreateResult> {
  const x = D(d);
  if (!x.online()) return fail('OFFLINE');
  await discardUnsaved(d);
  const password = makePassword(x.randInt);
  let signup: { free_id: string; username: string; shard: FreeShard } | null = null;
  for (let i = 0; i < MAX_SIGNUP_TRIES && !signup; i++) {
    const username = makeUsername(x.rand);
    const r = await callFunction<{ free_id?: string; username?: string; shard?: unknown }>(fnConfig(d), 'free-signup', { username, password, consent: true, consent_version: FREE_CONSENT_VERSION, website: '' }, undefined, x.fetchFn, x.online());
    if (r.ok) {
      const [shard] = parseFreeShards([r.data.shard]);
      if (typeof r.data.free_id !== 'string' || !shard) return fail('UNKNOWN');
      signup = { free_id: r.data.free_id, username: typeof r.data.username === 'string' ? r.data.username : username, shard };
    } else if (r.code !== 'SFE701') return fail(r.code, r);
  }
  if (!signup) return fail('SFE701');
  const auth = await authToken(d, signup.shard, 'password', { email: freeEmail(signup.free_id), password });
  if (!auth.ok) return fail(auth.code); // the account exists but cannot be used; the next attempt starts a new one
  await writeSession(auth.session);
  await writeAccount({ free_id: signup.free_id, username: signup.username, shard: signup.shard, uid: auth.uid, saved: false });
  shownOnce = { freeId: signup.free_id, username: signup.username, password };
  return { ok: true, freeId: signup.free_id, username: signup.username };
}

/** An account whose password was never confirmed saved cannot be used again: remove it from the server (best effort) and from the phone. */
export async function discardUnsaved(d: FreeDeps): Promise<void> {
  const rec = await readAccount();
  if (!rec || rec.saved) return;
  const token = await freeTokenGetter(d, rec.shard)();
  if (token) await callFunction(fnConfig(d), 'free-delete', { confirm: true }, token, D(d).fetchFn, D(d).online()).catch(() => undefined);
  await clearAccount();
  shownOnce = null;
}

/** R4 "I saved it" ticked and Done pressed. */
export async function confirmSaved(): Promise<void> {
  const rec = await readAccount();
  if (rec && !rec.saved) await writeAccount({ ...rec, saved: true });
}

export type FinishResult = { ok: true } | { ok: false; error: FreeErrorView; code: string };
/**
 * R4 Done and R1 "Finish setting up": the first backup. The mode flips to `free_backup` only when every chunk was written; any
 * failure puts it back to `standalone` and the account stays (R1 then offers "Finish setting up"). [A-P78.2] The recovery-questions
 * step (R3, Phase 79) sits between R4 and this call: without the saved flag it answers `RECOVERY` and the page sends the person to R3.
 */
export async function finishSetup(d: FreeDeps): Promise<FinishResult> {
  const rec = await readAccount();
  if (!rec?.saved) return fail('UNKNOWN');
  if ((await getMeta(RECOVERY_KEY)) !== true) return fail('RECOVERY'); // R3 is required: no first backup before the recovery answers are saved
  const x = D(d);
  if (!x.online()) return fail('OFFLINE');
  const rt = freeRuntime(d, rec);
  const before = await readMode();
  await writeMode('free_backup'); // the push executor sends nothing in `standalone`
  for (const c of (await buildAllChunks()).chunks) await markDirty(c.key);
  const pass = await runBackupPass(rt.deps);
  const bad = Object.values(pass.outcomes).find((o) => o.kind !== 'pushed' && o.kind !== 'noop' && o.kind !== 'pulled' && o.kind !== 'both_gone');
  if (pass.stoppedBy === 'auth' || bad) {
    await writeMode(before === 'free_backup' ? 'free_backup' : 'standalone');
    const code = pass.stoppedBy === 'auth' ? 'SFE201' : bad && 'code' in bad ? bad.code : bad?.kind === 'retry' ? 'OFFLINE' : 'UNKNOWN';
    return fail(code ?? 'OFFLINE');
  }
  if (!(await readOwner())) await writeOwner(ownerOf(rec.free_id));
  if (!(await readLast())?.ok_at) await writeLast({ ok_at: x.now() }); // an empty phone has no chunk to write; the account itself was verified, so the status line must not say "needs attention"
  await startBackup(rt);
  return { ok: true };
}

// ---------------------------------------------------------------- R5: sign in on a reinstall

export type SignInResult = { ok: true; freeId: string; rows: number } | { ok: false; error: FreeErrorView; code: string } | { ok: false; owner: true; error: FreeErrorView; code: 'OWNER' };
/** `free-lookup` (always answers), then sign in to the returned shard. A wrong id and a wrong password look the same (`SFE101`). */
export async function signInFree(d: FreeDeps, identifier: string, password: string): Promise<SignInResult> {
  const x = D(d);
  const id = normaliseIdentifier(identifier);
  if (!id || password === '') return fail('SFE101');
  if (!x.online()) return fail('OFFLINE');
  const l = await callFunction<{ shard?: unknown; email?: unknown }>(fnConfig(d), 'free-lookup', { identifier: id }, undefined, x.fetchFn, x.online());
  if (!l.ok) return fail(l.code, l);
  const [shard] = parseFreeShards([l.data.shard]);
  if (!shard || typeof l.data.email !== 'string') return fail('SFE101');
  const auth = await authToken(d, shard, 'password', { email: l.data.email, password });
  if (!auth.ok) return fail(auth.code, { retry_after: auth.retryAfter });
  const freeId = freeIdFromEmail(l.data.email);
  if (!freeId) return fail('SFE101'); // a decoy email never signs in; this is only a guard
  const stamp = await readOwner();
  const rows = await liveRowCount();
  if (stamp && stamp !== ownerOf(freeId) && rows > 0) return { ok: false, owner: true, error: { key: 'bk.rs.other' }, code: 'OWNER' }; // another person's data on this phone: never merged
  await writeSession(auth.session);
  await writeAccount({ free_id: freeId, username: /^fr\d+-/i.test(id) ? null : id, shard, uid: auth.uid, saved: true });
  await writeMode('free_backup');
  if (!stamp) await writeOwner(ownerOf(freeId));
  return { ok: true, freeId, rows };
}

/** After R5: ask the shard what it holds and decide as the gym path does (`planAutoRestore`). A deliberate free sign-in counts as asking to restore [A-P78.3]. */
export async function assessFree(d: FreeDeps): Promise<Assessment | null> {
  const rec = await readAccount();
  if (!rec) return null;
  const rt = freeRuntime(d, rec);
  const signedIn = !!(await readSession());
  const feature = resolveFeature('cloud_backup');
  let manifests: { key: string; rows: number; schema: number }[] | null = null;
  if (signedIn && feature) {
    const l = await rt.remote.listManifests();
    manifests = l.error ? null : l.rows.map((r) => ({ key: r.key, rows: r.rows, schema: r.schema }));
  }
  const decision = planAutoRestore({
    signedIn, mustChangePassword: false, cloudBackupOn: feature, autoRestoreOn: true, shardKnown: true,
    stampedOwner: await readOwner(), currentOwner: ownerOf(rec.free_id), localRows: await liveRowCount(), manifests, supportedSchema: CHUNK_SCHEMA, restoreRunning: await restoreIsRunning(),
  });
  return { decision, rt };
}

/** Sign-in done: assess, and run the restore by itself when the phone is empty; the R6 page shows the progress. Resolves when the restore ends. */
export async function restoreAfterSignIn(d: FreeDeps): Promise<void> {
  const a = await assessFree(d);
  if (!a) return;
  const m = await import('./autoRestore');
  if (a.decision.kind === 'start') await m.runChunkRestore(a);
  else m.setRestoreView({ s: 'decision', d: a.decision });
  if (a.rt) await startBackup(a.rt);
}

// ---------------------------------------------------------------- R11: delete my backup

export type DeleteResult = { ok: true } | { ok: false; error: FreeErrorView; code: string };
/**
 * `free-delete {confirm:true}` removes the login, the objects, the manifest rows and the recovery answers. Only when the server said
 * yes does the phone forget the account and go back to `standalone`. Everything on this phone stays.
 */
export async function deleteFreeBackup(d: FreeDeps): Promise<DeleteResult> {
  const rec = await readAccount();
  if (!rec) { await writeMode('standalone'); return { ok: true }; }
  const x = D(d);
  if (!x.online()) return fail('OFFLINE');
  const token = await freeTokenGetter(d, rec.shard)();
  if (!token) return fail('SFE201');
  const r = await callFunction(fnConfig(d), 'free-delete', { confirm: true }, token, x.fetchFn, x.online());
  if (!r.ok) return fail(r.code, r);
  stopBackup();
  await clearBackupMeta();
  await clearAccount();
  await clearFreeOwner();
  await writeMode('standalone');
  return { ok: true };
}

/**
 * Phase 80: remove the free account from the server AFTER the first gym backup is in place. Unlike `deleteFreeBackup` it leaves the
 * backup mode, the backup bookkeeping and the owner stamp alone (they now belong to the gym). A missing account counts as done.
 */
export async function deleteFreeAfterMove(d: FreeDeps): Promise<DeleteResult> {
  const rec = await readAccount();
  if (!rec) return { ok: true };
  const x = D(d);
  if (!x.online()) return fail('OFFLINE');
  const token = await freeTokenGetter(d, rec.shard)();
  if (!token) return fail('SFE201');
  const r = await callFunction(fnConfig(d), 'free-delete', { confirm: true }, token, x.fetchFn, x.online());
  if (!r.ok) return fail(r.code, r);
  await clearAccount();
  return { ok: true };
}

// ---------------------------------------------------------------- boot

/** App start in `free_backup` mode: start the runtime for the stored account. No account or no session: nothing runs (the chip says so). */
export async function initFreeBackup(d: FreeDeps): Promise<boolean> {
  if (!resolveFeature('cloud_backup') || (await readMode()) !== 'free_backup') return false;
  const rec = await readAccount();
  if (!rec) return false;
  await startBackup(freeRuntime(d, rec));
  return true;
}

// ---------------------------------------------------------------- Phase 79: R3 recovery questions

/** Were this account's recovery answers saved (by this phone)? Only a flag; the answers never touch the phone. */
export async function recoverySaved(): Promise<boolean> {
  return (await getMeta(RECOVERY_KEY)) === true;
}

/**
 * R3 "Save answers": validate, then `free-recovery-set` once with the account's token. On success only the flag is kept.
 * The answers are not stored, logged or kept in a variable beyond this call.
 */
export async function setRecoveryAnswers(d: FreeDeps, answers: Partial<Record<'p1' | 'p2', string>>): Promise<FinishResult & { fields?: string[] }> {
  const v = validateAnswers(answers);
  if (!v.ok) return { ...fail('SFE001'), fields: v.fields, error: { key: 'bk.err.fields', fields: v.fields } };
  const rec = await readAccount();
  if (!rec) return fail('SFE201');
  const x = D(d);
  if (!x.online()) return fail('OFFLINE');
  const token = await freeTokenGetter(d, rec.shard)();
  if (!token) return fail('SFE201');
  const r = await callFunction(fnConfig(d), 'free-recovery-set', { answers: v.answers }, token, x.fetchFn, x.online());
  if (!r.ok) return { ...fail(r.code, r), fields: (r.fields ?? []).map((f) => f.field) };
  await putMeta(RECOVERY_KEY, true);
  return { ok: true };
}

// ---------------------------------------------------------------- Phase 79: R7-R9 forgot password

export async function readTicket(): Promise<TicketRec | null> {
  const v = await getMeta(TICKET_KEY);
  return isObj(v) && typeof v.identifier === 'string' && typeof v.code === 'string' && typeof v.createdAt === 'number' ? ({ identifier: v.identifier, code: v.code, readyAfter: typeof v.readyAfter === 'string' ? v.readyAfter : null, createdAt: v.createdAt } as TicketRec) : null;
}
export const forgetTicket = (): Promise<void> => delMeta(TICKET_KEY);
/** The 24-hour lock after `SFE708`, kept so the Send button stays off after a reload. The server is the real gate. */
export async function readForgotLock(): Promise<number | null> {
  const v = await getMeta(LOCK_KEY);
  return typeof v === 'number' ? v : null;
}

export type RequestResult = { ok: true; code: string; readyAfter: string | null } | { ok: false; error: FreeErrorView; code: string; fields?: string[] };
/**
 * R7 "Send request": one open ticket per account, so a stored open ticket is not replaced (the caller sends the person to R8;
 * `OPEN` is returned). The answer is the same shape for a known, unknown and linked account; the phone never learns which.
 */
export async function requestReset(d: FreeDeps, input: ForgotInput, status: ResetStatus | null = null): Promise<RequestResult | { ok: false; code: 'OPEN'; error: FreeErrorView }> {
  const x = D(d);
  const c = validateForgot(input, new Date(x.now()).toISOString().slice(0, 7));
  if (!c.ok) return { ok: false, code: 'SFE001', error: { key: 'bk.err.fields', fields: c.fields }, fields: c.fields };
  const stored = await readTicket();
  if (stored && (!status || status === 'cooling' || status === 'waiting' || status === 'approved') && x.now() - stored.createdAt <= TICKET_LIFE_MS) return { ok: false, code: 'OPEN', error: { key: 'bk.fp.open' } };
  if (!x.online()) return fail('OFFLINE');
  const r = await callFunction<{ ticket_code?: unknown; ready_after?: unknown }>(fnConfig(d), 'free-reset-request', { ...c.body, identifier: normaliseIdentifier(c.body.identifier) ?? c.body.identifier }, undefined, x.fetchFn, x.online());
  if (!r.ok) {
    if (r.code === 'SFE708') await putMeta(LOCK_KEY, lockedUntil(x.now()));
    return fail(r.code, r);
  }
  if (typeof r.data.ticket_code !== 'string') return fail('UNKNOWN');
  const readyAfter = typeof r.data.ready_after === 'string' ? r.data.ready_after : null;
  await putMeta(TICKET_KEY, { identifier: normaliseIdentifier(c.body.identifier) ?? c.body.identifier, code: r.data.ticket_code, readyAfter, createdAt: x.now() });
  return { ok: true, code: r.data.ticket_code, readyAfter };
}

export type StatusResult = { ok: true; status: ResetStatus; readyAfter: string | null; redeemUntil: string | null } | { ok: false; error: FreeErrorView; code: string };
/** R8 "Check again": needs the id and the ticket code (a code typed by hand works on any phone). A closed ticket is forgotten here. */
export async function checkReset(d: FreeDeps, identifier: string, code: string): Promise<StatusResult> {
  const x = D(d);
  const id = normaliseIdentifier(identifier);
  if (!id || code.trim() === '') return fail('SFE101');
  if (!x.online()) return fail('OFFLINE');
  const r = await callFunction<{ status?: unknown; ready_after?: unknown; redeem_until?: unknown }>(fnConfig(d), 'free-reset-status', { identifier: id, ticket_code: code.trim() }, undefined, x.fetchFn, x.online());
  if (!r.ok) return fail(r.code, r);
  if (!isResetStatus(r.data.status)) return fail('UNKNOWN');
  const status = r.data.status;
  const readyAfter = typeof r.data.ready_after === 'string' ? r.data.ready_after : null;
  if (status === 'cooling' || status === 'waiting' || status === 'approved') {
    const t = await readTicket(); // a code typed by hand on another phone is remembered, so Set a new password can find it
    if (!t || t.code !== code.trim()) await putMeta(TICKET_KEY, { identifier: id, code: code.trim(), readyAfter, createdAt: x.now() });
  }
  if (status === 'denied' || status === 'cancelled' || status === 'expired' || status === 'redeemed') {
    const t = await readTicket();
    if (t && t.code === code.trim()) await forgetTicket();
  }
  return { ok: true, status, readyAfter: typeof r.data.ready_after === 'string' ? r.data.ready_after : null, redeemUntil: typeof r.data.redeem_until === 'string' ? r.data.redeem_until : null };
}

/** Is this phone signed in to the account the ticket is for? Only then it can cancel. */
export async function signedInFor(identifier: string): Promise<boolean> {
  return sameAccount(identifier, await readAccount());
}

/** R8 "Cancel request": `free-reset-cancel` with this phone's token. `SFE709` (no open request) forgets the stored ticket too. */
export async function cancelReset(d: FreeDeps, code: string): Promise<DeleteResult> {
  const rec = await readAccount();
  if (!rec) return fail('SFE201');
  const x = D(d);
  if (!x.online()) return fail('OFFLINE');
  const token = await freeTokenGetter(d, rec.shard)();
  if (!token) return fail('SFE201');
  const r = await callFunction(fnConfig(d), 'free-reset-cancel', { ticket_code: code.trim() }, token, x.fetchFn, x.online());
  if (!r.ok) {
    if (r.code === 'SFE709') await forgetTicket();
    return fail(r.code, r);
  }
  await forgetTicket();
  return { ok: true };
}

export type RedeemResult = { ok: true } | { ok: false; error: FreeErrorView; code: string };
/**
 * R9 "Set this password": the phone made `password` (the page shows it first and waits for "I saved it"). One call, single use.
 * Success forgets the ticket and any old session on this phone (the server signed other sessions out); the person signs in again.
 */
export async function redeemReset(d: FreeDeps, identifier: string, code: string, password: string): Promise<RedeemResult> {
  const x = D(d);
  const id = normaliseIdentifier(identifier);
  if (!id) return fail('SFE101');
  if (!x.online()) return fail('OFFLINE');
  const r = await callFunction(fnConfig(d), 'free-reset-redeem', { identifier: id, ticket_code: code.trim(), new_password: password }, undefined, x.fetchFn, x.online());
  if (!r.ok) return fail(r.code, r);
  await forgetTicket();
  const rec = await readAccount();
  if (rec && sameAccount(id, rec)) await delMeta(SESSION_KEY); // the old password is dead; the next sign-in uses the new one
  return { ok: true };
}

/** A new 16-character password for R9 (same rule as signup). */
export const newResetPassword = (d: FreeDeps): string => makePassword(D(d).randInt);

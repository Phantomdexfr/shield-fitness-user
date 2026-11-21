// The gym link (Phase 67): connect, sign in, change password, disconnect, and the triggers that run the sync engine.
// Screens call these functions; they never touch Supabase or the outbox directly. Every function returns a sentence KEY,
// never raw server text (the screens show `t(key)`), except an unknown SFE code, where the server's own plain message is shown.

import { listOutbox, removeOutbox, setOutboxEnabled } from '../local';
import { APP_CONTRACT_MAJOR, type GymConfig } from '../../shared/gymConfig';
import { parsePolicy } from '../../shared/policy';
import { FUNCTION_CODE_KEYS, classifyError, FOREGROUND_DEBOUNCE_MS, type RemoteError } from '../../shared/sync';
import type { StringKey } from '../../i18n';
import { acceptPolicy, clearPolicy } from '../repos/gymPolicy';
import { clearPendingGym } from '../repos/gymPending';
import { changePasswordCall, lookupLogin, syncSummaryCall } from './functions';
import {
  dropConnection,
  dropCursors,
  getConnection,
  patchConnection,
  readSyncLog,
  readUnsynced,
  saveConnection,
  writeSyncLog,
  writeUnsynced,
  type Connection,
} from './connection';
import { refreshCounts, runSync, type PullTarget } from './syncEngine';
import { refreshGymData, clearGymData } from './gymData';
import { clearPrograms, pullPrograms } from './programs';
import { checkRestore, liveRowCount, recordBase, runRestore, serverHasData, setLastVerdict, stampOwnerIfNone } from './restore';
import { blocksPush } from '../../shared/emptyCheck';
import { clearProposals, flushProposals } from './proposals';
import { runUpload } from './historyUpload';
import { dropMoveAsk, moveHooks } from './freeToGym';
import { readMode, writeMode } from './backupMeta';
import { setChipInput } from './syncState';
import type { Remote } from './types';

// ---------- the remote (lazy) ----------

export type RemoteFactory = (config: GymConfig, trainShard: string | undefined, onTrainShard: (id: string) => void) => Promise<Remote>;
let factory: RemoteFactory = async (config, trainShard, onTrainShard) => (await import('./supabaseRemote')).createSupabaseRemote({ config, trainShard, onTrainShard });
/** Tests install a fake remote here. */
export function setRemoteFactory(f: RemoteFactory): void {
  factory = f;
  remote = null;
}
let remote: Remote | null = null;
async function getRemote(c: Connection): Promise<Remote> {
  return (remote ??= await factory(c.config, c.trainShard, (id) => void patchConnection({ trainShard: id })));
}

let clock: () => number = () => Date.now();
let rand: () => number = Math.random;
let onlineFn: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
export function setLinkEnv(e: { now?: () => number; rand?: () => number; online?: () => boolean }): void {
  if (e.now) clock = e.now;
  if (e.rand) rand = e.rand;
  if (e.online) onlineFn = e.online;
}

type Fail = { ok: false; key: StringKey; message?: string; retryAfter?: number };

function netKey(e: RemoteError): StringKey {
  if (e.offline) return 'gy.err.offline';
  const s = e.status ?? 0;
  return s >= 500 || s === 0 ? 'gy.err.asleep' : 'gy.err.login';
}

// ---------- connect (S7) ----------

export type ConnectStep = 'reach' | 'settings' | 'version';
export type ConnectResult = { ok: true } | Fail;

/** S7: reach the gym, read its settings, check the version, then (and only then) store the connection. Nothing is stored on failure. */
export async function connectToGym(config: GymConfig, host: string, onStep?: (s: ConnectStep) => void): Promise<ConnectResult> {
  if (!onlineFn()) return { ok: false, key: 'gy.err.offline' };
  const tmp: Connection = { config, host, connectedAt: clock(), signedIn: false, mustChangePassword: false, versionMismatch: false };
  const r = await factory(config, undefined, () => undefined);
  onStep?.('reach');
  const s = await r.publicSettings();
  if (s.error) return { ok: false, key: s.error.offline ? 'gy.err.offline' : 'gy.err.asleep' };
  onStep?.('settings');
  if (!s.contract_version || !parsePolicy(s.policy).ok) return { ok: false, key: 'gy.err.setup' };
  onStep?.('version');
  if (majorOf(s.contract_version) !== APP_CONTRACT_MAJOR) return { ok: false, key: 'gy.err.version' };
  // Policy and contract version are the first things stored; a bad policy never gets here.
  if ((await acceptPolicy(s.policy)) === 'invalid') return { ok: false, key: 'gy.err.setup' };
  await saveConnection(tmp);
  remote = r;
  setOutboxEnabled(true);
  clearPendingGym();
  setChipInput({ connected: true, versionMismatch: false, authPaused: false, lastSyncedAt: null });
  await refreshCounts();
  return { ok: true };
}

const majorOf = (v: string): number => Number.parseInt(v.split('.')[0] ?? '', 10);

// ---------- sign in (S8) ----------

export type SignInResult = { ok: true; mustChange: boolean } | Fail;

export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  const c = await getConnection();
  if (!c) return { ok: false, key: 'gy.err.login' };
  if (!onlineFn()) return { ok: false, key: 'gy.err.offline' };
  const l = await lookupLogin(c.config, identifier);
  if (!l.ok) return fnFail(l);
  const r = await getRemote(c);
  const a = await r.signIn(l.data.email, password);
  if (!a.ok) return { ok: false, key: netKey(a.error) };
  const p = await r.profile();
  if (p.error || !p.profile) return { ok: false, key: p.error?.offline ? 'gy.err.offline' : 'gy.err.asleep' };
  const must = p.profile.must_change_password;
  await patchConnection({ signedIn: true, mustChangePassword: must, trainShard: p.profile.train_shard ?? c.trainShard, memberCode: p.profile.member_code ?? c.memberCode });
  await writeSyncLog({ ...(await readSyncLog()), authPaused: false });
  setChipInput({ authPaused: false });
  if (!must) void syncNow('signin');
  return { ok: true, mustChange: must };
}

function fnFail(l: { code: string; message?: string; retry_after?: number }): Fail {
  const key = FUNCTION_CODE_KEYS[l.code];
  if (key) return { ok: false, key: key as StringKey, retryAfter: l.retry_after };
  // Unknown code: the server's own plain message, else the fixed fallback.
  return { ok: false, key: 'gy.err.unknown', message: l.message };
}

// ---------- forced change (S9) ----------

export async function changePassword(current: string, next: string): Promise<{ ok: true } | Fail> {
  const c = await getConnection();
  if (!c) return { ok: false, key: 'gy.err.login' };
  if (!onlineFn()) return { ok: false, key: 'gy.err.offline' };
  const r = await getRemote(c);
  const token = await r.accessToken();
  if (!token) return { ok: false, key: 'gy.err.signinagain' };
  const res = await changePasswordCall(c.config, token, current, next);
  if (!res.ok) return fnFail(res);
  await patchConnection({ mustChangePassword: false });
  void syncNow('password');
  return { ok: true };
}

// ---------- disconnect (S12) ----------

/** How many changes have not reached the gym (for the Disconnect screen). */
export async function unsyncedCount(): Promise<number> {
  return (await listOutbox()).length;
}

/** Forget the gym; keep every personal row. Waiting rows are remembered by id for the later history upload (Phase 69), then the outbox is emptied. */
export async function disconnect(): Promise<void> {
  await clearPrograms().catch(() => undefined); // followed programs become editable copies first, so the copies join the waiting list below
  const rows = await listOutbox();
  if (rows.length) {
    const known = await readUnsynced();
    const seen = new Set(known.map((u) => `${u.table}:${u.client_id}`));
    const add: { table: string; client_id: string }[] = [];
    for (const r of rows) {
      const k = `${r.table}:${r.client_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      add.push({ table: r.table as string, client_id: r.client_id });
    }
    await writeUnsynced([...known, ...add]);
    for (const r of rows) await removeOutbox(r.id!);
  }
  try {
    if (remote) await remote.signOut();
    else {
      const c = await getConnection();
      if (c) await (await getRemote(c)).signOut();
    }
  } catch {
    /* sign-out is best effort: the stored session is dropped with the connection record either way */
  }
  remote = null;
  // Phase 80: leaving the gym ends the gym backup (the gym's copy is not touched); an unfinished move asks again for the next gym.
  if ((await readMode().catch(() => 'standalone')) === 'connected') {
    await import('./backupBoot').then((m) => m.stopBackup()).catch(() => undefined);
    await writeMode('standalone').catch(() => undefined);
  }
  await dropMoveAsk().catch(() => undefined);
  setOutboxEnabled(false);
  await clearPolicy();
  await clearGymData();
  await clearProposals().catch(() => undefined);
  await dropCursors(['gym_settings']);
  await writeSyncLog({ lastSyncedAt: null, authPaused: false });
  await dropConnection();
  clearPendingGym();
  setChipInput({ connected: false, running: false, waiting: 0, failed: 0, authPaused: false, versionMismatch: false, lastSyncedAt: null });
}

// ---------- sync triggers ----------

function policyTarget(): PullTarget {
  return {
    table: 'gym_settings',
    columns: 'key,value,updated_at',
    async apply(rows) {
      for (const row of rows) {
        if (row.key === 'policy') await acceptPolicy(row.value);
        if (row.key === 'contract_version') {
          const v = typeof row.value === 'string' ? row.value : String((row.value as { value?: unknown })?.value ?? '');
          await setVersionMismatch(majorOf(v) !== APP_CONTRACT_MAJOR);
        }
      }
    },
  };
}

async function setVersionMismatch(bad: boolean): Promise<void> {
  const c = await getConnection();
  if (!c || c.versionMismatch === bad) return;
  await patchConnection({ versionMismatch: bad });
  setOutboxEnabled(!bad);
  setChipInput({ versionMismatch: bad });
  if (bad) await clearPolicy(); // behave as standalone: no policy, nothing synced
}

let lastRunAt = 0;
/** One sync run. `foreground` is debounced to 30 s; every other trigger runs at once. */
export async function syncNow(reason: 'open' | 'foreground' | 'signin' | 'password' | 'manual' | 'push'): Promise<'ran' | 'skipped' | 'busy'> {
  const c = await getConnection();
  if (!c) return 'skipped';
  const now = clock();
  if (reason === 'foreground' && now - lastRunAt < FOREGROUND_DEBOUNCE_MS) return 'skipped';
  const r = await getRemote(c);
  const hasSession = c.signedIn && !c.mustChangePassword && (await r.hasSession());
  lastRunAt = now;
  // Phase 80: a phone that backs up to a free account (or has a move half done) gets the free-to-gym tail; a plain member gets null here.
  const move = hasSession && !c.versionMismatch ? await moveHooks(r, c, { now: clock, rand, online: onlineFn }).catch(() => null) : null;
  await move?.before().catch(() => undefined);
  // Restore safety net (Phase 73): an empty or shrunken phone, or another member's phone, never pushes over the server copy.
  const probe = hasSession && onlineFn() && (await liveRowCount().catch(() => 1)) === 0 ? await serverHasData(r).catch(() => null) : null;
  const verdict = hasSession ? await checkRestore(probe).catch(() => 'ok' as const) : 'ok';
  setLastVerdict(verdict);
  const out = await runSync({ remote: r, now: clock, rand, online: onlineFn }, c.versionMismatch ? [policyTarget()] : [policyTarget()], { signedIn: hasSession && !c.versionMismatch && !blocksPush(verdict) });
  if (out === 'busy') return 'busy';
  if (hasSession && verdict === 'ok') {
    await stampOwnerIfNone().catch(() => undefined);
    await recordBase().catch(() => undefined);
  }
  if (hasSession && !c.versionMismatch) {
    await refreshGymData(r, onlineFn).catch(() => undefined);
    if (onlineFn()) {
      await pullPrograms(r, clock()).catch(() => undefined);
      await flushProposals(r, onlineFn, clock()).catch(() => undefined);
    }
  }
  // Phase 77: an EMPTY phone of a signed-in member (verdict `restore_offer`) restores from the chunk backup by itself when the policy
  // allows it (`auto_restore`), then the normal delta pull catches up. One manifest list request, only in that state.
  // Phase 80: free first: while the free account is still this phone's target, an empty phone restores from it, not from the gym.
  if (hasSession && !c.versionMismatch && verdict === 'restore_offer' && onlineFn() && !move?.freeFirst) void runAutoRestore(r, c);
  if (move && verdict === 'ok' && onlineFn()) void move.after().catch(() => undefined);
  // Phase 76-b2: the backup runtime (lazy; standalone never loads it). A pass after a successful row sync (B4).
  if (hasSession && !c.versionMismatch && verdict === 'ok') {
    void import('./backupBoot').then(async (m) => {
      await m.initGymBackup(r, c.config.functions, c.config.core.anon);
      await m.kickBackup();
    }).catch(() => undefined);
  }
  return 'ran';
}

let wired = false;
/** Boot (installed app, after the policy cache is read). Standalone: reads one stored row and does nothing else. */
export async function initGymLink(): Promise<void> {
  const c = await getConnection();
  if (!c) return;
  const log = await readSyncLog();
  setOutboxEnabled(!c.versionMismatch);
  setChipInput({ connected: true, versionMismatch: c.versionMismatch, authPaused: log.authPaused, lastSyncedAt: log.lastSyncedAt });
  await refreshCounts();
  if (!wired && typeof document !== 'undefined') {
    wired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNow('foreground').catch(() => undefined);
    });
    window.addEventListener('online', () => void syncNow('manual').catch(() => undefined));
    window.addEventListener('offline', () => setChipInput({ online: false }));
  }
  void syncNow('open').catch(() => undefined);
}

/** Retry failed items (the Pending screen's button): put them back in the queue with a clean slate. */
export async function retryFailed(): Promise<void> {
  const { getDb } = await import('../local');
  const db = await getDb();
  for (const r of await listOutbox('failed')) {
    await db.put('outbox', { ...r, status: 'pending', attempts: 0, nextTryAt: 0, reason: undefined });
  }
  await refreshCounts();
  await syncNow('manual');
}

/** Run `fn` with the live remote when signed in and online; else `fallback` (used by the gym screens, Phase 68). */
export async function withRemote<T>(fn: (r: Remote) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  const c = await getConnection();
  if (!c || !c.signedIn || !onlineFn()) return fallback();
  return fn(await getRemote(c));
}

export const __resetLink = (): void => {
  remote = null;
  lastRunAt = 0;
};
export { classifyError };

/** S10: queue and send the history, one batch at a time (resumable). `stopped` lets the Cancel button end it. */
export async function runHistoryUpload(stopped?: () => boolean): Promise<'finished' | 'cancelled' | 'offline' | 'idle'> {
  return runUpload({
    push: () => syncNow('push'),
    summary: async () => {
      const c = await getConnection();
      if (!c) return;
      const tok = await (await getRemote(c)).accessToken();
      if (tok) await syncSummaryCall(c.config, tok).catch(() => undefined);
    },
    online: onlineFn,
    now: clock,
    ...(stopped ? { stopped } : {}),
  });
}

// ---------- restore (Phase 73) ----------

/** Ask the server whether it holds data (when signed in and online) and give the verdict for the Restore screen. */
export async function restoreStatus(): Promise<{ verdict: import('../../shared/emptyCheck').EmptyVerdict; signedIn: boolean; online: boolean }> {
  const c = await getConnection();
  if (!c || !c.signedIn || c.mustChangePassword) return { verdict: 'ok', signedIn: false, online: onlineFn() };
  const r = await getRemote(c);
  const signed = await r.hasSession();
  const probe = signed && onlineFn() ? await serverHasData(r).catch(() => null) : null;
  const verdict = await checkRestore(probe).catch(() => 'ok' as const);
  setLastVerdict(verdict);
  return { verdict, signedIn: signed, online: onlineFn() };
}

/** Run the restore (never while the forced password change is open, never signed out). */
export async function runRestoreNow(onProgress?: (p: import('./restore').RestoreProgress) => void): Promise<import('./restore').RestoreResult | 'not_ready'> {
  const c = await getConnection();
  if (!c || !c.signedIn || c.mustChangePassword) return 'not_ready';
  if (!onlineFn()) return { ok: false, added: 0, replaced: 0, error: 'offline' };
  const r = await getRemote(c);
  if (!(await r.hasSession())) return { ok: false, added: 0, replaced: 0, error: 'auth' };
  return runRestore({ remote: r, now: clock, rand, online: onlineFn }, onProgress);
}

// ---------- new-device restore (Phase 77) ----------

let autoBusy = false;
const restoreCtx = (r: Remote, c: Connection) => ({ remote: r, conn: c, ...(c.config.functions ? { functions: { url: c.config.functions, coreAnon: c.config.core.anon } } : {}) });

async function runAutoRestore(r: Remote, c: Connection): Promise<void> {
  if (autoBusy) return;
  autoBusy = true;
  try {
    const m = await import('./autoRestore');
    const res = await m.autoRestoreIfNeeded(restoreCtx(r, c));
    if (res.outcome?.kind === 'done') await syncNow('manual'); // the delta pull; the phone now holds rows, so the verdict is `ok`
  } catch {
    /* nothing was changed; the next sync or the R6 button tries again */
  } finally {
    autoBusy = false;
  }
}

/** The R6 page: assess the chunk backup of the signed-in member. */
export async function chunkRestoreStatus(): Promise<import('./autoRestore').Assessment | null> {
  const c = await getConnection();
  if (!c) return null;
  const m = await import('./autoRestore');
  return m.assessRestore(restoreCtx(await getRemote(c), c));
}

/** The R6 button, or a retry after a pause. Never while signed out or in the forced password change. */
export async function runChunkRestoreNow(a: import('./autoRestore').Assessment): Promise<import('./restore').RestoreResult['error'] | 'ok' | 'not_ready' | 'failed'> {
  const m = await import('./autoRestore');
  const out = await m.runChunkRestore(a);
  if (out === 'not_ready') return 'not_ready';
  if (out.kind === 'done') {
    void syncNow('manual');
    return 'ok';
  }
  if (out.kind === 'paused') return out.reason === 'auth' ? 'auth' : 'offline';
  return 'failed';
}

// Phase 80: the ordered switch from a free backup to the gym backup. Connect, sign in and the password change are the Phase 67
// screens; this file does the tail: (1) the first gym backup is written while the mode is STILL `free_backup`, (2) only then the mode
// becomes `connected`, (3) the free account is deleted. Any failure before (2) puts back the free bookkeeping, the owner stamp and
// the free runtime, so the old mode keeps working. A phone that dies in the middle is repaired at the next sync. Light imports only:
// the free-account client and the backup runtime load lazily when a move actually runs. Unproven against a real gym and free shard.
import { getDb } from '../local';
import { readMode, writeMode } from './backupMeta';
import { liveRowCount, readOwner, writeOwner } from './restore';
import { getConnection, type Connection } from './connection';
import { moveDecision, moveKeys, moveView, ownerPrompt, parseMove, restoreSourceFor, type MoveRec, type MoveView, type OwnerPrompt } from '../../shared/freeTransition';
import type { BackupAccess, Remote } from './types';

const MOVE_KEY = 'free:move';
const OLD_ID_KEY = 'free:old_id';
const ACCOUNT_KEY = 'free:account';

async function getMeta(key: string): Promise<unknown> {
  return (await (await getDb()).get('meta', key))?.value;
}
async function putMeta(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('meta', { key, value });
}
async function delMeta(key: string): Promise<void> {
  await (await getDb()).delete('meta', key);
}

export const readMove = async (): Promise<MoveRec | null> => parseMove(await getMeta(MOVE_KEY));
const saveMove = (r: MoveRec): Promise<void> => putMeta(MOVE_KEY, r);
const clearMove = (): Promise<void> => delMeta(MOVE_KEY);
/** The free id kept after the move, shown in Settings beside the member code. */
export async function readOldFreeId(): Promise<string | null> {
  const v = await getMeta(OLD_ID_KEY);
  return typeof v === 'string' ? v : null;
}
const hasFreeAccount = async (): Promise<boolean> => (await getMeta(ACCOUNT_KEY)) != null;
const memberOwnerOf = (c: Connection | null): string | null => (c?.memberCode ? `member:${c.memberCode.toUpperCase()}` : null);

// ---------------------------------------------------------------- backup bookkeeping snapshot

async function backupKeys(): Promise<string[]> {
  return moveKeys((await (await getDb()).getAllKeys('meta')).filter((k): k is string => typeof k === 'string'));
}
async function snapshotBackup(): Promise<{ key: string; value: unknown }[]> {
  const db = await getDb();
  const out: { key: string; value: unknown }[] = [];
  for (const key of await backupKeys()) out.push({ key, value: (await db.get('meta', key))?.value });
  return out;
}
async function clearBackupKeepMode(): Promise<void> {
  const db = await getDb();
  for (const k of await backupKeys()) await db.delete('meta', k);
}
async function putBackSnapshot(snap: { key: string; value: unknown }[]): Promise<void> {
  const db = await getDb();
  await clearBackupKeepMode();
  for (const e of snap) await db.put('meta', { key: e.key, value: e.value });
}
async function putOwner(stamp: string | null | undefined): Promise<void> {
  if (typeof stamp === 'string') await writeOwner(stamp);
  else if (stamp === null) await delMeta('owner');
}

// ---------------------------------------------------------------- ports (so the order can be tested on fakes)

export type GymPassResult = { ok: true; start: () => Promise<void> } | { ok: false; code: string };
export interface MovePorts {
  memberOwner(): Promise<string | null>;
  freeId(): Promise<string | null>;
  /** Does the free account's server copy hold data? null = could not be asked. */
  freeHasData(): Promise<boolean | null>;
  stopFree(): void;
  startFree(): Promise<void>;
  /** Mark every chunk dirty and write the first gym backup. `start` then runs the gym runtime. */
  gymPass(): Promise<GymPassResult>;
  deleteFree(): Promise<{ ok: true } | { ok: false; code: string }>;
}
export interface MoveEnv {
  now?: () => number;
  rand?: () => number;
  online?: () => boolean;
}

/** The real ports: the free account client, the gym's backup access, the backup runtime. */
export function linkPorts(r: Remote, c: Connection, env: MoveEnv = {}): MovePorts {
  const freeDeps = async () => {
    const { freeConfig } = await import('../../app/freeBuild');
    return { config: freeConfig(), ...(env.now ? { now: env.now } : {}), ...(env.rand ? { rand: env.rand } : {}), ...(env.online ? { online: env.online } : {}) };
  };
  return {
    memberOwner: async () => memberOwnerOf(c),
    freeId: async () => (await (await import('./freeAccount')).readAccount())?.free_id ?? null,
    async freeHasData() {
      const m = await import('./freeAccount');
      const rec = await m.readAccount();
      if (!rec) return false;
      const l = await m.freeRuntime(await freeDeps(), rec).remote.listManifests();
      return l.error ? null : l.rows.length > 0;
    },
    stopFree: () => void import('./backupBoot').then((m) => m.stopBackup()),
    async startFree() {
      const m = await import('./freeAccount');
      await m.initFreeBackup(await freeDeps());
    },
    async gymPass() {
      const a: BackupAccess | null | undefined = await r.backupAccess?.();
      if (!a) return { ok: false, code: 'SFE201' };
      const boot = await import('./backupBoot');
      const { runBackupPass } = await import('./backupRun');
      const { buildAllChunks } = await import('../local/chunks');
      const { markDirty } = await import('./backupMeta');
      const rt = boot.depsFromAccess(a, c.config.functions ? { url: c.config.functions, coreAnon: c.config.core.anon } : undefined, env.now, env.rand);
      for (const ch of (await buildAllChunks()).chunks) await markDirty(ch.key);
      const pass = await runBackupPass(rt.deps);
      const bad = Object.values(pass.outcomes).find((o) => o.kind !== 'pushed' && o.kind !== 'noop' && o.kind !== 'pulled' && o.kind !== 'both_gone');
      if (pass.stoppedBy === 'auth') return { ok: false, code: 'SFE201' };
      if (pass.stoppedBy || bad) return { ok: false, code: bad && 'code' in bad && typeof bad.code === 'string' ? bad.code : 'RETRY' };
      return { ok: true, start: () => boot.startBackup(rt) };
    },
    async deleteFree() {
      const m = await import('./freeAccount');
      const res = await m.deleteFreeAfterMove(await freeDeps());
      return res.ok ? { ok: true } : { ok: false, code: res.code };
    },
  };
}

// ---------------------------------------------------------------- the move

export type MoveOutcome =
  | { kind: 'moved'; freeDeleted: boolean }
  | { kind: 'failed'; code: string }
  | { kind: 'restore_first' }
  | { kind: 'waiting' }
  | { kind: 'none' };

let running = false;

async function undoMove(p: MovePorts, rec: MoveRec, code: string): Promise<void> {
  if (rec.snapshot) await putBackSnapshot(rec.snapshot);
  await putOwner(rec.oldStamp);
  const { phase: _p, snapshot: _s, oldStamp: _o, ...rest } = rec;
  void _p; void _s; void _o;
  await saveMove({ ...rest, failCode: code });
  await p.startFree().catch(() => undefined);
}

async function deleteStep(p: MovePorts, rec: MoveRec): Promise<MoveOutcome> {
  const del = await p.deleteFree();
  if (!del.ok) return { kind: 'moved', freeDeleted: false }; // two copies for now; the next sync tries again
  if (rec.freeId) await putMeta(OLD_ID_KEY, rec.freeId);
  await clearMove();
  return { kind: 'moved', freeDeleted: true };
}

/**
 * One look at the move, run by the sync (never concurrently with itself). `ctx` says what the sync knows.
 * start -> snapshot -> write the first gym backup -> flip the mode -> delete the free account.
 */
export async function stepMove(p: MovePorts, ctx: { hasSession: boolean; mustChange: boolean; online: boolean }): Promise<MoveOutcome> {
  if (running) return { kind: 'waiting' };
  running = true;
  try {
    const rec = await readMove();
    const [mode, rows, stamp, memberOwner] = [await readMode(), await liveRowCount(), await readOwner(), await p.memberOwner()];
    const prompt = ownerPrompt({ stamp, memberOwner, rows, ...(rec?.mine !== undefined ? { answer: rec.mine } : {}) });
    const mayAsk = mode === 'free_backup' && rec?.agreed === true && prompt === 'mine' && ctx.hasSession && !ctx.mustChange && ctx.online;
    const freeHasData = mayAsk && rec?.phase === undefined ? await p.freeHasData().catch(() => null) : null;
    const d = moveDecision({ mode, rec, ...ctx, prompt, rows, freeHasData, running: false });
    if (d === 'none') return { kind: 'none' };
    if (d === 'wait') return { kind: 'waiting' };
    if (d === 'restore_first') {
      await saveMove({ ...(rec ?? {}), failCode: 'RESTORE_FIRST' });
      return { kind: 'restore_first' };
    }
    if (d === 'rollback') {
      await undoMove(p, rec ?? {}, 'CRASH');
      return { kind: 'failed', code: 'CRASH' };
    }
    if (d === 'delete_free') return await deleteStep(p, rec ?? {});
    // start
    const [freeId, member] = [await p.freeId(), memberOwner];
    if (!freeId || !member) return { kind: 'waiting' };
    const begun: MoveRec = { ...(rec ?? {}), phase: 'writing', freeId, oldStamp: stamp, snapshot: await snapshotBackup() };
    delete begun.failCode;
    await saveMove(begun);
    p.stopFree();
    await clearBackupKeepMode();
    await writeOwner(member);
    let g: GymPassResult;
    try {
      g = await p.gymPass();
    } catch {
      g = { ok: false, code: 'RETRY' };
    }
    if (!g.ok) {
      await undoMove(p, begun, g.code);
      return { kind: 'failed', code: g.code };
    }
    await writeMode('connected'); // the one flip: from here the gym is the backup target
    const flipped: MoveRec = { ...begun, phase: 'flipped' };
    delete flipped.snapshot;
    delete flipped.oldStamp;
    await saveMove(flipped);
    await g.start().catch(() => undefined);
    return await deleteStep(p, flipped);
  } finally {
    running = false;
  }
}

/** Test seam: forget the in-process "a move is running" flag. */
export const __resetMove = (): void => {
  running = false;
};

// ---------------------------------------------------------------- the sync hooks (link.ts)

export interface MoveHooks {
  /** Before the verdict: a person who said "it is mine" and agreed gets the member stamp, so the gym sync is not blocked as another owner. */
  before(): Promise<void>;
  /** After a clean row sync. */
  after(): Promise<MoveOutcome>;
  /** The phone still has a free account: an empty phone restores from it first. */
  freeFirst: boolean;
}

/** One meta read for a plain gym member (no free backup, no move): returns null and nothing else loads. */
export async function moveHooks(r: Remote, c: Connection, env: MoveEnv & { online: () => boolean }, ports?: MovePorts): Promise<MoveHooks | null> {
  const [mode, rec] = [await readMode(), await readMove()];
  if (mode !== 'free_backup' && !rec) return null;
  const p = ports ?? linkPorts(r, c, env);
  const ctx = { hasSession: true, mustChange: false, online: env.online() };
  return {
    freeFirst: restoreSourceFor({ mode, hasFreeAccount: await hasFreeAccount() }) === 'free',
    async before() {
      const cur = await readMove();
      if (mode !== 'free_backup' || !cur?.agreed || cur.phase) return;
      const [stamp, member, rows] = [await readOwner(), memberOwnerOf(c), await liveRowCount()];
      if (!member || rows === 0 || ownerPrompt({ stamp, memberOwner: member, rows, ...(cur.mine !== undefined ? { answer: cur.mine } : {}) }) !== 'mine') return;
      if (stamp !== member) {
        await saveMove({ ...cur, oldStamp: cur.oldStamp ?? stamp });
        await writeOwner(member);
      }
    },
    after: () => stepMove(p, ctx),
  };
}

// ---------------------------------------------------------------- the R12 block (screens)

export interface MoveScreen { view: MoveView; failCode?: string; freeId: string | null }
export async function readMoveScreen(): Promise<MoveScreen> {
  const [c, mode, rec] = [await getConnection(), await readMode(), await readMove()];
  const [stamp, rows] = [await readOwner(), await liveRowCount()];
  const prompt: OwnerPrompt = ownerPrompt({ stamp, memberOwner: memberOwnerOf(c), rows, ...(rec?.mine !== undefined ? { answer: rec.mine } : {}) });
  const view = moveView({ mode, rec, gymSignedIn: !!c?.signedIn, mustChange: !!c?.mustChangePassword, prompt, restoreFirst: rec?.failCode === 'RESTORE_FIRST' });
  return { view, ...(rec?.failCode ? { failCode: rec.failCode } : {}), freeId: rec?.freeId ?? (await getMeta(ACCOUNT_KEY) as { free_id?: string } | null)?.free_id ?? null };
}
/** "Is this your data?" Yes / No. */
export async function answerMine(mine: boolean): Promise<void> {
  await saveMove({ ...((await readMove()) ?? {}), mine });
}
/** "Move my backup to my gym": the consent. The next sync does the work (the caller runs one). */
export async function agreeMove(): Promise<void> {
  const cur = (await readMove()) ?? {};
  const { failCode: _f, ...rest } = cur;
  void _f;
  await saveMove({ ...rest, agreed: true });
}
/** Leaving the gym mid-move drops an unfinished consent (a later gym asks again); a flipped move keeps its record so the free delete can still finish. */
export async function dropMoveAsk(): Promise<void> {
  const rec = await readMove();
  if (rec && !rec.phase) await clearMove();
}

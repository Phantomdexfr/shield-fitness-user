// Sync engine (Phase 67): outbox push (idempotent by client_id) and delta pull, against the `Remote` interface.
// Rules: contract/connected-api.md "Sync rules" and docs/SYNC_SPEC.md. Nothing here knows about Supabase.

import { backoffMs, countPending, listOutbox, markAttempt, markFailed, removeOutbox } from '../local';
import type { OutboxRow } from '../local';
import {
  PULL_LIMIT,
  TABLE_RULES,
  batchOps,
  classifyError,
  failureReason,
  nextCursor,
  pageIsLast,
  retryDelayMs,
  sortForPush,
  toServerOps,
  type Cursor,
  type RemoteError,
  type ServerOp,
} from '../../shared/sync';
import type { Remote } from './types';
import { readCursor, readSyncLog, writeCursor, writeSyncLog } from './connection';
import { setChipInput } from './syncState';

export interface EngineDeps {
  remote: Remote;
  now: () => number;
  rand: () => number;
  online: () => boolean;
}

export interface PushResult {
  /** Outbox rows that reached the server and were removed. */
  sent: number;
  /** Rows kept for a later try (back-off set). */
  retry: number;
  /** Rows moved to `failed` with a reason. */
  failed: number;
  /** A 401 survived one retry: the queue is paused until the member signs in again. */
  authPaused: boolean;
  /** Nothing was tried because the device is offline. */
  offline: boolean;
}

type TaggedOp = ServerOp & { outboxId: number };

async function send(remote: Remote, batch: TaggedOp[]): Promise<RemoteError | undefined> {
  const first = batch[0]!;
  if (first.kind === 'soft-delete') return (await remote.softDelete(first.table, first.clientId, first.body)).error;
  const rule = TABLE_RULES[first.table];
  return (await remote.upsert(first.table, batch.map((o) => o.body), { onConflict: rule.onConflict, ignoreDuplicates: rule.mode === 'ignore' })).error;
}

/** Push every due outbox row. Safe to run twice: every write is an upsert on `client_id` (or the natural key). */
export async function pushOutbox(deps: EngineDeps): Promise<PushResult> {
  const res: PushResult = { sent: 0, retry: 0, failed: 0, authPaused: false, offline: false };
  if (!deps.online()) return { ...res, offline: true };
  const now = deps.now();
  const rows = (await listOutbox('pending')).filter((r) => r.nextTryAt <= now).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  if (rows.length === 0) return res;

  const byId = new Map<number, OutboxRow>();
  const left = new Map<number, number>();
  const ops: TaggedOp[] = [];
  for (const r of rows) {
    byId.set(r.id!, r);
    const list = toServerOps(r.table, r.op, r.payload);
    if (list.length === 0) {
      await removeOutbox(r.id!); // a table with no server side (never expected here); never leave it waiting forever
      continue;
    }
    left.set(r.id!, list.length);
    for (const o of list) ops.push({ ...o, outboxId: r.id! });
  }

  const dead = new Set<number>(); // rows already failed or backed off in this run: their remaining ops are skipped
  const mark = async (id: number, kind: 'retry' | 'failed', e: RemoteError) => {
    if (dead.has(id)) return;
    dead.add(id);
    if (kind === 'retry') {
      const attempts = byId.get(id)!.attempts + 1;
      await markAttempt(id, deps.now(), retryDelayMs(attempts, deps.rand()) - backoffMs(attempts));
      res.retry += 1;
    } else {
      await markFailed(id, failureReason(e));
      res.failed += 1;
    }
  };

  const trySend = async (batch: TaggedOp[]): Promise<RemoteError | undefined> => {
    let err = await send(deps.remote, batch);
    if (err && classifyError(err) === 'auth') err = await send(deps.remote, batch); // refresh once, then give up
    return err;
  };

  const done = async (batch: TaggedOp[]) => {
    for (const o of batch) left.set(o.outboxId, left.get(o.outboxId)! - 1);
  };

  for (const batch of batchOps(sortForPush(ops))) {
    const live = batch.filter((o) => !dead.has(o.outboxId));
    if (live.length === 0) continue;
    const err = await trySend(live);
    if (!err) {
      await done(live);
      continue;
    }
    const cls = classifyError(err);
    if (cls === 'auth') {
      res.authPaused = true;
      break;
    }
    if (cls === 'retry') {
      for (const id of new Set(live.map((o) => o.outboxId))) await mark(id, 'retry', err);
      if (err.offline) break; // no point trying the rest
      continue;
    }
    // A rejected batch: try each op alone so one bad row cannot hold back the good ones.
    if (live.length > 1) {
      for (const o of live) {
        if (dead.has(o.outboxId)) continue;
        const e1 = await trySend([o]);
        if (!e1) await done([o]);
        else {
          const c1 = classifyError(e1);
          if (c1 === 'auth') {
            res.authPaused = true;
            break;
          }
          await mark(o.outboxId, c1 === 'retry' ? 'retry' : 'failed', e1);
        }
      }
      if (res.authPaused) break;
    } else {
      await mark(live[0]!.outboxId, 'failed', err);
    }
  }

  for (const [id, n] of left) {
    if (n === 0 && !dead.has(id)) {
      await removeOutbox(id);
      res.sent += 1;
    }
  }
  return res;
}

// ---------- delta pull ----------

export interface PullTarget {
  table: string;
  columns: string;
  /** Store the rows. The cursor moves only after this resolves (rule 5). */
  apply(rows: Record<string, unknown>[]): Promise<void>;
}

export async function pullTable(deps: EngineDeps, target: PullTarget, limit = PULL_LIMIT): Promise<{ rows: number; error?: RemoteError }> {
  let total = 0;
  let cursor: Cursor | null = await readCursor(target.table);
  for (let guard = 0; guard < 200; guard++) {
    const r = await deps.remote.pull(target.table, target.columns, cursor, limit);
    if (r.error) return { rows: total, error: r.error };
    if (r.rows.length > 0) {
      await target.apply(r.rows);
      cursor = nextCursor(target.table, r.rows, cursor);
      if (cursor) await writeCursor(target.table, cursor);
      total += r.rows.length;
    }
    if (pageIsLast(r.rows, limit)) break;
  }
  return { rows: total };
}

// ---------- one full run ----------

export interface SyncOutcome {
  push: PushResult;
  pulled: number;
  pullError?: RemoteError;
}

/** At most one loop per device (`navigator.locks`; where missing, a module flag). Updates the chip. */
let running = false;
export async function runSync(deps: EngineDeps, targets: PullTarget[], opts: { signedIn: boolean }): Promise<SyncOutcome | 'busy'> {
  if (running) return 'busy';
  running = true;
  setChipInput({ running: true, online: deps.online() });
  try {
    const log = await readSyncLog();
    let push: PushResult = { sent: 0, retry: 0, failed: 0, authPaused: false, offline: !deps.online() };
    if (opts.signedIn && !log.authPaused) push = await pushOutbox(deps);
    let pulled = 0;
    let pullError: RemoteError | undefined;
    // Public settings (the policy) are readable signed out; the personal tables need a session.
    for (const t of targets) {
      if (!deps.online()) break;
      const r = await pullTable(deps, t);
      pulled += r.rows;
      if (r.error) {
        pullError = r.error;
        if (classifyError(r.error) === 'auth') push.authPaused = true;
        break;
      }
    }
    const paused = push.authPaused || log.authPaused;
    const ok = !push.offline && !pullError && !push.authPaused;
    const next = { lastSyncedAt: ok ? deps.now() : log.lastSyncedAt, authPaused: push.authPaused ? true : log.authPaused };
    await writeSyncLog(next);
    await refreshCounts({ authPaused: paused, lastSyncedAt: next.lastSyncedAt, online: deps.online() });
    return { push, pulled, pullError };
  } finally {
    running = false;
    setChipInput({ running: false });
  }
}

export async function refreshCounts(extra: { authPaused?: boolean; lastSyncedAt?: number | null; online?: boolean } = {}): Promise<void> {
  const failed = (await listOutbox('failed')).length;
  setChipInput({ waiting: await countPending(), failed, online: typeof navigator === 'undefined' ? true : navigator.onLine !== false, ...extra });
}

export const __resetEngine = (): void => {
  running = false;
};

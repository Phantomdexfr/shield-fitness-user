// One-time history upload (Phase 69, S10). It QUEUES rows made before connecting into the normal outbox; the engine sends them
// (batches of 50, idempotent by client_id). Resumable: the keys already queued are saved after every batch, and a row already in the
// outbox is never queued twice. Cancel keeps whatever went up. Progress photos, prefs and followed programs never go.

import { enqueueInTx, getDb, isOutboxEnabled, listOutbox, prefsRepo } from '../local';
import type { Row } from '../local';
import { answerUpload, freshUpload, nextBatch, planUpload, rowKey, shouldAsk, uploadProgress, UPLOAD_STORES, type LocalRow, type UploadAnswer, type UploadProgress, type UploadState } from '../../shared/historyUpload';
import { getConnection } from './connection';

const ROW = 'gym:upload';
type Saved = Record<string, UploadState>;

/** One state per gym (the core host), so a different gym is asked again. */
async function gymKey(): Promise<string | null> {
  return (await getConnection())?.host ?? null;
}
async function readAll(): Promise<Saved> {
  try {
    return ((await prefsRepo.get(ROW))?.value as Saved | undefined) ?? {};
  } catch {
    return {};
  }
}
export async function readUploadState(): Promise<UploadState | null> {
  const k = await gymKey();
  if (!k) return null;
  return (await readAll())[k] ?? freshUpload(k);
}
async function save(s: UploadState): Promise<void> {
  const all = await readAll();
  await prefsRepo.put({ client_id: ROW, value: { ...all, [s.gymId]: s } } as never);
  notify();
}

async function localRows(): Promise<{ meta: LocalRow[]; rows: Map<string, Row> }> {
  const db = await getDb();
  const meta: LocalRow[] = [];
  const rows = new Map<string, Row>();
  for (const store of UPLOAD_STORES) {
    for (const r of (await db.getAll(store)) as Row[]) {
      const lr: LocalRow = { store, client_id: r.client_id, updated_at: r.updated_at, deleted_at: r.deleted_at ?? null, followed: store === 'routines' && r.followed === true };
      meta.push(lr);
      rows.set(rowKey(lr), r);
    }
  }
  return { meta, rows };
}

export interface UploadView {
  state: UploadState;
  progress: UploadProgress;
  /** Rows the server refused (failed in the outbox) are listed on the Sync screen; this is only the count. */
  failed: number;
}

export async function uploadView(now: number): Promise<UploadView | null> {
  const s = await readUploadState();
  if (!s) return null;
  const { meta } = await localRows();
  const plan = planUpload(meta, s.queued, now);
  return { state: s, progress: uploadProgress(plan, s.queued), failed: (await listOutbox('failed')).length };
}

/** Should S10 be offered now? Only once signed in and the password has been changed. */
export async function askNow(now: number): Promise<boolean> {
  const [s, c] = await Promise.all([readUploadState(), getConnection()]);
  return !!s && !!c && shouldAsk(s, c.signedIn && !c.mustChangePassword, now);
}

export async function answer(a: UploadAnswer, now: number): Promise<void> {
  const s = await readUploadState();
  if (s) await save(answerUpload(s, a, now));
}
/** Cancel at any time: stops queueing; what already went up stays at the gym. */
export async function cancelUpload(): Promise<void> {
  const s = await readUploadState();
  if (s) await save({ ...s, running: false });
}
/** S1's quiet "Upload my history" row (and Resume) starts it again after Not now / Never / Cancel. */
export async function startUpload(): Promise<void> {
  const s = await readUploadState();
  if (s) await save(answerUpload({ ...s, finishedAt: null }, 'upload', 0));
}

/**
 * One step: queue at most one batch (50 rows) into the outbox. Returns how many were queued and whether more remain.
 * Safe to call again after a kill: rows already queued (saved keys, or already waiting in the outbox) are skipped.
 */
export async function uploadStep(now: number): Promise<{ queued: number; more: boolean }> {
  const s = await readUploadState();
  if (!s || !s.running || !isOutboxEnabled()) return { queued: 0, more: false };
  const { meta, rows } = await localRows();
  const waiting = new Set((await listOutbox()).map((o) => `${o.table}:${o.client_id}`));
  const plan = planUpload(meta, s.queued, now);
  const batch = nextBatch(plan);
  const db = await getDb();
  const added: string[] = [];
  for (const m of batch) {
    const k = rowKey(m);
    const row = rows.get(k);
    if (row && !waiting.has(k)) {
      const tx = db.transaction(['outbox'], 'readwrite');
      await enqueueInTx(tx as never, m.store, 'put', row, now);
      await tx.done;
    }
    added.push(k);
  }
  const left = plan.length - batch.length;
  await save({ ...s, queued: [...s.queued, ...added], running: left > 0, finishedAt: left > 0 ? null : now });
  return { queued: added.length, more: left > 0 };
}

const listeners = new Set<() => void>();
export const onUpload = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function notify(): void {
  listeners.forEach((l) => l());
}

export interface RunHooks {
  /** Send what is queued (the normal sync). */
  push(): Promise<unknown>;
  /** Ask the server for a stats refresh after a finished upload. Sends no numbers. */
  summary(): Promise<unknown>;
  online(): boolean;
  now(): number;
  /** Return true to stop (the member pressed Cancel). */
  stopped?(): boolean;
}

/** Resume-safe loop: queue a batch, send it, repeat until nothing is left, cancelled, offline or the outbox is paused. */
export async function runUpload(h: RunHooks): Promise<'finished' | 'cancelled' | 'offline' | 'idle'> {
  for (let guard = 0; guard < 10_000; guard++) {
    if (h.stopped?.()) {
      await cancelUpload();
      return 'cancelled';
    }
    if (!h.online()) return 'offline';
    const r = await uploadStep(h.now());
    if (r.queued === 0 && !r.more) {
      const s = await readUploadState();
      if (s?.finishedAt) {
        await h.push();
        await h.summary();
        return 'finished';
      }
      return 'idle';
    }
    await h.push();
    if (!r.more) {
      await h.summary();
      return 'finished';
    }
  }
  return 'idle';
}

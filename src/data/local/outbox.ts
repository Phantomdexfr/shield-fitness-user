import { getDb } from './db';
import { NEVER_SYNCED, type EntityStore, type OutboxOp, type OutboxRow, type Row } from './types';

/**
 * The outbox only fills while connected to a gym. Standalone (the default) never writes it.
 * Phase 66/67 call `setOutboxEnabled(true)` when a gym link is active.
 */
let enabled = false;
export function setOutboxEnabled(on: boolean): void {
  enabled = on;
}
export function isOutboxEnabled(): boolean {
  return enabled;
}

/** True when a change to this store should be queued right now. */
export function shouldQueue(table: EntityStore): boolean {
  return enabled && !NEVER_SYNCED.includes(table);
}

/** Any readwrite transaction that includes the `outbox` store. */
interface OutboxTx {
  objectStore(name: 'outbox'): { add(value: OutboxRow): Promise<unknown> };
}

/** Appends an outbox row inside the caller's transaction (same transaction as the data write). */
export async function enqueueInTx(
  tx: OutboxTx,
  table: EntityStore,
  op: OutboxOp,
  row: Row,
  now: number,
): Promise<void> {
  if (!shouldQueue(table)) return;
  const item: OutboxRow = {
    table,
    op,
    client_id: row.client_id,
    payload: row,
    created_at: now,
    attempts: 0,
    nextTryAt: now,
    status: 'pending',
  };
  await tx.objectStore('outbox').add(item);
}

export async function listOutbox(status?: OutboxRow['status']): Promise<OutboxRow[]> {
  const all = await (await getDb()).getAll('outbox');
  return status ? all.filter((r) => r.status === status) : all;
}

export async function countPending(): Promise<number> {
  return (await listOutbox('pending')).length;
}

export async function removeOutbox(id: number): Promise<void> {
  await (await getDb()).delete('outbox', id);
}

/** Retry back-off from SYNC_SPEC: min(2^attempts * 5 s, 15 min). Jitter is added by the caller. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 5_000, 15 * 60_000);
}

export async function markAttempt(id: number, now: number, jitterMs = 0): Promise<void> {
  const db = await getDb();
  const row = await db.get('outbox', id);
  if (!row) return;
  row.attempts += 1;
  row.nextTryAt = now + backoffMs(row.attempts) + jitterMs;
  await db.put('outbox', row);
}

export async function markFailed(id: number, reason: string): Promise<void> {
  const db = await getDb();
  const row = await db.get('outbox', id);
  if (!row) return;
  row.status = 'failed';
  row.reason = reason;
  await db.put('outbox', row);
}

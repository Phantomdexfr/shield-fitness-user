import { getDb } from './db';
import { enqueueInTx } from './outbox';
import type { EntityStore, PhotoRow, Row } from './types';

/** Injectable clock (ms UTC) so tests are deterministic. The domain layer never reads it. */
let clock: () => number = () => Date.now();
export function setClock(fn: () => number): void {
  clock = fn;
}

let idCounter = 0;
/** Stable client id, created at row creation (also in standalone mode, so a later upload cannot duplicate). */
export function newClientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  idCounter += 1;
  return `c-${clock().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface Repo<T extends Row = Row> {
  /** Live rows (deleted rows hidden unless includeDeleted). Optional filter runs on each row. */
  list(opts?: {
    includeDeleted?: boolean;
    where?: (row: T) => boolean;
    since?: number;
  }): Promise<T[]>;
  get(clientId: string): Promise<T | undefined>;
  /** Insert or update. Fills client_id if missing; always sets updated_at. */
  put(row: Omit<T, 'client_id' | 'updated_at'> & Partial<Pick<T, 'client_id'>>): Promise<T>;
  /** Soft delete (tombstone): the row stays with deleted_at so sync and backup can carry it. */
  remove(clientId: string): Promise<void>;
}

/**
 * Phase 76-b1: one optional listener told AFTER a repo write committed (put or soft delete). The backup triggers use it to
 * mark a chunk dirty; the local layer knows nothing about backup. Never throws into the write path.
 */
type ChangeListener = (table: EntityStore, row: Row) => void;
let changeListener: ChangeListener | null = null;
export function setChangeListener(fn: ChangeListener | null): void {
  changeListener = fn;
}
function notifyChange(table: EntityStore, row: Row): void {
  try {
    changeListener?.(table, row);
  } catch {
    /* a listener must never break a write */
  }
}

export function createRepo<T extends Row = Row>(table: EntityStore): Repo<T> {
  return {
    async list(opts = {}) {
      const db = await getDb();
      let rows = (opts.since !== undefined
        ? await db.getAllFromIndex(table, 'updated_at', IDBKeyRange.lowerBound(opts.since, true))
        : await db.getAll(table)) as T[];
      if (!opts.includeDeleted) rows = rows.filter((r) => r.deleted_at == null);
      if (opts.where) rows = rows.filter(opts.where);
      return rows;
    },
    async get(clientId) {
      const row = (await (await getDb()).get(table, clientId)) as T | undefined;
      return row && row.deleted_at == null ? row : undefined;
    },
    async put(input) {
      const db = await getDb();
      const now = clock();
      const row = {
        ...input,
        client_id: input.client_id ?? newClientId(),
        updated_at: now,
        deleted_at: null,
      } as unknown as T;
      const tx = db.transaction([table, 'outbox'], 'readwrite');
      await tx.objectStore(table).put(row);
      await enqueueInTx(tx as never, table, 'put', row, now);
      await tx.done;
      notifyChange(table, row);
      return row;
    },
    async remove(clientId) {
      const db = await getDb();
      const now = clock();
      const tx = db.transaction([table, 'outbox'], 'readwrite');
      const existing = (await tx.objectStore(table).get(clientId)) as T | undefined;
      let removed: T | null = null;
      if (existing) {
        const row = { ...existing, updated_at: now, deleted_at: now } as T;
        await tx.objectStore(table).put(row);
        await enqueueInTx(tx as never, table, 'remove', row, now);
        removed = row;
      }
      await tx.done;
      if (removed) notifyChange(table, removed);
    },
  };
}

export const sessionsRepo = createRepo('sessions');
export const routinesRepo = createRepo('routines');
export const customExercisesRepo = createRepo('customExercises');
export const favouritesRepo = createRepo('favourites');
export const prefsRepo = createRepo('prefs');
export const marksRepo = createRepo('marks');
export const bodyStatsRepo = createRepo('bodyStats');
export const goalsRepo = createRepo('goals');
export const intakeRepo = createRepo('intake');
/** Device-only: never queued to the outbox (see NEVER_SYNCED). */
export const photosRepo = createRepo<PhotoRow>('photos');

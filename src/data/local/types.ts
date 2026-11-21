/** Local store types. Every synced row has client_id, updated_at (ms UTC), deleted_at?. */

export const SCHEMA_VERSION = 1;
export const BACKUP_APP = 'shield-fitness-user';

/** Row stores (keyed by client_id). */
export const ENTITY_STORES = [
  'sessions',
  'routines',
  'customExercises',
  'favourites',
  'prefs',
  'marks',
  'bodyStats',
  'goals',
  'intake',
  'photos',
] as const;
export type EntityStore = (typeof ENTITY_STORES)[number];

/** Stores included in a backup's `tables` (photos are separate and optional). */
export const BACKUP_TABLES = ENTITY_STORES.filter((s) => s !== 'photos') as Exclude<
  EntityStore,
  'photos'
>[];

/** Stores that never create outbox rows (prefs are local only; photos never leave the device). */
export const NEVER_SYNCED: readonly EntityStore[] = ['prefs', 'photos'];

export interface Row {
  client_id: string;
  updated_at: number;
  deleted_at?: number | null;
  [field: string]: unknown;
}

/** Device-only progress photo. `data` is a data URL. */
export interface PhotoRow extends Row {
  mime: string;
  data: string;
}

export interface KvRow {
  key: string;
  value: unknown;
}

export type OutboxOp = 'put' | 'remove';
export interface OutboxRow {
  id?: number;
  table: EntityStore;
  op: OutboxOp;
  client_id: string;
  payload: Row;
  created_at: number;
  attempts: number;
  nextTryAt: number;
  status: 'pending' | 'failed';
  reason?: string;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: number;
  tables: Partial<Record<EntityStore, Row[]>>;
  photos?: PhotoRow[];
}

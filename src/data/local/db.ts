import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import { ENTITY_STORES, SCHEMA_VERSION, type KvRow, type OutboxRow, type Row } from './types';

export const DB_NAME = 'shield-fitness-user';

export interface SfDb extends DBSchema {
  kv: { key: string; value: KvRow };
  meta: { key: string; value: KvRow };
  sessions: { key: string; value: Row; indexes: { updated_at: number } };
  routines: { key: string; value: Row; indexes: { updated_at: number } };
  customExercises: { key: string; value: Row; indexes: { updated_at: number } };
  favourites: { key: string; value: Row; indexes: { updated_at: number } };
  prefs: { key: string; value: Row; indexes: { updated_at: number } };
  marks: { key: string; value: Row; indexes: { updated_at: number } };
  bodyStats: { key: string; value: Row; indexes: { updated_at: number } };
  goals: { key: string; value: Row; indexes: { updated_at: number } };
  intake: { key: string; value: Row; indexes: { updated_at: number } };
  photos: { key: string; value: Row; indexes: { updated_at: number } };
  outbox: { key: number; value: OutboxRow; indexes: { table: string; nextTryAt: number } };
}

/**
 * Migrations: index n-1 upgrades the database to version n. Append only; never edit one
 * that has shipped. Each step must keep existing data.
 */
type Upgrade = (db: IDBPDatabase<SfDb>) => void;
const MIGRATIONS: Upgrade[] = [
  // v1: initial stores
  (db) => {
    db.createObjectStore('kv', { keyPath: 'key' });
    db.createObjectStore('meta', { keyPath: 'key' });
    for (const name of ENTITY_STORES) {
      const s = db.createObjectStore(name, { keyPath: 'client_id' });
      s.createIndex('updated_at', 'updated_at');
    }
    const ob = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    ob.createIndex('table', 'table');
    ob.createIndex('nextTryAt', 'nextTryAt');
  },
];

export const LATEST_VERSION = MIGRATIONS.length;

/** Opens (and migrates) a database. `migrations` is overridable for the migration test. */
export function openSfDb(
  name: string = DB_NAME,
  migrations: Upgrade[] = MIGRATIONS,
): Promise<IDBPDatabase<SfDb>> {
  return openDB<SfDb>(name, migrations.length, {
    upgrade(db, oldVersion) {
      for (let v = oldVersion; v < migrations.length; v++) migrations[v]!(db);
    },
  });
}

let dbPromise: Promise<IDBPDatabase<SfDb>> | null = null;

/** Shared connection. Writes the schema version to `meta` on first open. */
export function getDb(): Promise<IDBPDatabase<SfDb>> {
  if (!dbPromise) {
    dbPromise = openSfDb().then(async (db) => {
      await db.put('meta', { key: 'schemaVersion', value: SCHEMA_VERSION });
      return db;
    });
  }
  return dbPromise;
}

/** Test helper: close the shared connection and optionally delete the database. */
export async function resetDb(remove = false, name: string = DB_NAME): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  if (remove) await deleteDB(name);
}

import { getDb } from './db';
import {
  BACKUP_APP,
  BACKUP_TABLES,
  SCHEMA_VERSION,
  type BackupFile,
  type PhotoRow,
  type Row,
} from './types';
import { enqueueInTx } from './outbox';

/** Export every table (tombstones included). Photos only when asked. Outbox, kv and meta are never exported. */
export async function exportAll(
  opts: { includePhotos?: boolean; now?: number } = {},
): Promise<BackupFile> {
  const db = await getDb();
  const tables: BackupFile['tables'] = {};
  for (const name of BACKUP_TABLES) tables[name] = (await db.getAll(name)) as Row[];
  const file: BackupFile = {
    app: BACKUP_APP,
    schema: SCHEMA_VERSION,
    exportedAt: opts.now ?? Date.now(),
    tables,
  };
  if (opts.includePhotos) file.photos = (await db.getAll('photos')) as PhotoRow[];
  return file;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export class BackupError extends Error {}

function isRow(v: unknown): v is Row {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.client_id === 'string' && r.client_id !== '' && typeof r.updated_at === 'number';
}

/** Checks the file shape. Throws BackupError with a plain reason. Accepts a parsed object or JSON text. */
export function parseBackup(input: unknown): BackupFile {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new BackupError('This file is not valid JSON.');
    }
  }
  const f = data as Partial<BackupFile> | null;
  if (!f || typeof f !== 'object' || f.app !== BACKUP_APP) {
    throw new BackupError('This is not a Shields backup.');
  }
  if (typeof f.schema !== 'number' || f.schema > SCHEMA_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app first.');
  }
  if (typeof f.tables !== 'object' || f.tables === null) {
    throw new BackupError('The backup has no data tables.');
  }
  return f as BackupFile;
}

/**
 * Merge by client_id: a new id is added; an existing id is replaced only when the backup row is
 * newer (updated_at). Rows already on the device that are not in the file are left alone.
 * One transaction: a bad file changes nothing.
 */
export async function importAll(input: unknown): Promise<ImportResult> {
  const file = parseBackup(input);
  const db = await getDb();
  const res: ImportResult = { added: 0, updated: 0, skipped: 0 };
  const work: [(typeof BACKUP_TABLES)[number] | 'photos', Row[]][] = [];
  for (const name of BACKUP_TABLES) {
    const rows = file.tables[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || !rows.every(isRow)) {
      throw new BackupError(`The "${name}" table in the backup is damaged.`);
    }
    work.push([name, rows]);
  }
  if (file.photos !== undefined) {
    if (!Array.isArray(file.photos) || !file.photos.every(isRow)) {
      throw new BackupError('The photos in the backup are damaged.');
    }
    work.push(['photos', file.photos]);
  }
  const tx = db.transaction([...BACKUP_TABLES, 'photos', 'outbox'], 'readwrite');
  const now = Date.now();
  for (const [name, rows] of work) {
    const store = tx.objectStore(name);
    for (const row of rows) {
      const existing = (await store.get(row.client_id)) as Row | undefined;
      if (existing && existing.updated_at >= row.updated_at) {
        res.skipped++;
        continue;
      }
      await store.put(row);
      await enqueueInTx(tx as never, name, row.deleted_at ? 'remove' : 'put', row, now);
      if (existing) res.updated++;
      else res.added++;
    }
  }
  await tx.done;
  return res;
}

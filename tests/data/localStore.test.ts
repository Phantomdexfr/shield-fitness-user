import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import {
  BackupError,
  exportAll,
  importAll,
  listOutbox,
  openSfDb,
  resetDb,
  setClock,
  setOutboxEnabled,
  sessionsRepo,
  routinesRepo,
  photosRepo,
  prefsRepo,
  getDb,
} from '../../src/data/local';

let t = 1000;
beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  setOutboxEnabled(false);
  t = 1000;
  setClock(() => ++t);
});

describe('migrations', () => {
  it('keeps existing data when upgrading to a newer version', async () => {
    const v1 = [
      (db: any) => {
        db.createObjectStore('kv', { keyPath: 'key' });
      },
    ];
    const old = await openDB('mig-test', 1, { upgrade: (db) => v1[0]!(db) });
    await old.put('kv', { key: 'a', value: 42 });
    old.close();
    const v2 = [
      v1[0]!,
      (db: any) => {
        db.createObjectStore('extra', { keyPath: 'id' });
      },
    ];
    const upgraded = await openSfDb('mig-test', v2 as never);
    expect(upgraded.version).toBe(2);
    expect(await upgraded.get('kv' as never, 'a')).toEqual({ key: 'a', value: 42 });
    expect(upgraded.objectStoreNames.contains('extra' as never)).toBe(true);
    upgraded.close();
  });

  it('creates every store on a fresh database', async () => {
    const db = await getDb();
    for (const n of ['kv', 'meta', 'sessions', 'routines', 'customExercises', 'favourites', 'prefs', 'marks', 'bodyStats', 'goals', 'intake', 'photos', 'outbox']) {
      expect(db.objectStoreNames.contains(n as never)).toBe(true);
    }
    expect((await db.get('meta', 'schemaVersion'))?.value).toBe(1);
  });
});

describe('repo queries', () => {
  it('put assigns client_id and updated_at, get/list work, remove tombstones', async () => {
    const a = await sessionsRepo.put({ name: 'Push' });
    const b = await sessionsRepo.put({ name: 'Pull' });
    expect(a.client_id).toBeTruthy();
    expect(a.updated_at).toBeLessThan(b.updated_at);
    expect((await sessionsRepo.get(a.client_id))?.name).toBe('Push');
    expect(await sessionsRepo.list()).toHaveLength(2);
    expect(await sessionsRepo.list({ where: (r) => r.name === 'Pull' })).toHaveLength(1);
    expect(await sessionsRepo.list({ since: a.updated_at })).toHaveLength(1);
    await sessionsRepo.remove(a.client_id);
    expect(await sessionsRepo.get(a.client_id)).toBeUndefined();
    expect(await sessionsRepo.list()).toHaveLength(1);
    expect(await sessionsRepo.list({ includeDeleted: true })).toHaveLength(2);
  });

  it('put with an existing client_id updates in place', async () => {
    const a = await routinesRepo.put({ name: 'v1' });
    await routinesRepo.put({ client_id: a.client_id, name: 'v2' });
    const all = await routinesRepo.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('v2');
  });
});

describe('outbox', () => {
  it('stays empty in standalone mode', async () => {
    await sessionsRepo.put({ name: 'x' });
    expect(await listOutbox()).toHaveLength(0);
  });

  it('queues puts and removes when connected, but never photos or prefs', async () => {
    setOutboxEnabled(true);
    const s = await sessionsRepo.put({ name: 'x' });
    await sessionsRepo.remove(s.client_id);
    await photosRepo.put({ mime: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA' });
    await prefsRepo.put({ theme: 'dark' });
    const ob = await listOutbox();
    expect(ob.map((o) => `${o.table}:${o.op}`)).toEqual(['sessions:put', 'sessions:remove']);
    expect(ob.every((o) => o.status === 'pending')).toBe(true);
  });
});

describe('export / import', () => {
  it('round-trips all tables, tombstones included, and excludes photos by default', async () => {
    const s = await sessionsRepo.put({ name: 'Push' });
    const r = await routinesRepo.put({ name: 'PPL' });
    await routinesRepo.remove(r.client_id);
    await photosRepo.put({ mime: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA' });
    const file = await exportAll({ now: 5 });
    expect(file.app).toBe('shield-fitness-user');
    expect(file.exportedAt).toBe(5);
    expect(file.photos).toBeUndefined();
    expect(Object.keys(file.tables)).not.toContain('photos');
    expect(Object.keys(file.tables)).not.toContain('outbox');

    const json = JSON.stringify(file);
    (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    await resetDb();
    const res = await importAll(json);
    expect(res.added).toBe(2);
    expect((await sessionsRepo.get(s.client_id))?.name).toBe('Push');
    expect(await routinesRepo.get(r.client_id)).toBeUndefined();
    expect(await routinesRepo.list({ includeDeleted: true })).toHaveLength(1);
    expect(await photosRepo.list()).toHaveLength(0);
  });

  it('includes photos only when asked', async () => {
    await photosRepo.put({ mime: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA' });
    const file = await exportAll({ includePhotos: true });
    expect(file.photos).toHaveLength(1);
  });

  it('merges by client_id: newer wins, older is skipped', async () => {
    const a = await sessionsRepo.put({ name: 'device' });
    const file = await exportAll();
    const older = JSON.parse(JSON.stringify(file));
    older.tables.sessions[0].name = 'old backup';
    older.tables.sessions[0].updated_at = a.updated_at - 1;
    expect((await importAll(older)).skipped).toBe(1);
    expect((await sessionsRepo.get(a.client_id))?.name).toBe('device');
    const newer = JSON.parse(JSON.stringify(file));
    newer.tables.sessions[0].name = 'new backup';
    newer.tables.sessions[0].updated_at = a.updated_at + 100;
    expect((await importAll(newer)).updated).toBe(1);
    expect((await sessionsRepo.get(a.client_id))?.name).toBe('new backup');
  });

  it('rejects bad files and changes nothing', async () => {
    await expect(importAll('not json')).rejects.toBeInstanceOf(BackupError);
    await expect(importAll({ app: 'other', schema: 1, tables: {} })).rejects.toBeInstanceOf(BackupError);
    await expect(importAll({ app: 'shield-fitness-user', schema: 99, tables: {} })).rejects.toBeInstanceOf(BackupError);
    await expect(
      importAll({ app: 'shield-fitness-user', schema: 1, tables: { sessions: [{ client_id: 'a', updated_at: 1 }], routines: [{ bad: true }] } }),
    ).rejects.toBeInstanceOf(BackupError);
    expect(await sessionsRepo.list()).toHaveLength(0);
  });
});

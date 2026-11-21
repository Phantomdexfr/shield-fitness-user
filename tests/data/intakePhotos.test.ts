import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { listOutbox, resetDb, setClock, setOutboxEnabled } from '../../src/data/local';
import { addPhoto, listPhotos, removePhoto } from '../../src/data/repos/photos';
import { addIntake, loadIntake, removeIntake } from '../../src/data/repos/intake';

let t = 1000;
beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  setOutboxEnabled(false);
  t = 1000;
  setClock(() => ++t);
});

describe('progress photos stay on the device', () => {
  it('adding and deleting a photo never creates an outbox row, even when connected', async () => {
    setOutboxEnabled(true);
    const id = await addPhoto('image/jpeg', 'data:image/jpeg;base64,AAAA');
    expect(id).not.toBeNull();
    expect(await listPhotos()).toHaveLength(1);
    await removePhoto(id!);
    expect(await listPhotos()).toHaveLength(0);
    expect(await listOutbox()).toHaveLength(0);
  });
  it('refuses anything that is not an image data URL', async () => {
    expect(await addPhoto('text/html', 'data:text/html;base64,AAAA')).toBeNull();
    expect(await addPhoto('image/jpeg', 'data:image/png;base64,AAAA')).toBeNull();
    expect(await listPhotos()).toHaveLength(0);
  });
});

describe('intake log', () => {
  it('adds, totals per IST day and undoes', async () => {
    const before = Date.UTC(2026, 10, 20, 18, 29);
    const after = Date.UTC(2026, 10, 20, 18, 31);
    expect(await addIntake('protein', 25, before)).toBe(true);
    expect(await addIntake('protein', 10, after)).toBe(true);
    expect(await addIntake('water', 250, after)).toBe(true);
    expect(await addIntake('protein', 9999, after)).toBe(false);
    const d = await loadIntake(after);
    expect(d.today).toBe('2026-11-21');
    expect(d.entries.filter((e) => e.day === '2026-11-21').map((e) => e.kind).sort()).toEqual(['protein', 'water']);
    expect(d.entries.filter((e) => e.day === '2026-11-20')).toHaveLength(1);
    await removeIntake(d.entries[d.entries.length - 1]!.id);
    expect((await loadIntake(after)).entries).toHaveLength(2);
  });
});

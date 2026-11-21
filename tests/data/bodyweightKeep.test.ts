import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { bodyStatsRepo, resetDb, setOutboxEnabled } from '../../src/data/local';
import { saveBodyweight } from '../../src/data/repos/badges';

beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  setOutboxEnabled(false);
});

describe('saveBodyweight (Phase 54 fix-up)', () => {
  it('keeps body fat and measurements typed the same day', async () => {
    await bodyStatsRepo.put({ client_id: 'bw:2026-11-20', day: '2026-11-20', kg: 80, fat: 18.5, cm: { waist: 84 } });
    await saveBodyweight(81.2, '2026-11-20');
    const row = (await bodyStatsRepo.get('bw:2026-11-20')) as unknown as { kg: number; fat: number; cm: { waist: number } };
    expect(row.kg).toBe(81.2);
    expect(row.fat).toBe(18.5);
    expect(row.cm).toEqual({ waist: 84 });
  });
  it('still creates a row when none exists', async () => {
    await saveBodyweight(70, '2026-11-19');
    expect(((await bodyStatsRepo.get('bw:2026-11-19')) as unknown as { kg: number }).kg).toBe(70);
  });
});

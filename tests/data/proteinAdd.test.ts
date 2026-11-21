import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { listOutbox, resetDb, setClock, setOutboxEnabled } from '../../src/data/local';
import { addIntake, addProteinEntry, loadIntake, proteinToday, removeIntake } from '../../src/data/repos/intake';
import { parseProduct } from '../../src/shared/barcode';
import { proteinForPortion } from '../../src/shared/intake';

let t = 1000;
beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  setOutboxEnabled(false);
  t = 1000;
  setClock(() => ++t);
});

const NOW = Date.UTC(2026, 10, 20, 6, 0);
const bar = parseProduct(
  { status: 1, product: { code: '5000112637922', product_name: 'Protein bar', serving_size: '40 g', serving_quantity: 40, nutriments: { proteins_100g: 25, 'energy-kcal_100g': 380, fat_100g: 12, sugars_100g: 5, salt_100g: 0.4 } } },
  '5000112637922',
);

describe('Add protein to today (Phase 57)', () => {
  it('serving maths from a parsed product: 1 serving of a 40 g, 25 g/100 g bar = 10 g', () => {
    expect(bar.ok).toBe(true);
    if (!bar.ok) return;
    expect(proteinForPortion(bar.product, { kind: 'servings', n: 1 })).toEqual({ ok: true, grams: 10 });
    expect(proteinForPortion(bar.product, { kind: 'servings', n: 2 })).toEqual({ ok: true, grams: 20 });
    expect(proteinForPortion(bar.product, { kind: 'grams', g: 30 })).toEqual({ ok: true, grams: 7.5 });
  });

  it('the entry is protein-only: kind, amount, day, at and the store keys, nothing about the product', async () => {
    const id = await addProteinEntry(10, NOW);
    expect(id).not.toBeNull();
    const { entries } = await loadIntake(NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id, kind: 'protein', amount: 10, day: '2026-11-20' });
    const { intakeRepo } = await import('../../src/data/local');
    const rows = await intakeRepo.list();
    expect(rows).toHaveLength(1);
    const keys = Object.keys(rows[0] as Record<string, unknown>).sort();
    expect(keys).toEqual(['amount', 'at', 'client_id', 'day', 'deleted_at', 'kind', 'updated_at'].sort());
    const blob = JSON.stringify(rows);
    for (const word of ['Protein bar', '5000112637922', 'kcal', 'fat', 'sugar', 'salt', 'carb']) expect(blob).not.toContain(word);
  });

  it('the protein total (the number the ring shows) rises, and Undo takes it back', async () => {
    await addIntake('protein', 25, NOW);
    expect(await proteinToday(NOW)).toBe(25);
    const id = await addProteinEntry(12.4, NOW + 1000);
    expect(await proteinToday(NOW + 1000)).toBe(37.4);
    await removeIntake(id!);
    expect(await proteinToday(NOW + 1000)).toBe(25);
  });

  it('refuses amounts that are not believable and writes nothing', async () => {
    for (const g of [0, -1, NaN, 300.1]) expect(await addProteinEntry(g, NOW)).toBeNull();
    expect((await loadIntake(NOW)).entries).toHaveLength(0);
  });

  it('water is untouched by a protein add', async () => {
    await addIntake('water', 250, NOW);
    await addProteinEntry(10, NOW);
    const { entries } = await loadIntake(NOW);
    expect(entries.filter((e) => e.kind === 'water')).toHaveLength(1);
    expect(entries.filter((e) => e.kind === 'protein')).toHaveLength(1);
  });

  it('offline-safe: adding protein from a card writes locally and nothing else (no network call)', async () => {
    let calls = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = (() => { calls++; return Promise.reject(new Error('no')); }) as typeof fetch;
    try {
      await addProteinEntry(10, NOW);
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = orig;
    }
    expect(await listOutbox()).toHaveLength(0);
  });
});

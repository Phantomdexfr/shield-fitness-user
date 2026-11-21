import { describe, expect, it, test } from 'vitest';
import { dayTotal, glasses, intakeSeries, lastEntry, parseFactor, parseIntake, proteinForPortion, proteinTarget, share } from '../../src/shared/intake';
import { istDayKey } from '../../src/shared/dates';

const row = (id: string, kind: string, amount: number, at: number, day?: string) => ({ client_id: id, kind, amount, at, ...(day ? { day } : {}) });

describe('protein target', () => {
  test('weight x factor, nearest 5 g', () => {
    expect(proteinTarget(80, 1.6)).toBe(130); // 128
    expect(proteinTarget(82.5, 2)).toBe(165);
    expect(proteinTarget(70, 1.2)).toBe(85); // 84
    expect(proteinTarget(80)).toBe(130); // default 1.6
  });
  test('no believable weight = no target; an odd factor falls back to 1.6', () => {
    expect(proteinTarget(null)).toBeNull();
    expect(proteinTarget(10)).toBeNull();
    expect(proteinTarget(500)).toBeNull();
    expect(proteinTarget(NaN)).toBeNull();
    expect(parseFactor(3)).toBe(1.6);
    expect(parseFactor('2')).toBe(1.6);
    expect(parseFactor(2)).toBe(2);
    expect(proteinTarget(80, 9)).toBe(130);
  });
  test('share and glasses', () => {
    expect(share(65, 130)).toBe(0.5);
    expect(share(10, null)).toBe(0);
    expect(share(300, 130)).toBeGreaterThan(1);
    expect(glasses(500)).toBe(2);
    expect(glasses(250)).toBe(1);
  });
});

describe('IST roll-over', () => {
  // 2026-11-20 23:59 IST = 18:29 UTC; 00:01 IST on the 21st = 18:31 UTC
  const before = Date.UTC(2026, 10, 20, 18, 29);
  const after = Date.UTC(2026, 10, 20, 18, 31);
  test('the IST day changes at IST midnight, not UTC midnight', () => {
    expect(istDayKey(before)).toBe('2026-11-20');
    expect(istDayKey(after)).toBe('2026-11-21');
  });
  test('two entries a minute apart land on different days and totals do not mix', () => {
    const e = parseIntake([row('a', 'protein', 25, before, istDayKey(before)), row('b', 'protein', 10, after, istDayKey(after))]);
    expect(dayTotal(e, '2026-11-20', 'protein')).toBe(25);
    expect(dayTotal(e, '2026-11-21', 'protein')).toBe(10);
  });
  test('a row without a day takes the IST day of its time', () => {
    const e = parseIntake([row('a', 'water', 250, after)]);
    expect(e[0]!.day).toBe('2026-11-21');
  });
  test('today starts at zero after midnight and the older day keeps its total', () => {
    const e = parseIntake([row('a', 'water', 250, before), row('b', 'water', 250, before + 1)]);
    expect(dayTotal(e, '2026-11-20', 'water')).toBe(500);
    expect(dayTotal(e, '2026-11-21', 'water')).toBe(0);
  });
});

describe('log, undo, series', () => {
  const t0 = Date.UTC(2026, 10, 20, 4, 0);
  test('parse drops bad rows and keeps time order', () => {
    const e = parseIntake([row('b', 'protein', 25, t0 + 5), row('a', 'protein', 10, t0), row('x', 'carbs', 5, t0), row('y', 'protein', -5, t0), row('z', 'water', 99999, t0), row('w', 'protein', 5, NaN)]);
    expect(e.map((x) => x.id)).toEqual(['a', 'b']);
  });
  test('lastEntry is the newest of the day, any kind', () => {
    const e = parseIntake([row('a', 'protein', 10, t0), row('b', 'water', 250, t0 + 10), row('c', 'protein', 25, t0 + 5)]);
    expect(lastEntry(e, '2026-11-20')?.id).toBe('b');
    expect(lastEntry(e, '2026-11-19')).toBeUndefined();
  });
  test('7 and 30 day series end today, keep zeros, sum per day', () => {
    const e = parseIntake([row('a', 'protein', 25, t0), row('b', 'protein', 25, t0 + 1), row('c', 'protein', 40, t0 - 86400000), row('d', 'water', 250, t0)]);
    const s7 = intakeSeries(e, 'protein', '2026-11-20', 7);
    expect(s7).toHaveLength(7);
    expect(s7[0]!.day).toBe('2026-11-14');
    expect(s7[6]).toEqual({ day: '2026-11-20', total: 50 });
    expect(s7[5]).toEqual({ day: '2026-11-19', total: 40 });
    expect(s7[2]!.total).toBe(0);
    expect(intakeSeries(e, 'water', '2026-11-20', 30)).toHaveLength(30);
  });
});

describe('Phase 57: protein for a scanned portion', () => {
  const set = (protein: number | null) => ({ kcal: null, protein, carbs: null, fat: null, sugar: null, salt: null });
  // 20 g per 100 g; a 30 g serving gives the source's own 6.2 g (not 6.0), so the serving path must use that number.
  const bar = { per100: set(20), perServing: set(6.2) };
  const noServing = { per100: set(20), perServing: set(null) };
  const unknown = { per100: set(null), perServing: set(null) };

  it('servings use the per-serving protein', () => {
    expect(proteinForPortion(bar, { kind: 'servings', n: 1 })).toEqual({ ok: true, grams: 6.2 });
    expect(proteinForPortion(bar, { kind: 'servings', n: 0.5 })).toEqual({ ok: true, grams: 3.1 });
    expect(proteinForPortion(bar, { kind: 'servings', n: 2 })).toEqual({ ok: true, grams: 12.4 });
  });
  it('grams use per 100 g', () => {
    expect(proteinForPortion(bar, { kind: 'grams', g: 50 })).toEqual({ ok: true, grams: 10 });
    expect(proteinForPortion(noServing, { kind: 'grams', g: 33 })).toEqual({ ok: true, grams: 6.6 });
    expect(proteinForPortion(bar, { kind: 'grams', g: 7 })).toEqual({ ok: true, grams: 1.4 });
  });
  it('rounds once, to 0.1 g', () => {
    expect(proteinForPortion({ per100: set(12.34), perServing: set(null) }, { kind: 'grams', g: 45 })).toEqual({ ok: true, grams: 5.6 });
    expect(proteinForPortion({ per100: set(0), perServing: set(0.34) }, { kind: 'servings', n: 0.5 })).toEqual({ ok: true, grams: 0.2 });
  });
  it('no serving numbers: servings are refused, grams still work', () => {
    expect(proteinForPortion(noServing, { kind: 'servings', n: 1 })).toEqual({ ok: false, error: 'no_serving' });
    expect(proteinForPortion(noServing, { kind: 'grams', g: 100 })).toEqual({ ok: true, grams: 20 });
  });
  it('unknown protein is an error, never 0 g', () => {
    expect(proteinForPortion(unknown, { kind: 'servings', n: 1 })).toEqual({ ok: false, error: 'no_protein' });
    expect(proteinForPortion(unknown, { kind: 'grams', g: 100 })).toEqual({ ok: false, error: 'no_protein' });
  });
  it('a product with 0 g protein cannot be stored', () => {
    expect(proteinForPortion({ per100: set(0), perServing: set(0) }, { kind: 'servings', n: 1 })).toEqual({ ok: false, error: 'no_protein' });
    expect(proteinForPortion({ per100: set(0.01), perServing: set(null) }, { kind: 'grams', g: 10 })).toEqual({ ok: false, error: 'no_protein' });
  });
  it('bad amounts and oversized results are refused', () => {
    for (const g of [0, -5, NaN, Infinity, 5001]) expect(proteinForPortion(bar, { kind: 'grams', g })).toEqual({ ok: false, error: 'bad_amount' });
    expect(proteinForPortion(bar, { kind: 'servings', n: 3 })).toEqual({ ok: false, error: 'bad_amount' });
    expect(proteinForPortion({ per100: set(90), perServing: set(null) }, { kind: 'grams', g: 4000 })).toEqual({ ok: false, error: 'too_much' });
  });
});

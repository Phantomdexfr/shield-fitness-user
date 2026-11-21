import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import { exerciseWeights, type MapRowTuple, type ShiftRow } from '../../src/shared/weights';
import {
  allPeriod, bandOf, compareHeat, customPeriod, entryFromSets, heat01, heatMap, inPeriod, lastDays, percentile90,
  periodFor, periodRef, rawHeat, REF_FLOOR, setUnits, shiftPeriod, weeklyBase, weeklyRaw,
  type HeatEntry, type Period,
} from '../../src/shared/heat';

const fx = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const cases = fx('heatmap_cases');
const cmp = fx('heatmap_compare');
const per = fx('heatmap_periods');
const units = fx('heatmap_units');

const periodOf = (p: { kind: string; anchor?: string; from?: string; to?: string }, entries: HeatEntry[], today: string): Period => {
  if (p.kind === 'custom') return customPeriod(p.from!, p.to!);
  if (p.kind === 'all') return allPeriod(entries.map((e) => e.day), today);
  return periodFor(p.kind as 'day' | 'week' | 'month', p.anchor!);
};

/** Fixture entries carry either `weights` or map `rows` (+ variation + shift table); rows go through exerciseWeights. */
const toEntries = (list: Array<Record<string, unknown>>): HeatEntry[] =>
  list.map((e) => ({
    day: e.day as string,
    sets: e.sets as number,
    weights: e.weights
      ? (e.weights as Record<string, number>)
      : exerciseWeights(e.rows as MapRowTuple[], e.variation as string | undefined, e.shift as Record<string, ShiftRow[]> | undefined),
  }));

describe('percentile90 and the weekly base', () => {
  for (const c of cases.percentile90) it(`p90 of [${c.values.join(',')}] = ${c.p90}`, () => expect(percentile90(c.values)).toBe(c.p90));
  it('the base is floored at 6, and a muscle with big weeks keeps its own p90', () => {
    const e: HeatEntry[] = [{ day: '2026-11-16', sets: 2, weights: { a: 1 } }, { day: '2026-11-23', sets: 9, weights: { b: 1 } }];
    expect(weeklyBase(e)).toEqual({ a: REF_FLOOR, b: 9 });
  });
  it('weekly raw groups by Monday-start IST week and skips weeks the muscle was not trained', () => {
    const e: HeatEntry[] = [
      { day: '2026-11-15', sets: 1, weights: { a: 1 } }, // Sunday: still the week of 9 Nov
      { day: '2026-11-16', sets: 2, weights: { a: 1 } },
      { day: '2026-11-17', sets: 3, weights: { a: 0.5 } },
    ];
    expect(weeklyRaw(e)).toEqual({ a: [1, 3.5] });
  });
});

describe('periods (fixtures)', () => {
  for (const c of per.periodFor) {
    it(`${c.kind} of ${c.anchor}`, () => expect(periodFor(c.kind, c.anchor)).toEqual({ kind: c.kind, from: c.from, to: c.to, days: c.days }));
  }
  for (const c of per.custom) it(`custom ${c.a} .. ${c.b}`, () => expect(customPeriod(c.a, c.b)).toEqual({ kind: 'custom', from: c.from, to: c.to, days: c.days }));
  for (const c of per.lastDays) it(`last ${c.n} days`, () => expect(lastDays(c.n, c.today)).toEqual({ kind: 'custom', from: c.from, to: c.to, days: c.days }));
  for (const c of per.all) it(`all with ${c.entryDays.length} days`, () => expect(allPeriod(c.entryDays, c.today)).toEqual({ kind: 'all', from: c.from, to: c.to, days: c.days }));
  for (const c of per.shift) {
    it(`shift ${c.kind} ${c.anchor} by ${c.n}`, () => {
      const s = shiftPeriod(periodFor(c.kind, c.anchor), c.n);
      expect([s.kind, s.from, s.to]).toEqual([c.kind, c.from, c.to]);
    });
  }
  for (const c of per.shiftCustom) {
    it(`shift custom ${c.from} by ${c.n}`, () => {
      const s = shiftPeriod(customPeriod(c.from, c.to), c.n);
      expect([s.from, s.to, s.days]).toEqual([c.outFrom, c.outTo, 14]);
    });
  }
  it('all does not move; inPeriod is inclusive; a bad day key throws', () => {
    const a = allPeriod(['2026-10-01'], '2026-11-20');
    expect(shiftPeriod(a, 1)).toEqual(a);
    const w = periodFor('week', '2026-11-20');
    expect([inPeriod(w, '2026-11-15'), inPeriod(w, '2026-11-16'), inPeriod(w, '2026-11-22'), inPeriod(w, '2026-11-23')]).toEqual([false, true, true, false]);
    expect(() => periodFor('day', '2026-13-01')).toThrow();
  });
});

describe('set units (fixtures)', () => {
  for (const c of units.cases) it(c.why, () => expect(setUnits(c.sets)).toBe(c.units));
  it('entryFromSets returns null with no units or no weights', () => {
    expect(entryFromSets('2026-11-20', [{ tag: 'warmup', reps: 5 }], { a: 1 })).toBeNull();
    expect(entryFromSets('2026-11-20', [{ tag: 'normal', reps: 5 }], {})).toBeNull();
    expect(entryFromSets('2026-11-20', [{ tag: 'normal', reps: 5 }], { a: 1 })).toEqual({ day: '2026-11-20', sets: 1, weights: { a: 1 } });
  });
});

describe('bands', () => {
  it('edges go to the higher band; 0 only when untrained', () => {
    expect([0, 0.01, 0.1999, 0.2, 0.3999, 0.4, 0.5999, 0.6, 0.7999, 0.8, 1].map(bandOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  it('heat01 clamps, hides float noise (1.2 / 6) and treats a zero reference as full', () => {
    expect(heat01(1.2, 6)).toBe(0.2);
    expect(bandOf(heat01(1.2, 6))).toBe(2);
    expect(heat01(50, 6)).toBe(1);
    expect(heat01(0, 6)).toBe(0);
    expect(heat01(3, 0)).toBe(1);
  });
  it('period reference: day /3, week x1, month x4, custom and all x days/7', () => {
    expect(periodRef({ kind: 'day', days: 1 }, 6)).toBe(2);
    expect(periodRef({ kind: 'week', days: 7 }, 6)).toBe(6);
    expect(periodRef({ kind: 'month', days: 30 }, 6)).toBe(24);
    expect(periodRef({ kind: 'custom', days: 14 }, 6)).toBe(12);
    expect(periodRef({ kind: 'all', days: 51 }, 6)).toBe(43.714285714);
  });
});

describe('heatMap (fixtures)', () => {
  const tax = buildTaxonomy(cases.taxonomy);
  for (const c of cases.cases) {
    it(c.id, () => {
      const entries = toEntries(c.entries);
      const hm = heatMap(entries, periodOf(c.period, entries, c.today), tax);
      expect(hm.sets).toBe(c.expect.sets);
      expect(hm.muscles).toEqual(c.expect.muscles);
      expect(hm.rolled).toEqual(c.expect.rolled);
    });
  }
});

describe('compareHeat (fixture)', () => {
  const tax = buildTaxonomy(cmp.taxonomy);
  const entries = toEntries(cmp.entries);
  const a = heatMap(entries, periodOf(cmp.base, entries, '2026-11-20'), tax);
  const b = heatMap(entries, periodOf(cmp.current, entries, '2026-11-20'), tax);
  it('per-muscle delta, gain / loss, parents rolled', () => {
    const r = compareHeat(a, b);
    expect(r.detail).toEqual(cmp.expect.detail);
    expect(r.rolled).toEqual(cmp.expect.rolled);
  });
  it('bands of the two periods match the worked numbers', () => {
    for (const [id, band] of Object.entries(cmp.expect.bands.base)) expect(a.muscles[id]!.band).toBe(band);
    for (const [id, band] of Object.entries(cmp.expect.bands.current)) expect(b.muscles[id]!.band).toBe(band);
  });
  it('the same period twice gives only "same"', () => {
    const e = cmp.expect.same_when_equal;
    const x = heatMap(entries, periodOf(e.periodA, entries, '2026-11-20'), tax);
    const y = heatMap(entries, periodOf(e.periodB, entries, '2026-11-20'), tax);
    const r = compareHeat(x, y);
    expect(Object.values(r.detail).every((d) => d.trend === e.trendAll && d.delta === 0)).toBe(true);
  });
  it('two empty periods compare to nothing', () => {
    const t = heatMap([], periodFor('week', '2026-11-20'), tax);
    expect(compareHeat(t, t)).toEqual({ detail: {}, rolled: {} });
  });
});

describe('properties', () => {
  const tax = buildTaxonomy(cases.taxonomy);
  const entries = toEntries(cases.cases.find((c: { id: string }) => c.id === 'month_scaling').entries);
  const week = periodFor('week', '2026-11-20');
  it('input is not changed and entry order does not matter', () => {
    const before = JSON.stringify(entries);
    const r1 = heatMap(entries, week, tax);
    const r2 = heatMap([...entries].reverse(), week, tax);
    expect(JSON.stringify(entries)).toBe(before);
    expect(r2).toEqual(r1);
  });
  it('heat01 stays within 0..1, a parent equals the max of its children, rawHeat ignores other periods', () => {
    const hm = heatMap(entries, periodFor('month', '2026-11-20'), tax);
    for (const m of Object.values(hm.muscles)) expect(m.heat01 >= 0 && m.heat01 <= 1).toBe(true);
    expect(hm.rolled.chest!.heat01).toBe(Math.max(hm.muscles.upper_chest!.heat01, hm.muscles.lower_chest!.heat01));
    expect(rawHeat(entries, periodFor('day', '2026-11-02'))).toEqual({ upper_chest: 4, lower_chest: 2.4, triceps: 1.2 });
    expect(rawHeat(entries, periodFor('day', '2026-11-03'))).toEqual({});
  });
  it('one more set never lowers a muscle\'s heat in the same period', () => {
    const more: HeatEntry[] = [...entries, { day: '2026-11-17', sets: 1, weights: { triceps: 0.3 } }];
    const a = heatMap(entries, week, tax).muscles.triceps!.heat01;
    const b = heatMap(more, week, tax).muscles.triceps!.heat01;
    expect(b).toBeGreaterThanOrEqual(a);
  });
});

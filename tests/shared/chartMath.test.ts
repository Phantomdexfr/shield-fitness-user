import { describe, expect, test } from 'vitest';
import { t } from '../../src/i18n';
import {
  compact, dayLabel, downsample, labelIndices, labelStride, nearestIndex, spacedLabelIndices, thinMonthLabels, niceScale, preparePoints, safe, scaleLinear,
  seriesStats, summaryFor, timeBase,
} from '../../src/shared/chartMath';

describe('niceScale (CHART_KIT 5.1, worked by hand)', () => {
  test('62.4 to 65.1 -> step 1, ticks 62..66', () => {
    const s = niceScale(62.4, 65.1);
    expect(s.step).toBe(1);
    expect(s.ticks).toEqual([62, 63, 64, 65, 66]);
    expect([s.min, s.max]).toEqual([62, 66]);
  });
  test('flat 80 -> 76..84 step 2', () => {
    const s = niceScale(80, 80);
    expect(s.ticks).toEqual([76, 78, 80, 82, 84]);
  });
  test('-5..5 -> step 5', () => {
    expect(niceScale(-5, 5).ticks).toEqual([-10, -5, 0, 5, 10]);
  });
  test('empty, NaN, zero-flat -> the safe fallback', () => {
    for (const s of [niceScale(NaN, 3), niceScale(1, Infinity), niceScale(0, 0)]) expect(s.ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  test('zero-based always starts at 0; floorZero never goes below 0', () => {
    expect(niceScale(30, 90, 5, { zeroBased: true }).ticks[0]).toBe(0);
    expect(niceScale(0.2, 0.4, 5, { floorZero: true }).ticks[0]).toBeGreaterThanOrEqual(0);
  });
  test('property: finite, ascending, 3 to 6 ticks, covers the data, no float dust', () => {
    const cases: [number, number][] = [[0.001, 0.002], [1e6, 1.2e6], [3, 3], [-100, -20], [0, 1], [7, 7.0001], [1234.5, 99999]];
    for (const [a, b] of cases) {
      const s = niceScale(a, b);
      expect(s.ticks.length).toBeGreaterThanOrEqual(3);
      expect(s.ticks.length).toBeLessThanOrEqual(7);
      s.ticks.forEach((v, i) => {
        expect(Number.isFinite(v)).toBe(true);
        if (i) expect(v).toBeGreaterThan(s.ticks[i - 1]!);
        expect(String(v).length).toBeLessThan(12);
      });
      expect(s.min).toBeLessThanOrEqual(Math.min(a, b));
      expect(s.max).toBeGreaterThanOrEqual(Math.max(a, b));
    }
  });
});

describe('downsample (LTTB, CHART_KIT 5.3)', () => {
  const wave = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: Math.sin(i / 37) * 50 + (i % 11) }));
  test('10,000 points -> at most 400, first and last kept, ascending, deterministic', () => {
    const src = wave(10000);
    const a = downsample(src, 400);
    const b = downsample(src, 400);
    expect(a.length).toBeLessThanOrEqual(400);
    expect(a.length).toBeGreaterThan(300);
    expect(a[0]).toEqual(src[0]);
    expect(a[a.length - 1]).toEqual(src[src.length - 1]);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i]!.x).toBeGreaterThan(a[i - 1]!.x);
  });
  test('400 or fewer points come back unchanged (a copy)', () => {
    const src = wave(400);
    const out = downsample(src, 400);
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
  });
  test('gaps survive: a null marker is still between two runs', () => {
    const src: { x: number; y: number | null }[] = wave(1000).map((p) => ({ ...p }));
    for (let i = 300; i < 310; i++) src[i]!.y = null;
    const out = downsample(src, 400);
    expect(out.length).toBeLessThanOrEqual(400);
    const gap = out.findIndex((p) => p.y === null);
    expect(gap).toBeGreaterThan(0);
    expect(out[gap - 1]!.y).not.toBeNull();
    expect(out[gap + 1]!.y).not.toBeNull();
  });
});

describe('helpers', () => {
  test('scaleLinear: normal, zero-width (middle), bad input (never NaN)', () => {
    const f = scaleLinear(0, 10, 0, 100);
    expect(f(5)).toBe(50);
    expect(scaleLinear(3, 3, 0, 100)(3)).toBe(50);
    expect(f(NaN)).toBe(50);
    expect(safe(NaN)).toBe(0);
    expect(safe(Infinity, 7)).toBe(7);
  });
  test('nearestIndex', () => {
    expect(nearestIndex([], 5)).toBe(-1);
    expect(nearestIndex([10], 99)).toBe(0);
    expect(nearestIndex([0, 10, 20, 30], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20, 30], 16)).toBe(2);
    expect(nearestIndex([0, 10, 20, 30], -50)).toBe(0);
    expect(nearestIndex([0, 10, 20, 30], 500)).toBe(3);
  });
  test('labels never overlap: stride and indices keep the last one', () => {
    expect(labelStride(5, 300, 'date')).toBe(1);
    const stride = labelStride(52, 300, 'date');
    expect(stride).toBeGreaterThan(1);
    const idx = labelIndices(52, stride);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(51);
    for (let i = 1; i < idx.length; i++) expect(idx[i]! - idx[i - 1]!).toBeGreaterThanOrEqual(Math.ceil(stride / 2));
  });
  test('compact above 9,999 only', () => {
    expect(compact(9999)).toBe('9,999');
    expect(compact(12400)).toBe('12.4k');
    expect(compact(NaN)).toBe('');
  });
  test('dayLabel: IST DayKey with i18n names', () => {
    expect(dayLabel('2026-11-12', t)).toBe('12 Nov');
    expect(dayLabel('2026-11-12', t, 'month')).toBe('Nov 26');
    expect(dayLabel('2026-11-12', t, 'full')).toBe('Thu 12 Nov 2026');
    expect(dayLabel('nope', t)).toBe('nope');
  });
  test('preparePoints: sorted, duplicate x keeps the last, bad y -> null, bad day key dropped', () => {
    const base = '2026-11-01';
    const out = preparePoints(
      [
        { x: '2026-11-05', y: 3 },
        { x: '2026-11-02', y: NaN },
        { x: '2026-11-05', y: 4 },
        { x: 'garbage', y: 1 },
        { x: '2026-11-03', y: Infinity },
      ],
      base,
    );
    expect(out.map((p) => [p.x, p.y])).toEqual([[1, null], [2, null], [4, 4]]);
    expect(preparePoints([{ x: 2, y: 1 }, { x: 1, y: 5 }, { x: NaN, y: 1 }], null).map((p) => p.x)).toEqual([1, 2]);
    expect(timeBase([[{ x: '2026-11-09', y: 1 }], [{ x: '2026-11-02', y: 1 }]])).toBe('2026-11-02');
    expect(timeBase([[{ x: 1, y: 1 }]])).toBeNull();
  });
});

describe('summaryFor (CHART_KIT 8)', () => {
  const f = (v: number) => String(v);
  test('line: stats text, change sign, every-Nth note', () => {
    const pts = preparePoints([{ x: '2026-11-01', y: 80 }, { x: '2026-11-08', y: 78 }, { x: '2026-11-15', y: 79 }], '2026-11-01');
    const st = seriesStats('Weight', pts, (p) => dayLabel(p.raw as string, t));
    const text = summaryFor({ kind: 'line', title: 'Body weight', series: [st], everyN: 3 }, f, t);
    expect(text).toContain('Body weight. 3 points from 1 Nov to 15 Nov.');
    expect(text).toContain('Latest 79, lowest 78, highest 80, change -1 since the first point.');
    expect(text).toContain('Showing every 3th point.');
  });
  test('line: empty and one point', () => {
    expect(summaryFor({ kind: 'line', title: 'X', series: [null] }, f, t)).toBe('X. No data yet.');
    const one = seriesStats('A', preparePoints([{ x: 1, y: 5 }], null), (p) => String(p.raw));
    expect(summaryFor({ kind: 'line', title: 'X', series: [one] }, f, t)).toBe('X. Not enough data yet.');
  });
  test('bar: max, min, average and target count', () => {
    const text = summaryFor({ kind: 'bar', title: 'Volume', data: [{ label: 'W1', y: 10 }, { label: 'W2', y: 30 }, { label: 'W3', y: 20 }], target: 20 }, f, t);
    expect(text).toBe('Volume. 3 bars. Highest 30 on W2, lowest 10 on W1, average 20. 2 of 3 reached the target of 20.');
    expect(summaryFor({ kind: 'bar', title: 'V', data: [] }, f, t)).toBe('V. No data yet.');
  });
});

// ---- Phase 52 ----
import { countUpValue, decimalsOf, deltaInfo, gaugeFraction, heatLayout, quintileBand, ringFraction, sessionBand, stackLayout, summaryFor2 } from '../../src/shared/chartMath';

describe('ringFraction / gaugeFraction (zero, overflow, bad input)', () => {
  test('normal, zero, over 100 %', () => {
    expect(ringFraction(2, 3)).toMatchObject({ valid: true, frac: 2 / 3, pct: 67, over: false, lap: 0 });
    expect(ringFraction(0, 100)).toMatchObject({ valid: true, frac: 0, pct: 0 });
    expect(ringFraction(120, 100)).toMatchObject({ frac: 1, pct: 120, over: true, lap: 0.2 });
    expect(ringFraction(500, 100).lap).toBe(1);
  });
  test('max <= 0, NaN, Infinity are not valid; negative reads as 0; huge stays finite', () => {
    for (const [v, m] of [[5, 0], [5, -1], [NaN, 10], [5, NaN], [Infinity, 10], [5, Infinity]] as const) expect(ringFraction(v, m).valid).toBe(false);
    expect(ringFraction(-4, 10)).toMatchObject({ valid: true, frac: 0, pct: 0 });
    const big = ringFraction(1e308, 1e-308);
    expect(Number.isFinite(big.pct) && Number.isFinite(big.frac) && Number.isFinite(big.lap)).toBe(true);
  });
  test('gauge clamps the arc, keeps the true percentage, sorts marks inside the range', () => {
    expect(gaugeFraction(50, 0, 100, [75, 25, 150, NaN])).toMatchObject({ valid: true, frac: 0.5, pct: 50, marks: [0.25, 0.75] });
    expect(gaugeFraction(150, 0, 100)).toMatchObject({ frac: 1, pct: 150, over: true });
    expect(gaugeFraction(-20, 0, 100)).toMatchObject({ frac: 0, pct: -20 });
    expect(gaugeFraction(5, 10, 10).valid).toBe(false);
    expect(gaugeFraction(5, 10, 0).valid).toBe(false);
    expect(gaugeFraction(NaN, 0, 10).valid).toBe(false);
  });
});

describe('heatLayout', () => {
  test('bands: sessions 0 / 1 / 2+ and quintiles', () => {
    expect([0, 1, 2, 5].map(sessionBand)).toEqual([0, 3, 5, 5]);
    const nz = [1, 2, 3, 4, 5];
    expect([0, 1, 2, 3, 4, 5].map((v) => quintileBand(v, nz))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(quintileBand(7, [])).toBe(0);
  });
  test('Monday-start columns, newest right, days outside from..to are not drawn', () => {
    // 2026-11-04 is a Wednesday; 2026-11-18 is a Wednesday two weeks on
    const l = heatLayout([{ day: '2026-11-04', value: 1 }, { day: '2026-11-05', value: 2 }, { day: '2026-11-18', value: 1 }], '2026-11-04', '2026-11-18');
    expect(l.weeks).toBe(3);
    expect(l.cells.length).toBe(15);
    expect(l.cells[0]).toMatchObject({ day: '2026-11-04', col: 0, row: 2, band: 3 });
    expect(l.cells[1]).toMatchObject({ row: 3, band: 5 });
    expect(l.cells[14]).toMatchObject({ day: '2026-11-18', col: 2, row: 2 });
    expect(l.activeDays).toBe(3);
    expect(l.longestRun).toBe(2);
    expect(l.bestWeek).toEqual({ start: '2026-11-02', active: 2 });
  });
  test('bad input: from after to, bad keys, NaN, negative, duplicates, 60 weeks clamp to 53', () => {
    expect(heatLayout([], '2026-11-10', '2026-11-01').weeks).toBe(0);
    expect(heatLayout([], 'nope', '2026-11-01').weeks).toBe(0);
    const l = heatLayout([{ day: 'bad', value: 1 }, { day: '2026-11-02', value: NaN }, { day: '2026-11-03', value: -4 }, { day: '2026-11-04', value: 1 }, { day: '2026-11-04', value: 3 }], '2026-11-02', '2026-11-08');
    expect(l.activeDays).toBe(1);
    expect(l.cells.find((c) => c.day === '2026-11-04')?.value).toBe(3);
    const long = heatLayout([], '2025-01-01', '2026-11-20');
    expect(long.weeks).toBe(53);
    expect(long.cells.every((c) => c.col >= 0 && c.col < 53)).toBe(true);
  });
  test('month labels: first column and each change of month', () => {
    const l = heatLayout([], '2026-10-26', '2026-11-22');
    expect(l.months.map((m) => m.month)).toEqual([10, 11]);
  });
});

describe('stackLayout', () => {
  test('percent normalises each row; parts <= 0 and NaN are skipped; colours stay by position', () => {
    const l = stackLayout([{ label: 'A', parts: [{ id: 'x', name: 'X', value: 30 }, { id: 'y', name: 'Y', value: 0 }, { id: 'z', name: 'Z', value: 10 }, { id: 'w', name: 'W', value: NaN }] }], 'percent');
    expect(l.rows[0]!.segs.map((s) => [s.id, s.pct, s.colorIndex])).toEqual([['x', 75, 1], ['z', 25, 3]]);
    expect(l.rows[0]!.segs[0]!.size).toBeCloseTo(0.75);
  });
  test('absolute uses one shared scale; zero row has no segments; at most 6 parts', () => {
    const l = stackLayout([{ label: 'A', parts: [{ id: 'a', name: 'A', value: 8 }] }, { label: 'B', parts: [{ id: 'a', name: 'A', value: 4 }] }, { label: 'C', parts: [] }], 'absolute');
    expect(l.scaleMax).toBe(10);
    expect(l.rows[0]!.segs[0]!.size).toBeCloseTo(0.8);
    expect(l.rows[1]!.segs[0]!.size).toBeCloseTo(0.4);
    expect(l.rows[2]!.total).toBe(0);
    const seven = stackLayout([{ label: 'A', parts: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, value: 1 })) }]);
    expect(seven.rows[0]!.segs.length).toBe(6);
  });
  test('all zero or huge never gives NaN', () => {
    const z = stackLayout([{ label: 'A', parts: [{ id: 'a', name: 'A', value: 0 }] }]);
    expect(JSON.stringify(z)).not.toMatch(/NaN|null/);
    const h = stackLayout([{ label: 'A', parts: [{ id: 'a', name: 'A', value: 1e308 }, { id: 'b', name: 'B', value: 1e308 }] }]);
    expect(JSON.stringify(h)).not.toMatch(/NaN|null/);
  });
});

describe('count-up and delta', () => {
  test('integers stay integers, decimals keep their places, p >= 1 is exact', () => {
    expect(decimalsOf(14)).toBe(0);
    expect(decimalsOf(81.25)).toBe(2);
    expect(Number.isInteger(countUpValue(14, 0.4))).toBe(true);
    expect(countUpValue(14, 0)).toBe(0);
    expect(countUpValue(14, 1)).toBe(14);
    expect(countUpValue(81.25, 1)).toBe(81.25);
    expect(countUpValue(81.2, 0.5)).toBeLessThanOrEqual(81.2);
    expect(countUpValue(NaN, 0.5)).toBe(0);
  });
  test('delta direction; good only when it is the wanted way; NaN hides it', () => {
    expect(deltaInfo(4, 'up')).toEqual({ dir: 'up', good: true });
    expect(deltaInfo(-4, 'up')).toEqual({ dir: 'down', good: false });
    expect(deltaInfo(-4, 'down')).toEqual({ dir: 'down', good: true });
    expect(deltaInfo(0, 'up')).toEqual({ dir: 'flat', good: false });
    expect(deltaInfo(3, 'any')?.good).toBe(false);
    expect(deltaInfo(NaN, 'up')).toBeNull();
  });
});

describe('summaryFor2', () => {
  const f = (v: number) => String(v);
  test('ring, empty ring, stat, heat, stack', () => {
    expect(summaryFor2({ kind: 'ring', title: 'Protein', value: 120, max: 100, pct: 120, valid: true }, f, t)).toBe('Protein. 120 of 100 (120 %).');
    expect(summaryFor2({ kind: 'ring', title: 'Protein', value: 1, max: 0, pct: 0, valid: false }, f, t)).toBe('Protein. No data yet.');
    expect(summaryFor2({ kind: 'stat', label: 'Sessions', value: '14', unit: 'x', deltaText: '+4 % vs last month' }, f, t)).toBe('Sessions: 14 x. +4 % vs last month.');
    const l = heatLayout([{ day: '2026-11-04', value: 1 }], '2026-11-02', '2026-11-15');
    expect(summaryFor2({ kind: 'heat', title: 'Consistency', layout: l }, f, t)).toBe('Consistency. 1 active days in 2 weeks. Longest run 1 days. Most active week starting 2 Nov.');
    const s = stackLayout([{ label: 'Upper', parts: [{ id: 'a', name: 'Push', value: 3 }, { id: 'b', name: 'Pull', value: 1 }] }, { label: 'Lower', parts: [] }], 'percent');
    expect(summaryFor2({ kind: 'stack', title: 'Balance', rows: s.rows, mode: 'percent' }, f, t)).toBe('Balance. Upper: Push 3 (75 %), Pull 1 (25 %). Lower: no data.');
  });
});

describe('Phase 54 fix-up: label gaps', () => {
  test('bar x labels keep at least 8 px apart; the last one wins; clean input is unchanged', () => {
    // 12 slots of 24 px, labels 36 px wide (e.g. "16 Nov"): picks 0,3,6,9,11 would put 9 and 11 only 48 px apart centre to centre.
    const centers = Array.from({ length: 12 }, (_, i) => 36 + 24 * (i + 0.5));
    const widths = centers.map(() => 36);
    const kept = spacedLabelIndices([0, 3, 6, 9, 11], centers, widths, 8, 36, 360);
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(11);
    for (let k = 1; k < kept.length; k++) expect(centers[kept[k]!]! - widths[0]! / 2 - (centers[kept[k - 1]!]! + widths[0]! / 2)).toBeGreaterThanOrEqual(8);
    expect(spacedLabelIndices([0, 6], centers, widths, 8, 36, 360)).toEqual([0, 6]);
  });
  test('heat grid month labels: one starting under 3 columns after the previous is skipped', () => {
    const months = [{ col: 0, month: 8 }, { col: 2, month: 9 }, { col: 6, month: 10 }, { col: 9, month: 11 }, { col: 10, month: 12 }];
    expect(thinMonthLabels(months).map((m) => m.month)).toEqual([8, 10, 11]);
    expect(thinMonthLabels([{ col: 0, month: 1 }, { col: 4, month: 2 }]).length).toBe(2);
  });
});

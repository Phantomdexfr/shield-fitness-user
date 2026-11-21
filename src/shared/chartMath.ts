// Pure chart maths (docs/design/CHART_KIT.md sections 3, 5, 6, 8). No DOM, no clock, no network.
import type { StringKey } from '../i18n/en';
import { addDays, dayKeyStart, daysBetween, isDayKey, weekdayOfKey, type DayKey } from './dates';

export type Tr = (key: StringKey, params?: Record<string, string | number>) => string;

/** A finite number, or null. Nothing that reaches an SVG attribute may be NaN or Infinity. */
export const finiteOr = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Number for an SVG attribute: never NaN / Infinity, trimmed to 2 decimals. */
export const safe = (v: number, fallback = 0): number => (Number.isFinite(v) ? Math.round(v * 100) / 100 : fallback);

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

const STEPS = [1, 2, 2.5, 5, 10];

/** Section 5.1. Never returns NaN; weight-like data may pass `floorZero` so no tick goes below 0. */
export function niceScale(min: number, max: number, maxTicks = 5, opts: { zeroBased?: boolean; floorZero?: boolean } = {}): NiceScale {
  const fallback: NiceScale = { min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (opts.zeroBased) lo = Math.min(lo, 0);
  if (hi === lo) {
    if (hi === 0) return fallback;
    const d = Math.max(Math.abs(hi) * 0.05, 1);
    lo = hi - d;
    hi = hi + d;
  } else {
    const pad = (hi - lo) * 0.05;
    hi += pad;
    if (!opts.zeroBased) lo -= pad;
  }
  if (opts.zeroBased) lo = Math.min(lo, 0);
  const n = Math.max(2, Math.floor(maxTicks));
  const raw = (hi - lo) / (n - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = STEPS.map((k) => Number((k * mag).toPrecision(12))).find((v) => v >= raw - 1e-12) ?? mag * 10;
  let nMin = Math.floor(lo / step + 1e-9) * step;
  const nMax = Math.ceil(hi / step - 1e-9) * step;
  if (opts.floorZero && nMin < 0 && min >= 0) nMin = 0;
  const dec = (String(Number(step.toPrecision(12))).split('.')[1] ?? '').length;
  const ticks: number[] = [];
  const count = Math.round((nMax - nMin) / step);
  for (let i = 0; i <= count && i < 50; i++) ticks.push(Number((nMin + i * step).toFixed(dec)));
  return { min: ticks[0] ?? nMin, max: ticks[ticks.length - 1] ?? nMax, step, ticks };
}

export interface XY {
  x: number;
  y: number | null;
}

/** Largest-triangle-three-buckets on one run of real points. */
function lttb<T extends XY>(run: T[], budget: number): T[] {
  if (budget >= run.length) return run.slice();
  if (budget < 3) return [run[0]!, run[run.length - 1]!];
  const out: T[] = [run[0]!];
  const every = (run.length - 2) / (budget - 2);
  let a = 0;
  const last = run.length - 1;
  for (let i = 0; i < budget - 2; i++) {
    const start = Math.floor(i * every) + 1;
    const end = Math.min(Math.floor((i + 1) * every) + 1, last);
    const nStart = end;
    const nEnd = Math.min(Math.floor((i + 2) * every) + 1, last);
    let ax = 0;
    let ay = 0;
    if (nEnd > nStart) {
      for (let j = nStart; j < nEnd; j++) {
        ax += run[j]!.x;
        ay += run[j]!.y ?? 0;
      }
      ax /= nEnd - nStart;
      ay /= nEnd - nStart;
    } else {
      ax = run[last]!.x;
      ay = run[last]!.y ?? 0;
    }
    const pa = run[a]!;
    let best = -1;
    let pick = start;
    for (let j = start; j < end; j++) {
      const area = Math.abs((pa.x - ax) * ((run[j]!.y ?? 0) - (pa.y ?? 0)) - (pa.x - run[j]!.x) * (ay - (pa.y ?? 0)));
      if (area > best) {
        best = area;
        pick = j;
      }
    }
    out.push(run[pick]!);
    a = pick;
  }
  out.push(run[run.length - 1]!);
  return out;
}

/** Section 5.3. <= maxPoints out, first and last kept, gaps (y null) kept as markers, deterministic. */
export function downsample<T extends XY>(points: readonly T[], maxPoints = 400): T[] {
  if (points.length <= maxPoints) return points.slice();
  const runs: T[][] = [];
  const gaps: T[] = [];
  let cur: T[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (cur.length) runs.push(cur);
      cur = [];
      gaps.push(p);
    } else cur.push(p);
  }
  if (cur.length) runs.push(cur);
  const real = runs.reduce((n, r) => n + r.length, 0);
  if (gaps.length === 0 || runs.length * 2 + gaps.length > maxPoints) {
    const all = points.filter((p) => p.y !== null);
    return lttb(all, maxPoints);
  }
  const budget = maxPoints - gaps.length;
  const out: T[] = [];
  let gi = 0;
  let used = 0;
  runs.forEach((r, i) => {
    const b = Math.max(2, Math.min(r.length, Math.floor((budget * r.length) / real)));
    used += b;
    out.push(...lttb(r, b));
    if (i < runs.length - 1 && gi < gaps.length) {
      // keep one marker between runs (the first gap point after this run)
      const next = runs[i + 1]![0]!.x;
      const g = gaps.find((p) => p.x > r[r.length - 1]!.x && p.x < next) ?? gaps[gi]!;
      out.push(g);
      gi++;
    }
  });
  void used;
  return out;
}

/** Linear scale; a zero-width domain maps to the middle of the range. Never NaN. */
export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  return (v: number) => {
    if (!Number.isFinite(v) || !Number.isFinite(span) || span === 0) return safe((r0 + r1) / 2);
    return safe(r0 + ((v - d0) / span) * (r1 - r0));
  };
}

/** Index of the entry in an ascending array nearest to x (binary search). -1 for an empty array. */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo]! - x) <= Math.abs(xs[hi]! - x) ? lo : hi;
}

/** Section 5.4: how many labels fit, and the stride that keeps first, last and every Nth. */
export function labelStride(count: number, plotWidth: number, kind: 'date' | 'number'): number {
  const fit = Math.max(2, Math.floor(plotWidth / (kind === 'date' ? 56 : 40)));
  return count <= fit ? 1 : Math.ceil(count / fit);
}
/** Indices to label: 0, stride, 2*stride ... and always the last one if it does not collide. */
export function labelIndices(count: number, stride: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += stride) out.push(i);
  if (count > 1 && out[out.length - 1] !== count - 1) {
    if (count - 1 - out[out.length - 1]! >= Math.ceil(stride / 2)) out.push(count - 1);
    else out[out.length - 1] = count - 1;
  }
  return out;
}

/** Rough drawn width of an axis label at the chart font (about 7 px a character, measured at 360 px, plus a little margin at --text-xs). */
export const labelWidth = (text: string): number => text.length * 7.4;

/**
 * Keeps the labels from `labelIndices` that do not touch: each label is placed at its centre `centers[i]` (anchor `middle`,
 * or `start` / `end` near the plot edges as the charts do) and must leave `gap` px to the one before it. Where the last label
 * collides, it wins and the one before it is dropped, so the newest point stays named. No overlap = the input comes back unchanged.
 */
export function spacedLabelIndices(indices: number[], centers: number[], widths: number[], gap = 8, plotLeft = 0, plotRight = Infinity): number[] {
  const span = (i: number): [number, number] => {
    const c = centers[i] ?? 0;
    const w = widths[i] ?? 0;
    if (c > plotRight - 24) return [c - w, c];
    if (c < plotLeft + 16) return [c, c + w];
    return [c - w / 2, c + w / 2];
  };
  const kept: number[] = [];
  indices.forEach((i, k) => {
    const last = k === indices.length - 1;
    const hits = (j: number) => span(i)[0] < span(j)[1] + gap;
    if (last) while (kept.length > 1 && hits(kept[kept.length - 1]!)) kept.pop();
    if (kept.length === 0 || !hits(kept[kept.length - 1]!)) kept.push(i);
  });
  return kept;
}

/** Month labels of the heat grid, dropping one that would start less than `minCols` columns after the previous drawn label. */
export function thinMonthLabels<T extends { col: number }>(months: T[], minCols = 3): T[] {
  const out: T[] = [];
  for (const m of months) if (out.length === 0 || m.col - out[out.length - 1]!.col >= minCols) out.push(m);
  return out;
}

/** "12.4k" above 9,999 (axis only; the readout keeps the full value). */
export function compact(v: number): string {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a > 9999) return `${Number((v / 1000).toFixed(1))}k`;
  return fmtNum(v);
}
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
export const fmtNum = (v: number): string => (Number.isFinite(v) ? nf.format(v) : '');

// ---- dates (IST DayKeys, strings from i18n, section 6) -------------------------------------

const monthKey = (m: number) => `chart.m${m}` as StringKey;
const wdKey = (d: number) => `chart.wd${d}` as StringKey;

/** "12 Nov", "Nov 26" (month + 2-digit year, for spans over 120 days) or "Mon 12 Nov 2026". */
export function dayLabel(key: DayKey, tr: Tr, style: 'short' | 'month' | 'full' = 'short'): string {
  if (!isDayKey(key)) return String(key);
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const mon = tr(monthKey(m));
  if (style === 'month') return `${mon} ${String(y).slice(2)}`;
  if (style === 'full') return `${tr(wdKey(weekdayOfKey(key)))} ${d} ${mon} ${y}`;
  return `${d} ${mon}`;
}

/** Day number of a DayKey relative to a base key (proportional time axis). */
export const dayOffset = (base: DayKey, key: DayKey): number => daysBetween(base, key);
export { dayKeyStart };

// ---- series preparation ---------------------------------------------------------------------

export interface RawPoint {
  x: number | DayKey;
  y: number | null;
  label?: string;
}
export interface PreparedPoint extends XY {
  raw: number | DayKey;
  label?: string;
}

/** Section 3 rules: bad y -> null, duplicate x keeps the last, sorted ascending. Time keys become day offsets from `base`. */
export function preparePoints(points: readonly RawPoint[], base: DayKey | null): PreparedPoint[] {
  const byX = new Map<number, PreparedPoint>();
  for (const p of points) {
    let x: number;
    if (typeof p.x === 'string') {
      if (!isDayKey(p.x) || base === null) continue;
      x = dayOffset(base, p.x);
    } else if (Number.isFinite(p.x)) x = p.x;
    else continue;
    byX.set(x, { x, y: finiteOr(p.y), raw: p.x, label: p.label });
  }
  return [...byX.values()].sort((a, b) => a.x - b.x);
}

/** Earliest DayKey across series (the base of a time axis), or null when the axis is numeric. */
export function timeBase(seriesPoints: readonly (readonly RawPoint[])[]): DayKey | null {
  let best: DayKey | null = null;
  for (const pts of seriesPoints)
    for (const p of pts) if (typeof p.x === 'string' && isDayKey(p.x) && (best === null || p.x < best)) best = p.x;
  return best;
}

// ---- summaries (section 8) ------------------------------------------------------------------

export interface SeriesStats {
  name: string;
  n: number;
  first?: string;
  last?: string;
  latest: number;
  min: number;
  max: number;
  delta: number;
}

export function seriesStats(name: string, pts: readonly PreparedPoint[], xText: (p: PreparedPoint) => string): SeriesStats | null {
  const real = pts.filter((p) => p.y !== null);
  if (real.length === 0) return null;
  const ys = real.map((p) => p.y as number);
  return {
    name,
    n: real.length,
    first: xText(real[0]!),
    last: xText(real[real.length - 1]!),
    latest: ys[ys.length - 1]!,
    min: Math.min(...ys),
    max: Math.max(...ys),
    delta: ys[ys.length - 1]! - ys[0]!,
  };
}

export type SummaryInput =
  | { kind: 'line'; title: string; series: (SeriesStats | null)[]; everyN?: number }
  | { kind: 'bar'; title: string; data: { label: string; y: number }[]; target?: number };

export function summaryFor(input: SummaryInput, format: (v: number) => string, tr: Tr): string {
  if (input.kind === 'line') {
    const real = input.series.filter((s): s is SeriesStats => s !== null);
    if (real.length === 0) return tr('chart.sum.empty', { title: input.title });
    if (real.every((s) => s.n < 2)) return tr('chart.sum.few', { title: input.title });
    const parts = real.map((s) =>
      tr('chart.sum.line', {
        title: real.length > 1 ? `${input.title} (${s.name})` : input.title,
        n: s.n,
        first: s.first ?? '',
        last: s.last ?? '',
        latest: format(s.latest),
        min: format(s.min),
        max: format(s.max),
        delta: `${s.delta > 0 ? '+' : ''}${format(s.delta)}`,
      }),
    );
    if (input.everyN && input.everyN > 1) parts.push(tr('chart.every', { n: input.everyN }));
    return parts.join(' ');
  }
  const d = input.data;
  if (d.length === 0) return tr('chart.sum.empty', { title: input.title });
  let hi = d[0]!;
  let lo = d[0]!;
  let sum = 0;
  for (const p of d) {
    if (p.y > hi.y) hi = p;
    if (p.y < lo.y) lo = p;
    sum += p.y;
  }
  let text = tr('chart.sum.bar', { title: input.title, n: d.length, max: format(hi.y), maxLabel: hi.label, min: format(lo.y), minLabel: lo.label, avg: format(sum / d.length) });
  if (input.target !== undefined) {
    const k = d.filter((p) => p.y >= (input.target as number)).length;
    text += ' ' + tr('chart.sum.barTarget', { k, n: d.length, target: format(input.target) });
  }
  return text;
}

// ---- Phase 52: ring, gauge, heat grid, stacked bar, stat tile (CHART_KIT sections 4.4 and 4.6 to 4.9) ----------

const PCT_CAP = 1e6;

export interface RingFrac {
  valid: boolean;
  /** Arc length 0..1 (clamped). */
  frac: number;
  /** The true percentage for the centre text (120 % stays 120). Capped at 1,000,000 so it is always finite. */
  pct: number;
  over: boolean;
  /** Second-lap length 0..1 when over 100 %. */
  lap: number;
}
const NO_RING: RingFrac = { valid: false, frac: 0, pct: 0, over: false, lap: 0 };

/** value / max for a Ring. `max <= 0` or a non-finite input is not valid (the empty state); a negative value reads as 0. */
export function ringFraction(value: number, max = 1): RingFrac {
  const v = finiteOr(value);
  const m = finiteOr(max);
  if (v === null || m === null || m <= 0) return NO_RING;
  const raw0 = Math.max(0, v) / m;
  const raw = Number.isFinite(raw0) ? Math.min(raw0, PCT_CAP) : PCT_CAP;
  return { valid: true, frac: Math.min(1, raw), pct: Math.round(raw * 100), over: raw > 1, lap: raw > 1 ? Math.min(1, Math.round((raw - 1) * 1e6) / 1e6) : 0 };
}

export interface GaugeFrac extends RingFrac {
  /** Positions 0..1 of the marks that lie inside min..max, ascending. */
  marks: number[];
}
/** Half-ring maths. `min >= max` or a non-finite value is not valid. The arc is clamped; the true percentage is kept. */
export function gaugeFraction(value: number, min: number, max: number, marks: readonly number[] = []): GaugeFrac {
  const v = finiteOr(value);
  const lo = finiteOr(min);
  const hi = finiteOr(max);
  if (v === null || lo === null || hi === null || lo >= hi) return { ...NO_RING, marks: [] };
  const raw0 = (v - lo) / (hi - lo);
  const raw = Number.isFinite(raw0) ? Math.max(-PCT_CAP, Math.min(raw0, PCT_CAP)) : 0;
  const pos = marks
    .map((m) => finiteOr(m))
    .filter((m): m is number => m !== null && m >= lo && m <= hi)
    .map((m) => safe((m - lo) / (hi - lo), 0))
    .sort((a, b) => a - b);
  return { valid: true, frac: Math.max(0, Math.min(1, raw)), pct: Math.round(raw * 100), over: raw > 1, lap: 0, marks: pos };
}

// ---- heat grid ----

export type HeatMode = 'sessions' | 'volume';
export interface HeatCellIn {
  day: DayKey;
  value: number;
}
export interface HeatCellOut {
  day: DayKey;
  col: number;
  /** 0 = Monday ... 6 = Sunday. */
  row: number;
  value: number;
  /** Heat band 0..5 (`--heat-0 .. --heat-5`). */
  band: number;
}
export interface HeatLayout {
  weeks: number;
  cells: HeatCellOut[];
  months: { col: number; month: number }[];
  activeDays: number;
  longestRun: number;
  bestWeek: { start: DayKey; active: number } | null;
}
export const HEAT_MAX_WEEKS = 53;

/** Sessions mode: 0 -> 0, 1 -> 3, 2 or more -> 5 (A-P50.3). */
export const sessionBand = (v: number): number => (v <= 0 ? 0 : v < 2 ? 3 : 5);

/** Volume mode: 0 -> 0, then quintile bands 1..5 of the non-zero days (share of days with a value at or below this one). */
export function quintileBand(v: number, nonZeroSorted: readonly number[]): number {
  if (v <= 0 || nonZeroSorted.length === 0) return 0;
  let le = 0;
  for (const x of nonZeroSorted) if (x <= v) le++;
  return Math.max(1, Math.min(5, Math.ceil((le / nonZeroSorted.length) * 5)));
}

const weekStartOf = (key: DayKey): DayKey => addDays(key, -weekdayOfKey(key));

/** Calendar grid: columns = Monday-start IST weeks (newest right), rows = Monday..Sunday. Days outside from..to are not drawn. */
export function heatLayout(cells: readonly HeatCellIn[], from: DayKey, to: DayKey, mode: HeatMode = 'sessions'): HeatLayout {
  const empty: HeatLayout = { weeks: 0, cells: [], months: [], activeDays: 0, longestRun: 0, bestWeek: null };
  if (!isDayKey(from) || !isDayKey(to) || from > to) return empty;
  const byDay = new Map<DayKey, number>();
  for (const c of cells) {
    if (c && typeof c.day === 'string' && isDayKey(c.day)) {
      const v = finiteOr(c.value);
      byDay.set(c.day, v !== null && v > 0 ? v : 0);
    }
  }
  let ws = weekStartOf(from);
  const lastWs = weekStartOf(to);
  let weeks = Math.round(daysBetween(ws, lastWs) / 7) + 1;
  if (weeks > HEAT_MAX_WEEKS) {
    weeks = HEAT_MAX_WEEKS;
    ws = addDays(lastWs, -(HEAT_MAX_WEEKS - 1) * 7);
  }
  const first = from > ws ? from : ws;
  const nonZero = [...byDay.entries()].filter(([d, v]) => v > 0 && d >= first && d <= to).map(([, v]) => v).sort((a, b) => a - b);
  const out: HeatCellOut[] = [];
  const total = daysBetween(first, to) + 1;
  let active = 0;
  let run = 0;
  let longest = 0;
  const weekActive = new Map<number, number>();
  for (let i = 0; i < total; i++) {
    const day = addDays(first, i);
    const v = byDay.get(day) ?? 0;
    const col = Math.floor(daysBetween(ws, day) / 7);
    const band = mode === 'volume' ? quintileBand(v, nonZero) : sessionBand(v);
    out.push({ day, col, row: weekdayOfKey(day), value: v, band });
    if (v > 0) {
      active++;
      run++;
      if (run > longest) longest = run;
      weekActive.set(col, (weekActive.get(col) ?? 0) + 1);
    } else run = 0;
  }
  let best: HeatLayout['bestWeek'] = null;
  for (const [col, n] of weekActive) {
    const start = addDays(ws, col * 7);
    if (!best || n > best.active || (n === best.active && start > best.start)) best = { start, active: n };
  }
  const months: HeatLayout['months'] = [];
  let prev = -1;
  for (let c = 0; c < weeks; c++) {
    const m = Number(addDays(ws, c * 7).slice(5, 7));
    if (m !== prev) months.push({ col: c, month: m });
    prev = m;
  }
  return { weeks, cells: out, months, activeDays: active, longestRun: longest, bestWeek: best };
}

// ---- stacked bar ----

export interface StackPartIn {
  id: string;
  name: string;
  value: number;
  colorIndex?: number;
}
export interface StackSeg {
  id: string;
  name: string;
  value: number;
  /** Share of the row total, whole percent. */
  pct: number;
  colorIndex: number;
  /** Length as a 0..1 share of the track (row total in percent mode, the shared scale in absolute mode). */
  size: number;
}
export interface StackRowOut {
  label: string;
  total: number;
  segs: StackSeg[];
}
export const STACK_MAX_PARTS = 6;
const clampColor = (c: number | undefined, fallback: number): number => {
  const n = finiteOr(c);
  return n === null ? fallback : Math.max(1, Math.min(6, Math.round(n)));
};

/** Parts with value <= 0 (or not finite) are skipped; colours follow the position given, so they stay stable when a part is 0. */
export function stackLayout(rows: readonly { label: string; parts: readonly StackPartIn[] }[], mode: 'absolute' | 'percent' = 'absolute'): { rows: StackRowOut[]; scaleMax: number } {
  const prelim = rows.map((r) => {
    const segs = r.parts.slice(0, STACK_MAX_PARTS).flatMap((p, i) => {
      const v = finiteOr(p.value);
      return v !== null && v > 0 ? [{ id: p.id, name: p.name, value: v, colorIndex: clampColor(p.colorIndex, i + 1) }] : [];
    });
    const total = segs.reduce((s, p) => s + p.value, 0);
    return { label: r.label, total: Number.isFinite(total) ? total : 0, segs };
  });
  const maxTotal = Math.max(0, ...prelim.map((r) => r.total));
  const scaleMax = mode === 'absolute' && maxTotal > 0 ? niceScale(0, maxTotal, 5, { zeroBased: true, floorZero: true }).max : 1;
  return {
    scaleMax,
    rows: prelim.map((r) => ({
      label: r.label,
      total: r.total,
      segs: r.segs.map((s) => ({
        ...s,
        pct: r.total > 0 ? Math.round((s.value / r.total) * 100) : 0,
        size: r.total <= 0 ? 0 : mode === 'percent' ? s.value / r.total : Math.min(1, s.value / scaleMax),
      })),
    })),
  };
}

// ---- stat tile ----

export const easeOutCubic = (p: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
/** Decimal places of a number, at most 2 (whole numbers count as whole numbers). */
export function decimalsOf(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const s = String(Math.round(Math.abs(v) * 100) / 100);
  return Math.min(2, (s.split('.')[1] ?? '').length);
}
/** Value shown at progress p (0..1). p >= 1 returns the target exactly, so the last frame never drifts. */
export function countUpValue(target: number, p: number): number {
  if (!Number.isFinite(target)) return 0;
  if (!(p < 1)) return target;
  const d = decimalsOf(target);
  const k = Math.pow(10, d);
  return Math.round(target * easeOutCubic(p) * k) / k;
}

export interface DeltaInfo {
  dir: 'up' | 'down' | 'flat';
  /** True only when the move is the wanted one; never drives a red colour (A-P50.6). */
  good: boolean;
}
export function deltaInfo(value: number, goodWhen: 'up' | 'down' | 'any'): DeltaInfo | null {
  const v = finiteOr(value);
  if (v === null) return null;
  const dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  return { dir, good: (dir === 'up' && goodWhen === 'up') || (dir === 'down' && goodWhen === 'down') };
}

export type SummaryInput2 =
  | { kind: 'ring'; title: string; value: number; max: number; pct: number; valid: boolean }
  | { kind: 'stack'; title: string; rows: StackRowOut[]; mode: 'absolute' | 'percent' }
  | { kind: 'heat'; title: string; layout: HeatLayout }
  | { kind: 'stat'; label: string; value: string; unit?: string; deltaText?: string };

/** Section 8 summaries for the Phase 52 charts. */
export function summaryFor2(input: SummaryInput2, format: (v: number) => string, tr: Tr): string {
  switch (input.kind) {
    case 'ring':
      return input.valid ? tr('chart.sum.ring', { title: input.title, value: format(input.value), max: format(input.max), pct: input.pct }) : tr('chart.sum.empty', { title: input.title });
    case 'stack': {
      if (input.rows.every((r) => r.total <= 0)) return tr('chart.sum.empty', { title: input.title });
      const rows = input.rows.map((r) =>
        r.total <= 0
          ? tr('chart.sum.stackNone', { row: r.label })
          : tr('chart.sum.stackRow', { row: r.label, parts: r.segs.map((s) => `${s.name} ${format(s.value)} (${s.pct} %)`).join(', ') }),
      );
      return `${input.title}. ${rows.join(' ')}`;
    }
    case 'heat': {
      const l = input.layout;
      if (l.weeks === 0) return tr('chart.sum.empty', { title: input.title });
      let text = tr('chart.sum.heat', { title: input.title, active: l.activeDays, weeks: l.weeks, run: l.longestRun });
      if (l.bestWeek) text += ' ' + tr('chart.sum.heatWeek', { week: dayLabel(l.bestWeek.start, tr, 'short') });
      return text;
    }
    case 'stat':
      return `${tr('chart.sum.stat', { label: input.label, value: `${input.value}${input.unit ? ` ${input.unit}` : ''}` })}${input.deltaText ? ` ${input.deltaText}.` : ''}`;
  }
}

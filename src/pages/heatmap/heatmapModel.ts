// Heatmap page rules (Phase 44). Pure: no DOM, no storage, no clock (today is a parameter). The engine is src/shared/heat.

import { bandOf, allPeriod, customPeriod, lastDays, periodFor, shiftPeriod, type Band, type HeatMap, type HeatEntry, type HeatComparison, type Period, type PeriodKind } from '../../shared/heat';
import { daysBetween, type DayKey } from '../../shared/dates';
import { tidy9 } from '../../shared/heat';
import type { Taxonomy } from '../../shared/muscles';

/** One logged exercise of one session, with what the tap sheet needs to name it. */
export interface LoggedEntry extends HeatEntry {
  slug: string;
  name: string;
  variation?: string;
}

export const PERIOD_KINDS: readonly PeriodKind[] = ['day', 'week', 'month', 'custom', 'all'];
export const RANGE_PRESETS = [7, 14, 30, 90] as const;
export type BandLabelKey = 'hm.band.1' | 'hm.band.2' | 'hm.band.3' | 'hm.band.4' | 'hm.band.5';
export const bandLabelKey = (b: Band): BandLabelKey | null => (b === 0 ? null : (`hm.band.${b}` as BandLabelKey));

/** Switching the chip: day / week / month start at today's; all = first logged day .. today. Custom keeps the range given. */
export function choosePeriod(kind: PeriodKind, today: DayKey, entryDays: readonly DayKey[], custom?: Period): Period {
  if (kind === 'all') return allPeriod(entryDays, today);
  if (kind === 'custom') return custom ?? lastDays(30, today);
  return periodFor(kind, today);
}

export const canPrev = (p: Period): boolean => p.kind !== 'all';
/** No stepping into the future: the arrow is off once the period reaches today. */
export const canNext = (p: Period, today: DayKey): boolean => p.kind !== 'all' && p.to < today;
export const stepPeriod = (p: Period, n: 1 | -1): Period => shiftPeriod(p, n);

/** Compare needs a second period: the one before this one (same kind, or the same length for custom). All time has none. */
export const comparePeriod = (p: Period): Period | null => (p.kind === 'all' ? null : shiftPeriod(p, -1));

export const customFrom = (a: DayKey, b: DayKey): Period | null => {
  try {
    return customPeriod(a, b);
  } catch {
    return null;
  }
};

export interface HeatRow {
  id: string;
  heat01: number;
  band: Band;
}

/** The text twin: every muscle with work, hottest first (ties by id). */
export function heatRows(map: HeatMap): HeatRow[] {
  return Object.entries(map.muscles)
    .filter(([, m]) => m.band > 0)
    .map(([id, m]) => ({ id, heat01: m.heat01, band: m.band }))
    .sort((a, b) => b.heat01 - a.heat01 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Bands for the body picker: parent regions first, then each muscle's own band (a child's own entry wins). */
export function heatBands(map: HeatMap): Record<string, Band> {
  const out: Record<string, Band> = {};
  for (const [id, r] of Object.entries(map.rolled)) if (r.band > 0) out[id] = r.band;
  for (const [id, m] of Object.entries(map.muscles)) if (m.band > 0) out[id] = m.band;
  return out;
}

export interface CompareBands {
  gain: Record<string, Band>;
  loss: Record<string, Band>;
}

/** Gold for more work, steel for less; the band is the size of the change on the same 0.2 steps (never red). */
export function compareBands(cmp: HeatComparison): CompareBands {
  const gain: Record<string, Band> = {};
  const loss: Record<string, Band> = {};
  const put = (m: Record<string, { delta: number }>) => {
    for (const [id, d] of Object.entries(m)) {
      if (d.delta > 0) gain[id] = bandOf(d.delta);
      else if (d.delta < 0) loss[id] = bandOf(-d.delta);
    }
  };
  put(cmp.rolled);
  put(cmp.detail);
  return { gain, loss };
}

export interface CompareRow {
  id: string;
  delta: number;
  trend: 'gain' | 'loss' | 'same';
}

/** Text twin of compare mode: biggest change first. */
export function compareRows(cmp: HeatComparison): CompareRow[] {
  return Object.entries(cmp.detail)
    .filter(([, d]) => d.trend !== 'same')
    .map(([id, d]) => ({ id, delta: d.delta, trend: d.trend }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface Neglected {
  id: string;
  /** Days since the muscle was last trained (up to today); null = never logged. */
  daysSince: number | null;
}

/**
 * Muscles with no work in the period, the longest-neglected first (never trained = first), ties by id.
 * `ids` are the trainable muscle ids the caller lists (no parents that have children, no system ids).
 */
export function neglected(entries: readonly LoggedEntry[], map: HeatMap, ids: readonly string[], today: DayKey): Neglected[] {
  const last = new Map<string, DayKey>();
  for (const e of entries) {
    if (e.day > today) continue;
    for (const [id, w] of Object.entries(e.weights)) if (w > 0 && e.day > (last.get(id) ?? '')) last.set(id, e.day);
  }
  const out: Neglected[] = [];
  for (const id of ids) {
    if ((map.muscles[id]?.raw ?? 0) > 0) continue;
    const day = last.get(id);
    out.push({ id, daysSince: day ? daysBetween(day, today) : null });
  }
  return out.sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface MuscleHit {
  name: string;
  variation?: string;
  /** Working-set units of this exercise in the period that touched the muscle. */
  sets: number;
}

export interface MuscleDetail {
  /** Working-set units in the period that touched the muscle (or any of its parts). */
  sets: number;
  hits: MuscleHit[];
  /** Latest day (up to today) the muscle had work, or null. */
  last: DayKey | null;
}

/** What the tap sheet shows for one muscle id (a parent id covers its parts). Hits are ordered by contribution, most first. */
export function muscleDetail(entries: readonly LoggedEntry[], period: Period, tax: Taxonomy, id: string, today: DayKey): MuscleDetail {
  const parts = new Set<string>([id, ...tax.expand(id)]);
  const by = new Map<string, MuscleHit & { share: number }>();
  let sets = 0;
  let last: DayKey | null = null;
  for (const e of entries) {
    let w = 0;
    for (const p of parts) w = Math.max(w, e.weights[p] ?? 0);
    if (!(w > 0)) continue;
    if (e.day <= today && (last === null || e.day > last)) last = e.day;
    if (e.day < period.from || e.day > period.to) continue;
    sets += e.sets;
    const key = `${e.slug}|${e.variation ?? ''}`;
    const cur = by.get(key) ?? { name: e.name, ...(e.variation ? { variation: e.variation } : {}), sets: 0, share: 0 };
    cur.sets = tidy9(cur.sets + e.sets);
    cur.share += e.sets * w;
    by.set(key, cur);
  }
  const hits = [...by.values()].sort((a, b) => b.share - a.share || (a.name < b.name ? -1 : 1)).map(({ share: _s, ...h }) => h);
  return { sets: tidy9(sets), hits, last };
}

/** The muscle ids the neglected strip may list: detailed muscles (a parent with children is left out), no system ids. */
export function trainableIds(all: readonly string[], tax: Taxonomy): string[] {
  return all.filter((id) => id !== 'full_body' && id !== 'cardio' && tax.childrenOf(id).length === 0);
}

/** Weak-spot groups: core ids (parent = itself), no system ids. */
export function weakGroups(all: readonly string[], tax: Taxonomy): string[] {
  return all.filter((id) => id !== 'full_body' && id !== 'cardio' && tax.parentOf(id) === id);
}

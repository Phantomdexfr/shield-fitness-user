// Reference ("what counts as full", engines.md section 4). Pure.
// weekly base per muscle = max(90th percentile of the person's weekly raw for that muscle, 6);
// day = base / 3, week = base, month = base x 4, custom / all = base x (days / 7).

import { addDays, weekdayOfKey, type DayKey } from '../dates';
import type { HeatEntry } from './rawHeat';
import { tidy9 } from './rawHeat';
import type { Period } from './periods';

/** Floor of the weekly base, so a beginner's one set is never "full". */
export const REF_FLOOR = 6;

/** Nearest-rank 90th percentile: sorted ascending, index ceil(0.9 n) - 1. [] gives 0. */
export function percentile90(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(0.9 * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

const weekStart = (day: DayKey): DayKey => addDays(day, -weekdayOfKey(day));

/** Weekly raw totals per muscle over ALL history: one number per IST week (Monday start) in which the muscle was trained. */
export function weeklyRaw(entries: readonly HeatEntry[]): Record<string, number[]> {
  const perWeek = new Map<string, Record<string, number>>();
  for (const e of entries) {
    const wk = weekStart(e.day);
    const cur = perWeek.get(wk) ?? {};
    for (const [id, w] of Object.entries(e.weights)) if (w > 0) cur[id] = (cur[id] ?? 0) + e.sets * w;
    perWeek.set(wk, cur);
  }
  const out: Record<string, number[]> = {};
  for (const wk of [...perWeek.keys()].sort()) {
    for (const [id, v] of Object.entries(perWeek.get(wk)!)) (out[id] ??= []).push(tidy9(v));
  }
  return out;
}

/** Weekly base per muscle that has history: max(p90, 6). A muscle with no history uses `REF_FLOOR` (see `baseOf`). */
export function weeklyBase(entries: readonly HeatEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, list] of Object.entries(weeklyRaw(entries))) out[id] = Math.max(percentile90(list), REF_FLOOR);
  return out;
}

export const baseOf = (base: Readonly<Record<string, number>>, id: string): number => base[id] ?? REF_FLOOR;

/** The reference for a period from a weekly base. */
export function periodRef(period: Pick<Period, 'kind' | 'days'>, base: number): number {
  switch (period.kind) {
    case 'day': return tidy9(base / 3);
    case 'week': return base;
    case 'month': return base * 4;
    default: return tidy9((base * period.days) / 7);
  }
}

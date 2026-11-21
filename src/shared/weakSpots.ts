// Weak-spot finder (Phase 44, contract/engines.md section 23). Pure: no clock (today is a parameter), no storage.
// Over the last 28 days: weighted sets per muscle group = sum(sets x muscle weight). Baseline = median of the groups the
// person trains. A group is weak when its value is below 40% of the baseline and it is not marked avoid / sore.

import { rollUpMax, type Taxonomy } from './muscles';
import { lastDays, rawHeat, tidy9, type HeatEntry } from './heat';
import type { DayKey } from './dates';

export const WEAK_WINDOW_DAYS = 28;
export const WEAK_MIN_SESSIONS = 6;
export const WEAK_FRACTION = 0.4;
export const WEAK_MAX = 3;
export const WEAK_SUGGESTIONS = 3;

export interface WeakInput {
  /** The whole history is fine; only the last 28 days are read. */
  entries: readonly HeatEntry[];
  today: DayKey;
  /** Finished sessions that started inside the window (the caller counts them). */
  sessions: number;
  /** Muscle groups that can be weak: core ids (parent = itself), without system ids such as full_body and cardio. */
  groups: readonly string[];
  tax: Taxonomy;
  /** Muscle ids marked avoid or sore; a group is skipped when one of them is the group or belongs to it. */
  marked?: readonly string[];
}

export interface WeakSpot {
  group: string;
  /** Weighted sets in the window. */
  value: number;
  /** value / baseline, 9 places. */
  ratio: number;
}

export interface WeakResult {
  status: 'ok' | 'not_enough';
  sessions: number;
  /** Median of the groups with work (0 when none). */
  baseline: number;
  /** Up to 3, lowest value first (ties by group id). */
  weak: WeakSpot[];
}

/** Weighted sets per group over the window: each entry counts sets x (max weight of the group's muscles in that entry). */
export function groupValues(entries: readonly HeatEntry[], today: DayKey, tax: Taxonomy): Record<string, number> {
  const window = lastDays(WEAK_WINDOW_DAYS, today);
  const rolled: HeatEntry[] = [];
  for (const e of entries) rolled.push({ day: e.day, sets: e.sets, weights: rollUpMax(e.weights, tax) });
  return rawHeat(rolled, window);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : tidy9((s[mid - 1]! + s[mid]!) / 2);
}

export function weakSpots(input: WeakInput): WeakResult {
  const { sessions, tax } = input;
  if (sessions < WEAK_MIN_SESSIONS) return { status: 'not_enough', sessions, baseline: 0, weak: [] };
  const values = groupValues(input.entries, input.today, tax);
  const trained = Object.values(values).filter((v) => v > 0);
  const baseline = median(trained);
  if (!(baseline > 0)) return { status: 'ok', sessions, baseline: 0, weak: [] };
  const marked = new Set<string>();
  for (const id of input.marked ?? []) marked.add(tax.parentOf(id) ?? id);
  const weak: WeakSpot[] = [];
  for (const group of input.groups) {
    if (marked.has(group)) continue;
    const value = values[group] ?? 0;
    if (value < tidy9(WEAK_FRACTION * baseline)) weak.push({ group, value, ratio: tidy9(value / baseline) });
  }
  weak.sort((a, b) => a.value - b.value || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0));
  return { status: 'ok', sessions, baseline, weak: weak.slice(0, WEAK_MAX) };
}

export interface PickDay {
  id: string;
  targetMuscles: readonly string[];
  items: number;
}

/**
 * Which routine day takes a weak group's exercise: the first day that targets the group (a target that belongs to the
 * group counts), else the day with the fewest exercises (the first on a tie). null when the routine has no days.
 */
export function pickDay(days: readonly PickDay[], group: string, tax: Taxonomy): string | null {
  if (days.length === 0) return null;
  for (const d of days) if (d.targetMuscles.some((m) => m === group || tax.parentOf(m) === group)) return d.id;
  let best = days[0]!;
  for (const d of days) if (d.items < best.items) best = d;
  return best.id;
}

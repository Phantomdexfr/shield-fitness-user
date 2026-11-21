// Routine rules (Phase 30). Pure: no DOM, no clock, no storage. Ids come from the caller (`makeId`).
// Shapes follow contract/engines.md section 1 (Routine, Day, Item). Spec: docs/ROUTINE_BUILDER.md (Phase 28 section).

import type { Result } from './validators';

export type RoutineSource = 'mine' | 'gym' | 'template' | `gym:${string}`;
export type SplitStyle = 'ppl' | 'upper_lower' | 'full_body' | 'bro' | 'custom';

/** One exercise line in a day. Phase 30 never creates items; clones copy them. */
export interface RoutineItem {
  ref: { kind: 'lib'; slug: string } | { kind: 'custom'; id: string };
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  note?: string;
  tag?: 'normal' | 'superset' | 'drop';
  supersetGroup?: string;
  variation?: string;
  setup?: Record<string, unknown>;
}

export interface RoutineDay {
  id: string;
  name: string;
  targetMuscles: string[];
  items: RoutineItem[];
}

export interface Routine {
  id: string;
  name: string;
  source: RoutineSource;
  daysPerWeek: number;
  /** 0=Mon..6=Sun; empty = flexible, no fixed weekdays. */
  weekdays: number[];
  splitStyle: string;
  days: RoutineDay[];
  active: boolean;
  /** Local flag (Phase 30 list): hidden from the main list. Not part of the contract shape. */
  archived?: boolean;
  /** Phase 69: a live read-only mirror of a gym program (never edited here, never uploaded). */
  followed?: boolean;
  schedule?: unknown;
  /** Local only (A-P29.2): { anchorDate?, deloadWeeks, savedOn? }. Read through `parseMeta` in schedule.ts. */
  scheduleMeta?: unknown;
}

export const MIN_DAYS = 2;
export const MAX_DAYS = 7;
export const FLEXIBLE_DAYS = 3;
export const MAX_NAME = 40;
export const DEFAULT_NAME = 'My routine';

export const SPLIT_STYLES: readonly SplitStyle[] = ['ppl', 'upper_lower', 'full_body', 'bro', 'custom'];

export interface SplitDay {
  /** Plain label; `{n}` style numbering for repeats is added by `splitDays`. */
  label: string;
  muscles: string[];
}

/** Default day -> muscles per split (docs/ROUTINE_BUILDER.md, Phase 28). [A] the trainer may change these in data later. */
export const SPLIT_TABLE: Record<Exclude<SplitStyle, 'custom'>, SplitDay[]> = {
  ppl: [
    { label: 'Push', muscles: ['chest', 'front_delts', 'side_delts', 'triceps'] },
    { label: 'Pull', muscles: ['lats', 'back', 'rear_delts', 'biceps', 'traps'] },
    { label: 'Legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'] },
  ],
  upper_lower: [
    { label: 'Upper', muscles: ['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps'] },
    { label: 'Lower', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
  ],
  full_body: [{ label: 'Full body', muscles: ['quads', 'hamstrings', 'chest', 'back', 'shoulders', 'abs'] }],
  bro: [
    { label: 'Chest', muscles: ['chest'] },
    { label: 'Back', muscles: ['lats', 'back', 'traps'] },
    { label: 'Shoulders', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
    { label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
    { label: 'Legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
    { label: 'Core and cardio', muscles: ['abs'] },
    { label: 'Mobility', muscles: [] },
  ],
};

/** The day list a split gives for `count` days, and whether it had to repeat (so the UI can say so). */
export function splitDays(style: SplitStyle, count: number): { days: SplitDay[]; cycled: boolean } {
  const n = Math.max(1, Math.min(MAX_DAYS, Math.floor(count)));
  if (style === 'custom') return { days: Array.from({ length: n }, (_, i) => ({ label: `Day ${i + 1}`, muscles: [] })), cycled: false };
  const base = SPLIT_TABLE[style];
  if (style === 'full_body') {
    // "Full body A, B, C..." by position.
    return { days: Array.from({ length: n }, (_, i) => ({ label: `Full body ${String.fromCharCode(65 + i)}`, muscles: [...base[0]!.muscles] })), cycled: false };
  }
  if (style === 'bro') {
    // The first N of the table (2-7); never repeats.
    return { days: base.slice(0, n).map((d) => ({ label: d.label, muscles: [...d.muscles] })), cycled: false };
  }
  const days = Array.from({ length: n }, (_, i) => {
    const d = base[i % base.length]!;
    return { label: d.label, muscles: [...d.muscles] };
  });
  return { days, cycled: n > base.length };
}

const clean = (s: string): string => s.trim().replace(/\s+/g, ' ');

/** A routine name: trimmed, 1 to 40 characters. */
export function validateRoutineName(raw: string): Result<string, 'name_empty' | 'name_too_long'> {
  const s = clean(raw);
  if (s === '') return { ok: false, error: 'name_empty' };
  if (s.length > MAX_NAME) return { ok: false, error: 'name_too_long' };
  return { ok: true, value: s };
}

const key = (s: string): string => clean(s).toLowerCase();

/** `base`, then `base 2`, `base 3`... until the name is free (case-insensitive). */
export function freeName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(key));
  if (!used.has(key(base))) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(key(candidate))) return candidate;
  }
}

export interface RoutineInput {
  name: string;
  /** 2 to 7, or 'flexible'. */
  days: number | 'flexible';
  weekdays: number[];
  splitStyle: SplitStyle;
}

export type RoutineInputError = 'name_too_long' | 'days_range' | 'weekday_invalid' | 'split_unknown';

/** Weekdays: whole numbers 0-6, no repeats, sorted. */
export function normaliseWeekdays(list: readonly number[]): number[] | null {
  const out: number[] = [];
  for (const n of list) {
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Build a new routine from the setup page. A blank name becomes "My routine" (then "My routine 2"). Days per week is 2 to 7 or
 * "flexible" (3 days, no weekdays). Weekdays are optional and never have to match the day count.
 */
export function createRoutine(input: RoutineInput, makeId: () => string, takenNames: Iterable<string> = []): Result<Routine, RoutineInputError> {
  if (!SPLIT_STYLES.includes(input.splitStyle)) return { ok: false, error: 'split_unknown' };
  const flexible = input.days === 'flexible';
  const count = flexible ? FLEXIBLE_DAYS : input.days;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < MIN_DAYS || count > MAX_DAYS) return { ok: false, error: 'days_range' };
  const wd = flexible ? [] : normaliseWeekdays(input.weekdays);
  if (!wd) return { ok: false, error: 'weekday_invalid' };
  const trimmed = clean(input.name);
  if (trimmed.length > MAX_NAME) return { ok: false, error: 'name_too_long' };
  const name = trimmed === '' ? freeName(DEFAULT_NAME, takenNames) : trimmed;
  const { days } = splitDays(input.splitStyle, count);
  return {
    ok: true,
    value: {
      id: makeId(),
      name,
      source: 'mine',
      daysPerWeek: count,
      weekdays: wd,
      splitStyle: input.splitStyle,
      days: days.map((d) => ({ id: makeId(), name: d.label, targetMuscles: d.muscles, items: [] })),
      active: false,
    },
  };
}

export type RoutineProblem = 'name_empty' | 'name_too_long' | 'days_per_week' | 'weekday_invalid' | 'no_days' | 'too_many_days' | 'day_id_missing' | 'day_id_duplicate' | 'day_name_empty';

/** Checks a stored routine. Custom may have 1 day; the setup stepper never gives fewer than 2. */
export function validateRoutine(r: Routine): RoutineProblem[] {
  const out: RoutineProblem[] = [];
  const n = validateRoutineName(r.name);
  if (!n.ok) out.push(n.error);
  if (!Number.isInteger(r.daysPerWeek) || r.daysPerWeek < 1 || r.daysPerWeek > MAX_DAYS) out.push('days_per_week');
  if (normaliseWeekdays(r.weekdays) === null) out.push('weekday_invalid');
  if (r.days.length === 0) out.push('no_days');
  if (r.days.length > MAX_DAYS) out.push('too_many_days');
  const seen = new Set<string>();
  for (const d of r.days) {
    if (!d.id) out.push('day_id_missing');
    else if (seen.has(d.id)) out.push('day_id_duplicate');
    seen.add(d.id);
    if (clean(d.name) === '') out.push('day_name_empty');
  }
  return [...new Set(out)];
}

/**
 * Copy of a routine: new id, new day ids, items copied, inactive, `mine`, name "<name> copy" (then "copy 2"...).
 * A long name is shortened to fit the 40-character limit (the data, not the display).
 */
export function cloneRoutine(r: Routine, makeId: () => string, takenNames: Iterable<string> = []): Routine {
  const suffix = ' copy';
  const base = clean(r.name).slice(0, MAX_NAME - suffix.length - 3).trimEnd() + suffix;
  const copy: Routine = {
    ...JSON.parse(JSON.stringify(r)),
    id: makeId(),
    name: freeName(base, takenNames),
    source: 'mine',
    active: false,
    days: r.days.map((d) => ({ ...JSON.parse(JSON.stringify(d)), id: makeId() })),
  };
  delete copy.archived;
  return copy;
}

/** "3 days chosen, 4 per week" check for the quiet line on the setup page. */
export function weekdayMismatch(days: number | 'flexible', weekdays: readonly number[]): boolean {
  return days !== 'flexible' && weekdays.length > 0 && weekdays.length !== days;
}

/** Live (non-archived) routines first, the active one on top, then newest name order is left to the caller. */
export function sortRoutines<T extends { active: boolean }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => Number(b.active) - Number(a.active));
}

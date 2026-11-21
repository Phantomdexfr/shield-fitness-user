// Routine editing rules (Phase 31). Pure: no DOM, no clock, no storage. Spec: docs/ROUTINE_BUILDER.md (flows C, D, E).
// All functions return new objects; nothing is changed in place.

import type { Routine, RoutineDay, RoutineItem } from './routine';
import { MAX_DAYS, MAX_NAME, validateRoutineName } from './routine';
import type { Result } from './validators';

export const MIN_SETS = 1;
export const MAX_SETS = 10;
export const MIN_REST = 15;
export const MAX_REST = 600;
export const REST_STEP = 15;
export const MAX_NOTE = 500;
export const LONG_DAY_ITEMS = 12;
export const DEFAULT_SETS = 3;
export const DEFAULT_REP_MIN = 8;
export const DEFAULT_REP_MAX = 12;
export const DEFAULT_REST = 90;
/** [A-P31.2] Soft weekly cap of weighted sets per muscle; above it the week view says so. Hint only. */
export const WEEKLY_SET_CAP = 20;
/** [A-P31.2] Weighted sets that count as "planned" on a day for the two-days-in-a-row hint. */
export const BACK_TO_BACK_SETS = 4;
/** Minutes of one set (work) used for the time estimate. */
const SET_SEC = 45;

export type ItemRef = RoutineItem['ref'];
export const sameRef = (a: ItemRef, b: ItemRef): boolean => (a.kind === 'lib' && b.kind === 'lib' ? a.slug === b.slug : a.kind === 'custom' && b.kind === 'custom' ? a.id === b.id : false);
export const refKey = (r: ItemRef): string => (r.kind === 'lib' ? r.slug : `custom:${r.id}`);

/** A new item with the usual defaults (3 x 8-12, rest 90 s). */
export function newItem(ref: ItemRef): RoutineItem {
  return { ref, sets: DEFAULT_SETS, repMin: DEFAULT_REP_MIN, repMax: DEFAULT_REP_MAX, restSec: DEFAULT_REST, tag: 'normal' };
}

const clampInt = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(n)));

// ---------- items ----------

/** Adds at the end. Adding the same exercise twice is allowed (spec D2). Never blocked, however long the day. */
export function addItem(items: readonly RoutineItem[], ref: ItemRef): RoutineItem[] {
  return [...items, newItem(ref)];
}

export function removeItem(items: readonly RoutineItem[], index: number): { items: RoutineItem[]; removed?: RoutineItem } {
  if (index < 0 || index >= items.length) return { items: [...items] };
  const removed = items[index]!;
  let rest = items.filter((_, i) => i !== index);
  // A group of one is no group: drop the leftover link.
  if (removed.supersetGroup) rest = tidyGroups(rest);
  return { items: rest, removed };
}

/** Puts a removed item back at its old place (Undo). */
export function insertItem(items: readonly RoutineItem[], index: number, item: RoutineItem): RoutineItem[] {
  const at = clampInt(index, 0, items.length);
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** Moves one item from `from` to `to`. Out of range or same place = no change. Used by the up/down buttons and by drag. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x!);
  return out;
}

export type ItemEditError = 'sets_range' | 'rep_order' | 'rep_range' | 'rest_range' | 'note_too_long';

export interface ItemPatch {
  sets?: number;
  repMin?: number;
  repMax?: number;
  restSec?: number;
  note?: string;
  variation?: string | undefined;
}

/** Checks a sheet edit (D3): sets 1-10, whole reps 1-100 with min <= max, rest 15-600 in steps of 15, note up to 500. */
export function validateItemPatch(base: RoutineItem, patch: ItemPatch): Result<RoutineItem, ItemEditError> {
  const next: RoutineItem = { ...base, ...patch };
  if (!Number.isInteger(next.sets) || next.sets < MIN_SETS || next.sets > MAX_SETS) return { ok: false, error: 'sets_range' };
  if (!Number.isInteger(next.repMin) || !Number.isInteger(next.repMax) || next.repMin < 1 || next.repMax > 100) return { ok: false, error: 'rep_range' };
  if (next.repMin > next.repMax) return { ok: false, error: 'rep_order' };
  if (!Number.isInteger(next.restSec) || next.restSec < MIN_REST || next.restSec > MAX_REST || next.restSec % REST_STEP !== 0) return { ok: false, error: 'rest_range' };
  if ((next.note ?? '').length > MAX_NOTE) return { ok: false, error: 'note_too_long' };
  if (next.note === '') delete next.note;
  if (next.variation === undefined || next.variation === '') delete next.variation;
  return { ok: true, value: next };
}

// ---------- supersets ----------

/** Removes supersetGroup on items that are alone in their group. */
function tidyGroups(items: readonly RoutineItem[]): RoutineItem[] {
  const count = new Map<string, number>();
  for (const it of items) if (it.supersetGroup) count.set(it.supersetGroup, (count.get(it.supersetGroup) ?? 0) + 1);
  return items.map((it) => {
    if (it.supersetGroup && (count.get(it.supersetGroup) ?? 0) < 2) {
      const { supersetGroup: _g, ...rest } = it;
      return { ...rest, tag: 'normal' as const };
    }
    return it;
  });
}

/** Links item `a` with item `b` in one superset group (joins b's group if it has one). The two end up next to each other. */
export function linkSuperset(items: readonly RoutineItem[], a: number, b: number, makeGroup: () => string): RoutineItem[] {
  if (a === b || a < 0 || b < 0 || a >= items.length || b >= items.length) return [...items];
  const group = items[b]!.supersetGroup ?? items[a]!.supersetGroup ?? makeGroup();
  const oldA = items[a]!.supersetGroup;
  let out = items.map((it, i) => {
    if (i === a || i === b || (oldA && it.supersetGroup === oldA)) return { ...it, supersetGroup: group, tag: 'superset' as const };
    return it;
  });
  // Move a to sit right after b (or before when a is above b already adjacent) so the pair reads together.
  if (Math.abs(a - b) !== 1) out = moveItem(out, a, a < b ? b : b + 1);
  return tidyGroups(out);
}

export function unlinkSuperset(items: readonly RoutineItem[], index: number): RoutineItem[] {
  const it = items[index];
  if (!it || !it.supersetGroup) return [...items];
  const { supersetGroup: _g, ...rest } = it;
  return tidyGroups(items.map((x, i) => (i === index ? { ...rest, tag: 'normal' as const } : x)));
}

/** Group letters A, B, C... in order of first appearance, for the badge. Items outside a group are absent. */
export function supersetLabels(items: readonly RoutineItem[]): Map<number, string> {
  const letters = new Map<string, string>();
  const out = new Map<number, string>();
  items.forEach((it, i) => {
    if (!it.supersetGroup) return;
    if (!letters.has(it.supersetGroup)) letters.set(it.supersetGroup, String.fromCharCode(65 + (letters.size % 26)));
    out.set(i, letters.get(it.supersetGroup)!);
  });
  return out;
}

// ---------- days ----------

export function addDay(r: Routine, makeId: () => string): Routine | null {
  if (r.days.length >= MAX_DAYS) return null;
  const day: RoutineDay = { id: makeId(), name: `Day ${r.days.length + 1}`, targetMuscles: [], items: [] };
  return { ...r, days: [...r.days, day], daysPerWeek: r.days.length + 1 };
}

/** Removes a day. The last day cannot be removed. Returns the removed day and its place for Undo. */
export function removeDay(r: Routine, dayId: string): { routine: Routine; removed: RoutineDay; index: number } | null {
  const index = r.days.findIndex((d) => d.id === dayId);
  if (index < 0 || r.days.length <= 1) return null;
  const removed = r.days[index]!;
  const days = r.days.filter((_, i) => i !== index);
  return { routine: { ...r, days, daysPerWeek: days.length }, removed, index };
}

export function restoreDay(r: Routine, day: RoutineDay, index: number): Routine {
  const days = insertItem(r.days as never, index, day as never) as unknown as RoutineDay[];
  return { ...r, days, daysPerWeek: days.length };
}

export function moveDay(r: Routine, from: number, to: number): Routine {
  return { ...r, days: moveItem(r.days, from, to) };
}

export function updateDay(r: Routine, dayId: string, fn: (d: RoutineDay) => RoutineDay): Routine {
  return { ...r, days: r.days.map((d) => (d.id === dayId ? fn(d) : d)) };
}

/** A day name: trimmed, 1 to 40 characters (same limit as a routine name). */
export function validateDayName(raw: string): Result<string, 'name_empty' | 'name_too_long'> {
  return validateRoutineName(raw);
}

export function renameRoutine(r: Routine, raw: string, takenNames: Iterable<string> = []): Result<Routine, 'name_empty' | 'name_too_long' | 'name_taken'> {
  const v = validateRoutineName(raw);
  if (!v.ok) return v;
  const mine = r.name.trim().toLowerCase();
  for (const n of takenNames) {
    const k = n.trim().toLowerCase();
    if (k === v.value.toLowerCase() && k !== mine) return { ok: false, error: 'name_taken' };
  }
  return { ok: true, value: { ...r, name: v.value.slice(0, MAX_NAME) } };
}

// ---------- planned volume and the rest-day hint ----------

/** Muscle map rows of one exercise: [muscleId, role p|s|t, emphasis h|m|l, ...]. */
export type MuscleRow = readonly [string, string, string, ...unknown[]];
export type MuscleLookup = (ref: ItemRef) => readonly MuscleRow[];

const EMPH: Record<string, number> = { h: 1, m: 0.6, l: 0.3 };
/** Same weights as the engine (engines.md section 2): primary/secondary by emphasis, stabiliser x0.5. */
export function rowWeight(r: MuscleRow): number {
  const f = EMPH[r[2]] ?? 0;
  if (r[1] === 'p' || r[1] === 's') return f;
  if (r[1] === 't') return f * 0.5;
  return 0;
}

const round1 = (n: number): number => Math.round((n + Number.EPSILON) * 10) / 10;

/** Weighted sets per muscle for one day's items. Sets x muscle weight, 1 decimal. */
export function dayVolume(items: readonly RoutineItem[], lookup: MuscleLookup): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) for (const row of lookup(it.ref)) {
    const w = rowWeight(row);
    if (w > 0) out[row[0]] = (out[row[0]] ?? 0) + it.sets * w;
  }
  for (const k of Object.keys(out)) out[k] = round1(out[k]!);
  return out;
}

/** Planned weekly volume: every day of the routine counted once. Sorted biggest first. */
export function weeklyVolume(r: Routine, lookup: MuscleLookup): Array<{ muscle: string; sets: number }> {
  const total: Record<string, number> = {};
  for (const d of r.days) for (const [m, v] of Object.entries(dayVolume(d.items, lookup))) total[m] = (total[m] ?? 0) + v;
  return Object.entries(total)
    .map(([muscle, sets]) => ({ muscle, sets: round1(sets) }))
    .sort((a, b) => b.sets - a.sets || (a.muscle < b.muscle ? -1 : 1));
}

export type OverloadHint =
  | { kind: 'back_to_back'; muscle: string; dayIds: [string, string] }
  | { kind: 'weekly_cap'; muscle: string; sets: number };

/**
 * Rest-day hint (spec E1). One muscle planned on two consecutive days of the routine (order = the routine's day order,
 * including the last day followed by the first) with at least BACK_TO_BACK_SETS weighted sets on each, or planned weekly sets above
 * WEEKLY_SET_CAP. Hints only: nothing is blocked. Not using recovery data (Phase 49 adds it). One hint per muscle; back-to-back wins.
 * With 2 days the wrap-around pair is the same pair, so it is reported once.
 */
export function overloadHints(r: Routine, lookup: MuscleLookup): OverloadHint[] {
  const vols = r.days.map((d) => dayVolume(d.items, lookup));
  const hints: OverloadHint[] = [];
  const seen = new Set<string>();
  const n = r.days.length;
  if (n >= 2) {
    const pairs = n === 2 ? 1 : n;
    for (let i = 0; i < pairs; i += 1) {
      const j = (i + 1) % n;
      for (const m of Object.keys(vols[i]!)) {
        if (seen.has(m)) continue;
        if ((vols[i]![m] ?? 0) >= BACK_TO_BACK_SETS && (vols[j]![m] ?? 0) >= BACK_TO_BACK_SETS) {
          hints.push({ kind: 'back_to_back', muscle: m, dayIds: [r.days[i]!.id, r.days[j]!.id] });
          seen.add(m);
        }
      }
    }
  }
  for (const { muscle, sets } of weeklyVolume(r, lookup)) {
    if (!seen.has(muscle) && sets > WEEKLY_SET_CAP) {
      hints.push({ kind: 'weekly_cap', muscle, sets });
      seen.add(muscle);
    }
  }
  return hints;
}

/** Whole minutes for a day: each set is about 45 s of work plus its rest; rounded up to 5. Empty day = 0. */
export function estimateMinutes(items: readonly RoutineItem[]): number {
  if (items.length === 0) return 0;
  const sec = items.reduce((s, it) => s + it.sets * (SET_SEC + it.restSec), 0);
  return Math.ceil(sec / 60 / 5) * 5;
}

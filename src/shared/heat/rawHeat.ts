// Raw heat (Phase 43, contract/engines.md section 4): raw(m) = sum over working sets of the muscle's weight.
// Pure. The caller turns each logged exercise into a HeatEntry (weights come from `exerciseWeights`, so a variation,
// a setup or a custom exercise's own muscle picks are already applied).

import type { DayKey } from '../dates';
import { inPeriod, type Period } from './periods';

/** One exercise in one session, ready for the heat maths. */
export interface HeatEntry {
  day: DayKey;
  /** Working-set units (see `setUnits`); > 0. */
  sets: number;
  /** Weight per muscle id for this exercise as logged (detailed ids, or core ids for custom exercises). */
  weights: Readonly<Record<string, number>>;
}

/** The part of a logged set the heat maths reads. */
export interface HeatSetLike {
  tag?: string | undefined;
  reps?: number | null | undefined;
  seconds?: number | null | undefined;
}

/** Seconds that make one timed / cardio set unit: 1 set per 5 minutes. */
export const SECONDS_PER_SET_UNIT = 300;

export const tidy9 = (n: number): number => Math.round(n * 1e9) / 1e9;

/**
 * Set units of one exercise's sets. Warm-ups never count. A normal / drop / superset row with reps counts 1. A row with
 * time and no reps (cardio, plank) counts seconds / 300. A row with neither counts 0 (nothing was done).
 */
export function setUnits(sets: readonly HeatSetLike[]): number {
  let total = 0;
  for (const s of sets) {
    if (s.tag === 'warmup') continue;
    const reps = s.reps ?? 0;
    const secs = s.seconds ?? 0;
    if (reps > 0) total += 1;
    else if (secs > 0) total += secs / SECONDS_PER_SET_UNIT;
  }
  return tidy9(total);
}

/** A HeatEntry for one exercise of one session, or null when it has no working units or no weights. */
export function entryFromSets(day: DayKey, sets: readonly HeatSetLike[], weights: Readonly<Record<string, number>>): HeatEntry | null {
  const units = setUnits(sets);
  if (units <= 0 || Object.keys(weights).length === 0) return null;
  return { day, sets: units, weights };
}

/** Raw heat per muscle id for the entries inside the period (muscles with raw 0 are left out). Entries are not changed. */
export function rawHeat(entries: readonly HeatEntry[], period: Period): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (!inPeriod(period, e.day)) continue;
    for (const [id, w] of Object.entries(e.weights)) {
      if (w > 0) out[id] = (out[id] ?? 0) + e.sets * w;
    }
  }
  for (const id of Object.keys(out)) out[id] = tidy9(out[id]!);
  return out;
}

/** Working-set units inside the period (the number the tap sheet and the empty state read). */
export function totalSets(entries: readonly HeatEntry[], period: Period): number {
  let t = 0;
  for (const e of entries) if (inPeriod(period, e.day)) t += e.sets;
  return tidy9(t);
}

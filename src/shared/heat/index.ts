// Heat engine (Phase 43, contract/engines.md section 4). Pure: no DOM, no storage, no clock.

import { rollUpMax, type Taxonomy } from '../muscles';
import { bandOf, heat01, type Band } from './bands';
import type { Period } from './periods';
import { rawHeat, totalSets, type HeatEntry } from './rawHeat';
import { baseOf, periodRef, weeklyBase } from './reference';

export * from './bands';
export * from './periods';
export * from './rawHeat';
export * from './reference';
export { compareHeat } from './compare';
export type { HeatComparison, HeatDelta } from './compare';

export interface MuscleHeat {
  /** Sum of working-set units x muscle weight in the period. */
  raw: number;
  /** What counts as "full" for this muscle over this period. */
  ref: number;
  heat01: number;
  band: Band;
}

export interface HeatMap {
  period: Period;
  /** Working-set units in the period (0 = empty state). */
  sets: number;
  /** Per muscle id as logged (detailed ids; core ids appear when a custom exercise names one). Untrained muscles are absent. */
  muscles: Record<string, MuscleHeat>;
  /** Per parent region: the MAX heat01 of the muscle and its children (engines.md section 4). Untrained regions are absent. */
  rolled: Record<string, { heat01: number; band: Band }>;
}

/**
 * Heat of every trained muscle over a period. `entries` is the person's WHOLE history (the reference reads it),
 * not only the period. The same entries and period always give the same result.
 */
export function heatMap(entries: readonly HeatEntry[], period: Period, tax: Taxonomy): HeatMap {
  const base = weeklyBase(entries);
  const raw = rawHeat(entries, period);
  const muscles: Record<string, MuscleHeat> = {};
  const h: Record<string, number> = {};
  for (const [id, r] of Object.entries(raw)) {
    const ref = periodRef(period, baseOf(base, id));
    const v = heat01(r, ref);
    muscles[id] = { raw: r, ref, heat01: v, band: bandOf(v) };
    h[id] = v;
  }
  const rolled: HeatMap['rolled'] = {};
  for (const [id, v] of Object.entries(rollUpMax(h, tax))) rolled[id] = { heat01: v, band: bandOf(v) };
  return { period, sets: totalSets(entries, period), muscles, rolled };
}

// Estimated one-rep max (Phase 36): docs/reference/PROGRESSIVE_OVERLOAD_RULES.md "e1RM". Pure.

import { roundKg } from '../units';

/** Epley is only trusted up to this many reps. */
export const MAX_E1RM_REPS = 12;

/** Epley: weight * (1 + reps / 30), reps 1 -> weight. Reps outside 1..12, weight <= 0 or not a number -> null. 2 dp. */
export function e1rm(weightKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (weightKg == null || reps == null) return null;
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps < 1 || reps > MAX_E1RM_REPS) return null;
  if (reps === 1) return roundKg(weightKg);
  return roundKg(weightKg * (1 + reps / 30));
}

/** Shown to the nearest 0.5 kg (the stored value keeps 2 dp). */
export function e1rmDisplay(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 2 + 1e-9) / 2;
}

// Allometric thresholds, per-set benchmark e1RM, tier index (engines.md 26.3, 26.4). Pure.

import { anchorFor, type Ladder, type LoadMode, type Sex, type TierDef } from './ladders';

/** Allometric exponent (NSCA, configurable constant). */
export const ALLOMETRIC_EXPONENT = 0.67;
/** A set whose benchmark e1RM is above this many times bodyweight must be confirmed first. */
export const IMPLAUSIBLE_BW_MULT = 4.0;
/** Tolerance when comparing a value with a threshold, so float noise never costs a tier. */
const EPS = 1e-9;

/** thresholdKg = anchor x fraction x refBW x (BW / refBW)^exponent. Not rounded. */
export function thresholdKg(anchor: number, fraction: number, refBw: number, bw: number, exponent: number = ALLOMETRIC_EXPONENT): number {
  return anchor * fraction * refBw * Math.pow(bw / refBw, exponent);
}

/** Thresholds of every tier for one ladder at a bodyweight (index = tier position; Wood is 0). */
export function ladderThresholds(l: Ladder, sex: Sex, bw: number, tiers: readonly TierDef[], exponent: number = ALLOMETRIC_EXPONENT): number[] {
  const { anchor, refBw } = anchorFor(l, sex);
  return tiers.map((t) => thresholdKg(anchor, t.fraction, refBw, bw, exponent));
}

/**
 * Fractional tier position of a benchmark e1RM against the thresholds: floor = tier, fraction = progress to the next.
 * Olympian (the last tier) has no next, so the index stops at its position.
 */
export function tierIndex(value: number, thresholds: readonly number[]): number {
  let p = 0;
  for (let i = 0; i < thresholds.length; i++) if (value + EPS >= thresholds[i]!) p = i;
  if (p >= thresholds.length - 1) return thresholds.length - 1;
  const lo = thresholds[p]!;
  const hi = thresholds[p + 1]!;
  const frac = hi > lo ? Math.max(0, (value - lo) / (hi - lo)) : 0;
  return p + Math.min(frac, 1 - 1e-12);
}

export interface SetInput {
  weightKg: number | null | undefined;
  reps: number | null | undefined;
}

/** Total load for the ladder lift (engines.md 26.4). null = the set cannot be used. */
export function loadFor(mode: LoadMode, bwFraction: number, bw: number, weightKg: number | null | undefined): number | null {
  const w = weightKg == null || !Number.isFinite(weightKg) ? null : weightKg;
  if (mode === 'bodyweight') {
    const added = w != null && w > 0 ? w : 0;
    const load = bwFraction * bw + added;
    return load > 0 ? load : null;
  }
  if (w == null || w <= 0) return null;
  return mode === 'per_hand' ? 2 * w : w;
}

/** benchmarkE1RM = Epley(load, reps) / factor. Reps 1-12 only (13 and above, 0, or no reps -> null). Not rounded. */
export function benchmarkE1RM(load: number, reps: number | null | undefined, factor: number): number | null {
  if (reps == null || !Number.isInteger(reps) || reps < 1 || reps > 12 || !(factor > 0) || !(load > 0)) return null;
  // Epley, reps 1 = the load itself. Kept unrounded (engine/oneRm rounds to 2 dp) so a threshold is never missed by rounding.
  const raw = reps === 1 ? load : load * (1 + reps / 30);
  return raw / factor;
}

export function isImplausible(benchmark: number, bw: number): boolean {
  return benchmark > IMPLAUSIBLE_BW_MULT * bw + EPS;
}

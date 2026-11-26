// Calibration v2 (Phase 112). Fixes badge tiers that were far too easy.
//
// What was wrong (see docs/MUSCLE_BADGES.md, "Calibration v2"):
//  1. Olympian anchors of the estimated ladders were guesses, often a third to half of a real "elite" lift
//     (kneeling cable crunch Olympian = 1.3 x BW, public elite standards are about 1.6 to 2.2 x BW).
//  2. One set, once, in the last year could crown a muscle. No repeat, no training history needed.
//  3. Epley doubles the load at 30 reps, so a high-rep core set read as a huge 1RM.
//
// The fix keeps the contract files untouched. The anchors are replaced here (like core.ts appends rows), and the strict
// rules below are switched on by the app through `BadgeInput.strict`. The pure contract tests still run on the raw data.

import type { BadgeData } from './ladders';

/** Bump when anchors or rules change. The app throws away stored peaks of an older calibration so nobody keeps a tier the new rules would not give. */
export const BADGE_CALIBRATION = 2;

/** From this tier up (Gold), the benchmark must be reached in 2 different sessions; a single session is capped just below Gold. */
export const GATE_FROM_TIER = 4;
/** Ladders whose source is `estimate` (not published or derived from a published lift) can reach Diamond at most. */
export const ESTIMATE_TIER_CAP = 6;
/** A muscle's strength tier may lead its experience tier by at most this many tiers (Wood experience: Silver at most). */
export const EXPERIENCE_LEAD = 3;
/** Reps above this count for only a third each in the 1RM estimate (Epley is wild at 20 to 30 reps). */
export const TAPER_FROM_REPS = 12;
export const TAPER_VALUE = 1 / 3;

/** Reps as the e1RM estimate sees them: up to 12 in full, beyond that a third each. */
export function taperedReps(reps: number): number {
  return reps <= TAPER_FROM_REPS ? reps : TAPER_FROM_REPS + (reps - TAPER_FROM_REPS) * TAPER_VALUE;
}

/**
 * Olympian anchors, [male, female], as multiples of bodyweight at the reference weight (80 kg male, 60 kg female).
 * Rule used: Olympian is about the "Elite" row of public gym standards (Strength Level, FitnessVolt), the same place the
 * published squat, bench and deadlift anchors already sit. Where public data is noisy (cable stacks, wrist work) the
 * value is the cautious end. Published and derived ladders (squat, bench, deadlift and the ratios of them) and the
 * bodyweight lifts that already matched public elite loads (pull-up, chin-up, dip, push-up, back extension) are not touched.
 */
export const ANCHORS: Readonly<Record<string, readonly [number, number]>> = {
  // Core: cable_crunch was 1.3 / 0.9, the largest error.
  cable_crunch: [1.9, 1.6],
  cable_woodchop: [1.15, 0.8],
  side_bend: [1.0, 0.7],
  crunch: [1.3, 1.1],
  sit_up: [1.3, 1.1],
  leg_raise: [1.25, 1.05],
  ab_wheel: [1.3, 1.1],
  plank: [1.7, 1.4],
  side_plank: [1.5, 1.25],
  // Legs and hips
  leg_press: [5.4, 4.3],
  hack_squat: [3.0, 2.4],
  leg_extension: [2.3, 1.9],
  leg_curl: [1.6, 1.25],
  hip_abduction_machine: [2.6, 2.2],
  hip_adduction_machine: [2.4, 2.0],
  cable_pull_through: [1.75, 1.4],
  standing_calf_raise: [3.2, 2.3],
  seated_calf_raise: [2.8, 2.1],
  // Back and traps
  lat_pulldown: [1.8, 1.3],
  seated_cable_row: [1.7, 1.25],
  barbell_shrug: [3.3, 2.4],
  // Shoulders
  face_pull: [1.2, 0.9],
  machine_shoulder_press: [1.4, 1.0],
  lateral_raise: [0.85, 0.6],
  rear_delt_fly: [1.15, 0.8],
  // Chest
  machine_chest_press: [1.9, 1.35],
  pec_fly: [1.4, 1.0],
  // Arms
  barbell_curl: [1.15, 0.75],
  machine_biceps_curl: [1.2, 0.8],
  triceps_pushdown: [1.45, 1.0],
  lying_triceps_extension: [1.05, 0.7],
  wrist_curl: [1.5, 1.1],
  reverse_curl: [0.9, 0.6],
  reverse_wrist_curl: [0.6, 0.4],
};

/** The badge data with calibration v2 anchors. Idempotent. Ladders not in the table keep their anchors. */
export function recalibrate(data: BadgeData): BadgeData {
  return {
    ...data,
    ladders: data.ladders.map((l) => {
      const a = ANCHORS[l.ladderId];
      return a ? { ...l, anchorM: a[0], anchorF: a[1] } : l;
    }),
  };
}

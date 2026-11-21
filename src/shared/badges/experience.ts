// Experience meter and rust (engines.md 26.6). Pure. The meter never changes a strength tier.

import { daysBetween, type DayKey } from '../dates';
import type { TierDef } from './ladders';
import { medianTier } from './tiers';
import { tierIndex } from './thresholds';

export interface ExpSet {
  reps: number | null | undefined;
  tag?: 'normal' | 'warmup' | 'drop' | 'superset';
}

export interface ExpExercise {
  /** Muscle weights of this exercise as logged (exerciseWeights, with variation and setup applied). */
  weights: Readonly<Record<string, number>>;
  sets: readonly ExpSet[];
}

export interface ExpSession {
  day: DayKey;
  exercises: readonly ExpExercise[];
}

/** Weighted sets a single session can add to one muscle. */
export const EXP_SESSION_CAP = 12;
/** Sets with fewer reps than this do not count toward experience. */
export const EXP_MIN_REPS = 3;
/** Untrained for more than this many days shows "rusty". */
export const RUST_DAYS = 42;
/** A muscle counts as trained by an exercise when its weight is at least this. */
export const TRAINED_WEIGHT = 0.3;

export interface Experience {
  /** Lifetime weighted sets (capped per session). */
  mp: number;
  tier: number;
  progress: number;
  /** Weighted sets still needed for the next tier (0 at Olympian). */
  toNext: number;
}

/** Lifetime weighted sets per muscle: sets that are not warm-ups with reps >= 3, each adding the muscle weight, 12 per muscle per session at most. */
export function experienceMp(sessions: readonly ExpSession[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const s of sessions) {
    const inSession: Record<string, number> = {};
    for (const ex of s.exercises) {
      let n = 0;
      for (const set of ex.sets) {
        if (set.tag === 'warmup') continue;
        if (set.reps == null || !(set.reps >= EXP_MIN_REPS)) continue;
        n++;
      }
      if (n === 0) continue;
      for (const [m, w] of Object.entries(ex.weights)) if (w > 0) inSession[m] = (inSession[m] ?? 0) + n * w;
    }
    for (const [m, v] of Object.entries(inSession)) total[m] = (total[m] ?? 0) + Math.min(v, EXP_SESSION_CAP);
  }
  return total;
}

export function experienceOf(mp: number, tiers: readonly TierDef[]): Experience {
  const th = tiers.map((t) => t.experienceSets);
  const idx = tierIndex(mp, th);
  const maxTier = tiers.length - 1;
  const tier = Math.min(maxTier, Math.floor(idx + 1e-12));
  const toNext = tier >= maxTier ? 0 : Math.max(0, th[tier + 1]! - mp);
  return { mp, tier, progress: tier >= maxTier ? 1 : idx - tier, toNext };
}

/** Median experience tier of the given muscles that have any experience (same rule as the strength group tier). */
export function medianExperienceTier(ids: readonly string[], exp: Readonly<Record<string, Experience>>): number | null {
  return medianTier(ids.filter((m) => (exp[m]?.mp ?? 0) > 0).map((m) => exp[m]!.tier));
}

export interface Rust {
  lastDay: DayKey | null;
  daysSince: number | null;
  rusty: boolean;
}

/** Last day each muscle was trained by a non-warm-up set of an exercise that gives it weight >= 0.3. */
export function lastTrained(sessions: readonly ExpSession[]): Record<string, DayKey> {
  const last: Record<string, DayKey> = {};
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (!ex.sets.some((set) => set.tag !== 'warmup')) continue;
      for (const [m, w] of Object.entries(ex.weights)) {
        if (w >= TRAINED_WEIGHT && (last[m] == null || s.day > last[m]!)) last[m] = s.day;
      }
    }
  }
  return last;
}

export function rustOf(lastDay: DayKey | undefined, today: DayKey): Rust {
  if (!lastDay) return { lastDay: null, daysSince: null, rusty: false };
  const d = daysBetween(lastDay, today);
  return { lastDay, daysSince: d, rusty: d > RUST_DAYS };
}

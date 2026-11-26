// Core and high-rep ladders (Phase 94). The published ladders only rank abs and obliques through cable lifts, and a strength
// set only counts up to 12 reps, so a 60 kg x 16 kneeling cable crunch earned Experience but no map colour. This module adds
// bodyweight core ladders, lets the core ladders count sets up to 30 reps, and lets a plank count by time. Pure; the contract
// files are not touched, the rows are appended to the parsed badge data (all of them are our own estimates).

import type { Ladder, LadderMapRow } from './ladders';
import type { BadgeData } from './index';

/** Reps a strength set may have, by ladder. Every other ladder keeps the contract's 12. */
export const DEFAULT_MAX_REPS = 12;
export const CORE_MAX_REPS = 30;

/** Seconds that count as one rep on a time-based ladder (a plank held 60 s is 20 reps). */
export const SECONDS_PER_REP: Readonly<Record<string, number>> = { plank: 3, side_plank: 3 };

const L = (ladderId: string, name: string, bwFraction: number, anchorM: number, anchorF: number, muscles: Record<string, number>): Ladder => ({
  ladderId, name, kind: bwFraction > 0 ? 'bodyweight' : 'cable', bwFraction, anchorM, anchorF, refBwM: 80, refBwF: 60, muscles, source: 'estimate',
});

export const CORE_LADDERS: readonly Ladder[] = [
  L('crunch', 'Crunch (bodyweight plus added load)', 0.3, 1.0, 0.85, { abs: 1.0, obliques: 0.3 }),
  L('sit_up', 'Sit-up (bodyweight plus added load)', 0.4, 1.0, 0.85, { abs: 1.0, hip_flexors: 0.5 }),
  L('leg_raise', 'Leg raise (bodyweight plus added load)', 0.35, 1.0, 0.85, { abs: 1.0, hip_flexors: 0.7 }),
  L('ab_wheel', 'Ab wheel rollout', 0.5, 1.1, 0.9, { abs: 1.0, obliques: 0.3 }),
  L('plank', 'Plank (by time)', 0.5, 1.4, 1.2, { abs: 1.0, obliques: 0.5, lower_back: 0.3 }),
  L('side_plank', 'Side plank (by time)', 0.4, 1.3, 1.1, { obliques: 1.0, abs: 0.4 }),
];

const M = (slug: string, ladderId: string, factor: number, loadMode: LadderMapRow['loadMode'] = 'bodyweight'): LadderMapRow => ({ slug, ladderId, factor, loadMode });

export const CORE_MAP: readonly LadderMapRow[] = [
  M('crunch', 'crunch', 1), M('stability-ball-crunch', 'crunch', 1), M('suspension-crunch', 'crunch', 1), M('elbow-to-knee-crunch', 'crunch', 0.9),
  M('bicycle-crunch', 'crunch', 0.8), M('standing-bicycle-crunch', 'crunch', 0.7), M('side-crunch', 'crunch', 0.7), M('stability-ball-side-crunch', 'crunch', 0.7),
  M('sit-up', 'sit_up', 1), M('v-up', 'sit_up', 1.1), M('stability-ball-jackknife', 'sit_up', 1),
  M('lying-leg-raise', 'leg_raise', 0.8), M('suspension-knee-tuck', 'leg_raise', 0.7), M('standing-knee-raise', 'leg_raise', 0.5),
  M('ab-wheel-rollout', 'ab_wheel', 1), M('ab-wheel-wall-rollout', 'ab_wheel', 0.7), M('ab-wheel-pike-roll', 'ab_wheel', 0.9), M('ab-wheel-side-rollout', 'ab_wheel', 0.9),
  M('barbell-rollout', 'ab_wheel', 1), M('stability-ball-rollout', 'ab_wheel', 0.7),
  M('plank', 'plank', 1), M('rkc-plank', 'plank', 1.2), M('stability-ball-plank', 'plank', 0.9), M('suspension-plank', 'plank', 1), M('balance-trainer-plank', 'plank', 0.9),
  M('shoulder-tap-plank', 'plank', 0.8),
  M('side-plank', 'side_plank', 1), M('copenhagen-plank', 'side_plank', 1.2),
];

/** Ladders whose sets may have up to 30 reps: the new core ladders plus the three published ab and oblique ladders. */
const HIGH_REP: ReadonlySet<string> = new Set([...CORE_LADDERS.map((l) => l.ladderId), 'cable_crunch', 'cable_woodchop', 'side_bend']);

export const maxRepsOf = (ladderId: string): number => (HIGH_REP.has(ladderId) ? CORE_MAX_REPS : DEFAULT_MAX_REPS);

/** Reps for a strength set: the logged reps, or on a time-based ladder the seconds held turned into reps. */
export function repsFor(ladderId: string, reps: number | null | undefined, seconds: number | null | undefined): number | null {
  if (reps != null && reps > 0) return reps;
  const per = SECONDS_PER_REP[ladderId];
  if (per && seconds != null && seconds >= per) return Math.min(CORE_MAX_REPS, Math.floor(seconds / per));
  return null;
}

/** The parsed badge data with the core ladders and their exercises appended (ids already present are left alone). */
export function withCore(data: BadgeData): BadgeData {
  const have = new Set(data.ladders.map((l) => l.ladderId));
  const mapped = new Set(data.map.map((m) => m.slug));
  return {
    ...data,
    ladders: [...data.ladders, ...CORE_LADDERS.filter((l) => !have.has(l.ladderId))],
    map: [...data.map, ...CORE_MAP.filter((m) => !mapped.has(m.slug))],
  };
}

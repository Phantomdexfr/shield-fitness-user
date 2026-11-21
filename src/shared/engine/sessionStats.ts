// Working sets and per-exercise session numbers (Phase 36). Pure. Warm-up and drop sets never count (OL "Definitions").

import { roundKg } from '../units';
import { e1rm } from './oneRm';

export type SetTag = 'normal' | 'warmup' | 'drop' | 'superset';

/** Structurally compatible with `SetLog` from `session.ts`. A missing tag means `normal`. */
export interface EngineSet {
  weightKg: number | null;
  reps: number | null;
  rpe?: number;
  tag?: SetTag;
}

/** One exercise in one session, in the order the sets were done. */
export interface ExerciseResult {
  sets: readonly EngineSet[];
}

export interface SessionStats {
  workingSets: number;
  volume: number;
  topWeight: number;
  totalReps: number;
  bestE1rm: number | null;
}

/** Weight of a set; bodyweight (null) counts as 0. */
export const setWeight = (s: EngineSet): number => (s.weightKg != null && Number.isFinite(s.weightKg) && s.weightKg > 0 ? s.weightKg : 0);

/** A done working set: tag normal/superset and at least 1 rep. */
export function isWorking(s: EngineSet): boolean {
  const tag = s.tag ?? 'normal';
  if (tag !== 'normal' && tag !== 'superset') return false;
  return s.reps != null && Number.isFinite(s.reps) && s.reps >= 1;
}

export const workingSets = (sets: readonly EngineSet[]): EngineSet[] => sets.filter(isWorking);

/** Sum of weight x reps over working sets (bodyweight sets add 0). 2 dp. */
export function sessionVolume(sets: readonly EngineSet[]): number {
  let v = 0;
  for (const s of workingSets(sets)) v += setWeight(s) * (s.reps as number);
  return roundKg(v);
}

export function topWeight(sets: readonly EngineSet[]): number {
  let w = 0;
  for (const s of workingSets(sets)) w = Math.max(w, setWeight(s));
  return roundKg(w);
}

export function totalReps(sets: readonly EngineSet[]): number {
  let n = 0;
  for (const s of workingSets(sets)) n += s.reps as number;
  return n;
}

/** Best e1RM among working sets, or null when none has one. */
export function bestE1rm(sets: readonly EngineSet[]): number | null {
  let best: number | null = null;
  for (const s of workingSets(sets)) {
    const e = e1rm(s.weightKg, s.reps);
    if (e != null && (best == null || e > best)) best = e;
  }
  return best;
}

export function sessionStats(sets: readonly EngineSet[]): SessionStats {
  return {
    workingSets: workingSets(sets).length,
    volume: sessionVolume(sets),
    topWeight: topWeight(sets),
    totalReps: totalReps(sets),
    bestE1rm: bestE1rm(sets),
  };
}

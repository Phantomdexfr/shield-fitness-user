// Overload suggestion (Phase 36): docs/reference/PROGRESSIVE_OVERLOAD_RULES.md. Pure, no clock.
// `overload(history, options)` -> next weight, a target for each working set, and a note code the UI turns into words.
// History is oldest first. Suggestions only; nothing here writes anything.

import { roundKg } from '../units';
import { noProgressStreak, workingSessions } from './plateau';
import { topWeight, type EngineSet, type ExerciseResult } from './sessionStats';

export type OverloadMode = 'linear' | 'double' | 'off';
export type Intensity = 'light' | 'moderate' | 'hard' | 'beast';

export const DEFAULT_STEP_KG = 2.5;
/** Double progression: a set above this RPE does not count as "reached the top of the range". */
export const QUALIFY_MAX_RPE = 9;
export const DELOAD_FACTOR = 0.9;

export interface IntensityRule {
  rpeLow: number;
  rpeHigh: number;
  /** Qualifying sessions in a row (at the same weight) before the weight goes up. */
  sessionsToAdd: number;
  /** Every set beat the target by >= 2 reps at this RPE or lower -> add 2 steps. null = never. */
  twoStepRpe: number | null;
  /** Sessions in a row without progress before a deload is suggested. */
  deloadAfter: number;
}

export const INTENSITY: Record<Intensity, IntensityRule> = {
  light: { rpeLow: 6, rpeHigh: 7, sessionsToAdd: 2, twoStepRpe: null, deloadAfter: 3 },
  moderate: { rpeLow: 7, rpeHigh: 8, sessionsToAdd: 1, twoStepRpe: null, deloadAfter: 3 },
  hard: { rpeLow: 8, rpeHigh: 9, sessionsToAdd: 1, twoStepRpe: 7, deloadAfter: 3 },
  beast: { rpeLow: 9, rpeHigh: 10, sessionsToAdd: 1, twoStepRpe: 8, deloadAfter: 4 },
};

export type OverloadNote =
  | 'off' | 'out_of_order' | 'no_history'
  | 'add_weight' | 'add_weight_2'
  | 'hold_reps' | 'hold_wait' | 'hold_form' | 'hold'
  | 'deload' | 'bodyweight';

export interface OverloadOptions {
  mode: OverloadMode;
  intensity?: Intensity;
  repMin: number;
  repMax: number;
  /** machines.weight_step_kg, or the user's own step for custom exercises. Blank / invalid = 2.5. */
  stepKg?: number | null;
  /** Machine is out of order: no suggestion. */
  outOfOrder?: boolean;
}

export interface OverloadResult {
  /** null when there is no suggestion. 0 for bodyweight. */
  weightKg: number | null;
  /** Target reps for each working set of the last session (empty when there is no suggestion). */
  reps: number[];
  note: OverloadNote;
}

const none = (note: OverloadNote): OverloadResult => ({ weightKg: null, reps: [], note });
const EPS = 1e-9;

export const stepOf = (stepKg: number | null | undefined): number => (stepKg != null && Number.isFinite(stepKg) && stepKg > 0 ? stepKg : DEFAULT_STEP_KG);

/** Nearest multiple of the step (used by deloads). */
export function snapToStep(kg: number, step: number): number {
  return roundKg(Math.round(kg / step + EPS) * step);
}

/** The weight after adding `steps` steps to `last`, rounded down to a multiple of the step and clamped (OL "Safety clamps"). */
export function addSteps(last: number, steps: number, step: number, beastLowRpe = false): { weightKg: number; steps: number } {
  const capSteps = beastLowRpe ? 4 : 2;
  const pctSteps = Math.floor(Math.max(0.1 * last, step) / step + EPS);
  const n = Math.max(1, Math.min(steps, capSteps, pctSteps));
  const weightKg = roundKg(Math.floor((last + n * step) / step + EPS) * step);
  return { weightKg: Math.max(weightKg, last), steps: n };
}

export function overload(history: readonly ExerciseResult[], o: OverloadOptions): OverloadResult {
  if (o.mode === 'off') return none('off');
  if (o.outOfOrder) return none('out_of_order');
  const sessions = workingSessions(history);
  if (sessions.length === 0) return none('no_history');

  const rule = INTENSITY[o.intensity ?? 'moderate'];
  const step = stepOf(o.stepKg);
  const repMin = Math.max(1, Math.floor(o.repMin));
  const repMax = Math.max(repMin, Math.floor(o.repMax));
  const double = o.mode === 'double';

  const last = sessions[sessions.length - 1] as EngineSet[];
  const prev = sessions.length > 1 ? (sessions[sessions.length - 2] as EngineSet[]) : null;
  const lastW = topWeight(last);
  const fill = (v: number): number[] => last.map(() => v);
  const reps = (s: EngineSet) => s.reps as number;

  // bodyweight: no weight to add, so only reps go up (assumption A-P36.4)
  if (lastW <= 0) return { weightKg: 0, reps: last.map((s) => (reps(s) < repMax ? reps(s) + 1 : reps(s))), note: 'bodyweight' };

  const qualifies = (sets: readonly EngineSet[]): boolean =>
    sets.every((s) => reps(s) >= repMax) && (!double || sets.every((s) => s.rpe == null || s.rpe <= QUALIFY_MAX_RPE));
  const lastQualifies = qualifies(last);

  // deload: enough sessions in a row without progress (double) or missing the target (linear)
  let stuck = 0;
  if (double) {
    if (!lastQualifies) stuck = noProgressStreak(history);
  } else {
    for (let i = sessions.length - 1; i >= 0 && !qualifies(sessions[i] as EngineSet[]); i--) stuck++;
  }
  if (stuck >= rule.deloadAfter) {
    const w = Math.min(snapToStep(lastW * DELOAD_FACTOR, step), lastW);
    return { weightKg: Math.max(0, w), reps: fill(repMin), note: 'deload' };
  }

  if (!lastQualifies) {
    if (!double) return { weightKg: lastW, reps: fill(repMax), note: 'hold' };
    // below the range twice in a row -> hold and check form/rest
    const lowest = (sets: readonly EngineSet[]) => Math.min(...sets.map(reps));
    if (prev && lowest(last) < repMin && lowest(prev) < repMin) return { weightKg: lastW, reps: fill(repMin), note: 'hold_form' };
    return { weightKg: lastW, reps: last.map((s) => (reps(s) < repMax ? reps(s) + 1 : repMax)), note: 'hold_reps' };
  }

  // qualifying session: Light needs the one before it to qualify too, at the same weight
  if (rule.sessionsToAdd >= 2 && !(prev && qualifies(prev) && Math.abs(topWeight(prev) - lastW) < 0.01)) {
    return { weightKg: lastW, reps: fill(repMax), note: 'hold_wait' };
  }
  const t = rule.twoStepRpe;
  const beat = t != null && last.every((s) => reps(s) >= repMax + 2 && s.rpe != null && s.rpe <= t);
  const add = addSteps(lastW, beat ? 2 : 1, step, beat && o.intensity === 'beast' && last.every((s) => s.rpe != null && s.rpe <= 7));
  return { weightKg: add.weightKg, reps: fill(double ? repMin : repMax), note: add.steps >= 2 ? 'add_weight_2' : 'add_weight' };
}

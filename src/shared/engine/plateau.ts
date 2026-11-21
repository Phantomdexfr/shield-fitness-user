// Plateau and no-progress streaks (Phase 36): OL "Plateau and deload". Pure. History is oldest first.

import { bestE1rm, topWeight, totalReps, workingSets, type ExerciseResult, type EngineSet } from './sessionStats';

export const PLATEAU_WINDOW = 4;
/** The last 4 sessions must beat the earlier best by at least this share to count as progress. */
export const PLATEAU_GAIN = 0.01;

/** Working sets of each session that has any, oldest first. */
export function workingSessions(history: readonly ExerciseResult[]): EngineSet[][] {
  return history.map((r) => workingSets(r.sets)).filter((s) => s.length > 0);
}

/** Plateau hint: over the last 4 sessions the best e1RM did not beat the earlier best by >= 1%. Needs >= 5 sessions and an e1RM on both sides. */
export function isPlateau(history: readonly ExerciseResult[]): boolean {
  const sessions = workingSessions(history);
  if (sessions.length <= PLATEAU_WINDOW) return false;
  const best = (list: EngineSet[][]): number | null => list.reduce<number | null>((m, s) => {
    const e = bestE1rm(s);
    return e != null && (m == null || e > m) ? e : m;
  }, null);
  const earlier = best(sessions.slice(0, -PLATEAU_WINDOW));
  const recent = best(sessions.slice(-PLATEAU_WINDOW));
  if (earlier == null || recent == null) return false;
  return recent * 100 < earlier * (100 + PLATEAU_GAIN * 100) - 1e-9;
}

/** A session progressed when its top weight is higher, or the top weight is the same and it has more total reps. */
export function progressed(prev: readonly EngineSet[], cur: readonly EngineSet[]): boolean {
  const pw = topWeight(prev);
  const cw = topWeight(cur);
  if (cw > pw + 0.005) return true;
  if (Math.abs(cw - pw) <= 0.005) return totalReps(cur) > totalReps(prev);
  return false;
}

/** How many of the latest sessions in a row did not progress against the one before (the first session has no predecessor). */
export function noProgressStreak(history: readonly ExerciseResult[]): number {
  const s = workingSessions(history);
  let n = 0;
  for (let i = s.length - 1; i >= 1; i--) {
    if (progressed(s[i - 1] as EngineSet[], s[i] as EngineSet[])) break;
    n++;
  }
  return n;
}

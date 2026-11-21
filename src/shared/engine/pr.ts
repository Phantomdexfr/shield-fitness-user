// PR detection for one exercise (Phase 36): docs/reference/PROGRESSIVE_OVERLOAD_RULES.md "PR kinds". Pure.
// Working sets only. Each kind is judged on its own; a tie is not a PR; the first-ever result is a baseline (no PRs).
// Phase 37 builds the three-metric board (contract/engines.md section 17) on top of this.

import { roundKg } from '../units';
import { bestE1rm, sessionVolume, setWeight, workingSets, type EngineSet, type ExerciseResult } from './sessionStats';

export type PRKind = 'weight' | 'reps' | 'e1rm' | 'volume';

export interface PRHit {
  kind: PRKind;
  value: number;
  previous: number;
  /** For `reps`: the weight (kg) the reps were done at. */
  weightKg?: number;
}

const SAME_WEIGHT = 0.01;

/** Most reps at each distinct weight (within 0.01 kg) over working sets, heaviest first. */
function repsByWeight(sets: readonly EngineSet[]): Array<{ weightKg: number; reps: number }> {
  const rows: Array<{ weightKg: number; reps: number }> = [];
  for (const s of workingSets(sets)) {
    const w = setWeight(s);
    const row = rows.find((r) => Math.abs(r.weightKg - w) <= SAME_WEIGHT);
    if (row) row.reps = Math.max(row.reps, s.reps as number);
    else rows.push({ weightKg: w, reps: s.reps as number });
  }
  return rows.sort((a, b) => b.weightKg - a.weightKg);
}

/** PRs set by `current` against everything in `history` (oldest first or any order). Order of the result: weight, reps, e1rm, volume. */
export function detectPR(history: readonly ExerciseResult[], current: ExerciseResult): PRHit[] {
  const past = history.filter((r) => workingSets(r.sets).length > 0);
  if (past.length === 0 || workingSets(current.sets).length === 0) return [];
  const hits: PRHit[] = [];

  // weight: heaviest load for >= 1 rep (bodyweight sets have no weight PR)
  const curRows = repsByWeight(current.sets);
  const pastRows = past.flatMap((r) => repsByWeight(r.sets));
  const curTop = curRows[0]?.weightKg ?? 0;
  const pastTop = pastRows.reduce((m, r) => Math.max(m, r.weightKg), 0);
  if (curTop > 0 && roundKg(curTop) > roundKg(pastTop)) hits.push({ kind: 'weight', value: roundKg(curTop), previous: roundKg(pastTop) });

  // reps: more reps at a weight you have done before (same weight within 0.01 kg); first hit, heaviest weight first
  for (const row of curRows) {
    const before = pastRows.filter((p) => Math.abs(p.weightKg - row.weightKg) <= SAME_WEIGHT);
    if (before.length === 0) continue;
    const prev = before.reduce((m, p) => Math.max(m, p.reps), 0);
    if (row.reps > prev) {
      hits.push({ kind: 'reps', value: row.reps, previous: prev, weightKg: roundKg(row.weightKg) });
      break;
    }
  }

  // e1RM
  const curE = bestE1rm(current.sets);
  if (curE != null) {
    const pastE = past.reduce((m, r) => Math.max(m, bestE1rm(r.sets) ?? 0), 0);
    if (curE > pastE) hits.push({ kind: 'e1rm', value: curE, previous: pastE });
  }

  // volume: whole-session volume for this exercise
  const curV = sessionVolume(current.sets);
  if (curV > 0) {
    const pastV = past.reduce((m, r) => Math.max(m, sessionVolume(r.sets)), 0);
    if (curV > pastV) hits.push({ kind: 'volume', value: curV, previous: pastV });
  }
  return hits;
}


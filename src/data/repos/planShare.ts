// Plan-share repo (Phase 42): reads the routine and custom exercises to share, and saves a received plan. Pure rules live in
// `src/shared/planShare/*`; the network lives in `src/data/relay/*`. Never overwrites a routine.

import contractVersion from '../../../contract/VERSION?raw';
import { customExercisesRepo } from '../local';
import { getExerciseIndex } from '../../dataset/loader';
import { buildEnvelope, importPlan, type ImportPlan, type PlanEnvelope } from '../../shared/planShare/envelope';
import { getRoutine, listRoutines, putRoutine, setActiveRoutine } from './routines';
import { listCustom } from './customExercises';

/** `1` for `1.0.0-draft`: a plan from a higher major is refused as "too new". */
export const CONTRACT_MAJOR = Math.max(1, Number.parseInt(contractVersion.trim().split('.')[0] ?? '1', 10) || 1);

export async function envelopeFor(routineId: string, from: string, note: string): Promise<{ envelope: PlanEnvelope; dropped: number } | null> {
  const [routine, customs] = await Promise.all([getRoutine(routineId), listCustom()]);
  if (!routine) return null;
  return buildEnvelope({ routine, customs, createdAt: new Date().toISOString(), contractMajor: CONTRACT_MAJOR, from, note });
}

/** What the preview screen shows. `hiddenSlugs` is empty until the gym link (connected mode) supplies the gym's hidden list. */
export async function prepareImport(env: PlanEnvelope, makeId: () => string, hiddenSlugs: ReadonlySet<string> = new Set()): Promise<ImportPlan> {
  const [index, customs, routines] = await Promise.all([getExerciseIndex(), listCustom(), listRoutines()]);
  return importPlan(env, {
    makeId,
    librarySlugs: new Set(index.rows.filter((r) => !r.custom).map((r) => r.slug)),
    hiddenSlugs,
    takenCustomSlugs: customs.map((c) => c.slug),
    takenRoutineNames: routines.map((r) => r.name),
  });
}

/** Saves the custom exercises first, then the routine (inactive), then makes it active when asked. Returns the new routine id. */
export async function savePlan(plan: ImportPlan, makeActive: boolean): Promise<string> {
  for (const c of plan.customs) await customExercisesRepo.put({ ...(c as unknown as Record<string, unknown>), client_id: c.id } as never);
  await putRoutine(plan.routine);
  if (makeActive) await setActiveRoutine(plan.routine.id);
  return plan.routine.id;
}

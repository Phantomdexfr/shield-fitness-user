// Routine repo (Phase 30): list, create, duplicate, set active, delete (soft) and undo. The UI never touches the store directly.
// Pure rules live in `src/shared/routine.ts`. A routine's `id` is its row `client_id`.

import { newClientId, routinesRepo } from '../local';
import { cloneRoutine, createRoutine, sortRoutines, type Routine, type RoutineInput, type RoutineInputError } from '../../shared/routine';

type Row = Routine & { client_id: string };

const asRoutine = (row: unknown): Routine => {
  const { client_id: _c, updated_at: _u, deleted_at: _d, ...rest } = row as Record<string, unknown>;
  return rest as unknown as Routine;
};

/** Live routines, the active one first (archived ones included; the page filters them). */
export async function listRoutines(): Promise<Routine[]> {
  const rows = (await routinesRepo.list()) as unknown[];
  return sortRoutines(rows.map(asRoutine));
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  const row = await routinesRepo.get(id);
  return row ? asRoutine(row) : undefined;
}

/** Writes one routine row (id = client_id). */
export async function putRoutine(r: Routine): Promise<void> {
  await routinesRepo.put({ ...(r as unknown as Record<string, unknown>), client_id: r.id } as never);
}

export type CreateResult = { ok: true; routine: Routine } | { ok: false; error: RoutineInputError };

/** Validate the setup form, build the routine and save it. The first routine ever becomes the active one. */
export async function createAndSave(input: RoutineInput): Promise<CreateResult> {
  const existing = await listRoutines();
  const made = createRoutine(input, newClientId, existing.map((r) => r.name));
  if (!made.ok) return made;
  const routine = { ...made.value, active: existing.filter((r) => !r.archived).length === 0 };
  await putRoutine(routine);
  return { ok: true, routine };
}

export async function duplicateRoutine(id: string): Promise<Routine | undefined> {
  const [src, all] = await Promise.all([getRoutine(id), listRoutines()]);
  if (!src) return undefined;
  const copy = cloneRoutine(src, newClientId, all.map((r) => r.name));
  await putRoutine(copy);
  return copy;
}

/** Only one routine is active: the others are switched off. */
export async function setActiveRoutine(id: string): Promise<void> {
  const all = await listRoutines();
  for (const r of all) {
    const on = r.id === id;
    if (r.active !== on) await putRoutine({ ...r, active: on });
  }
}

/** Soft delete. Returns the routine so the page can offer Undo (`restoreRoutine`). Past sessions are never touched. */
export async function deleteRoutine(id: string): Promise<Routine | undefined> {
  const r = await getRoutine(id);
  if (!r) return undefined;
  await routinesRepo.remove(id);
  return r;
}

export async function restoreRoutine(r: Routine): Promise<void> {
  await putRoutine(r);
}

export type { Row as RoutineRow };

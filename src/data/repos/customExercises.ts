// Custom exercise repo (Phase 27): create, edit, delete the person's own exercises. They live in the `customExercises`
// store and merge into search / lists at query time (src/data/repos/exercises.ts); nothing here touches the dataset files.
// Pure rules (validation, duplicate-name guard, muscle list) live in `src/shared/customExercise.ts`.

import { customExercisesRepo, newClientId } from '../local';
import { getExerciseIndex, getMachines, getMuscles } from '../../dataset/loader';
import { customSlug } from '../../shared/slug';
import { validateCustom, type CustomDraft, type CustomErrors, type CustomExerciseValue } from '../../shared/customExercise';
import { loadMovementData } from './movement';

/** A stored custom exercise (the row, with its client id). */
export type StoredCustom = CustomExerciseValue & { client_id: string; id?: string };

export async function listCustom(): Promise<StoredCustom[]> {
  return (await customExercisesRepo.list()) as unknown as StoredCustom[];
}

export async function getCustom(slug: string): Promise<StoredCustom | undefined> {
  return (await listCustom()).find((c) => c.slug === slug);
}

export type SaveResult = { ok: true; slug: string } | { ok: false; errors: CustomErrors };

/** Validate and save. `editingSlug` = change that exercise (its slug never changes, so history and routines keep working). */
export async function saveCustom(draft: CustomDraft, editingSlug?: string): Promise<SaveResult> {
  const [index, machines, muscles, mine, movement] = await Promise.all([getExerciseIndex(), getMachines(), getMuscles(), listCustom(), loadMovementData()]);
  const others = mine.filter((c) => c.slug !== editingSlug);
  const existing = editingSlug ? mine.find((c) => c.slug === editingSlug) : undefined;
  if (editingSlug && !existing) return { ok: false, errors: { name: 'not_found' } };
  const muscleIds = new Set(muscles.muscles.map((m) => m.id));
  const result = validateCustom(draft, {
    takenNames: [...index.rows.filter((r) => !r.custom).map((r) => r.name), ...others.map((c) => c.name)],
    takenSlugs: [...index.rows.map((r) => r.slug), ...others.map((c) => c.slug)],
    hasMachine: (s) => machines.bySlug.has(s),
    hasMuscle: (id) => muscleIds.has(id),
    ...(movement ? { hasPattern: (id: string) => id in movement.patterns } : {}),
    ...(editingSlug ? { slug: editingSlug } : {}),
    makeSlug: customSlug,
  });
  if (!result.ok) return result;
  const id = existing?.client_id ?? newClientId();
  await customExercisesRepo.put({ ...(result.value as unknown as Record<string, unknown>), client_id: id, id } as never);
  return { ok: true, slug: result.value.slug };
}

/** Soft delete (the row stays as a tombstone for backup and sync). */
export async function deleteCustom(slug: string): Promise<boolean> {
  const c = await getCustom(slug);
  if (!c) return false;
  await customExercisesRepo.remove(c.client_id);
  return true;
}

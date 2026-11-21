// Validators (Phase 12). Pure, plain TypeScript (zod arrives with Phase 13). Each returns the cleaned value or an error CODE;
// screens turn a code into text with t(`validation.${code}`). Limits are generous defaults (A69), editable here.

export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const fail = <E extends string>(error: E): Result<never, E> => ({ ok: false, error });

export const LIMITS = {
  maxWeightKg: 1000,
  maxReps: 1000,
  maxSeconds: 24 * 60 * 60,
  maxNameLength: 60,
} as const;

const clean = (s: string): string => s.trim().replace(/\s+/g, ' ');

/** A display name (exercise, routine, day): trimmed, inner spaces collapsed, 1 to 60 characters. */
export function validateName(raw: string): Result<string, 'name_empty' | 'name_too_long'> {
  const s = clean(raw);
  if (s === '') return fail('name_empty');
  if (s.length > LIMITS.maxNameLength) return fail('name_too_long');
  return ok(s);
}

/** Bar or machine weight in kg: 0 to 1000, rounded to 2 decimals. */
export function validateWeightKg(n: number): Result<number, 'weight_invalid' | 'weight_range'> {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fail('weight_invalid');
  if (n < 0 || n > LIMITS.maxWeightKg) return fail('weight_range');
  return ok(Math.round(n * 100 + 1e-9) / 100);
}

/** Reps: a whole number from 0 to 1000. */
export function validateReps(n: number): Result<number, 'reps_invalid' | 'reps_range'> {
  if (typeof n !== 'number' || !Number.isInteger(n)) return fail('reps_invalid');
  if (n < 0 || n > LIMITS.maxReps) return fail('reps_range');
  return ok(n);
}

/** Seconds for a timed set: a whole number from 0 to 86,400. */
export function validateSeconds(n: number): Result<number, 'seconds_invalid' | 'seconds_range'> {
  if (typeof n !== 'number' || !Number.isInteger(n)) return fail('seconds_invalid');
  if (n < 0 || n > LIMITS.maxSeconds) return fail('seconds_range');
  return ok(n);
}

/** RPE 1 to 10 in half steps. */
export function validateRpe(n: number): Result<number, 'rpe_invalid'> {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 10 || Math.round(n * 2) !== n * 2) return fail('rpe_invalid');
  return ok(n);
}

/** A rep range: both whole numbers >= 1 and min <= max. */
export function validateRepRange(min: number, max: number): Result<{ repMin: number; repMax: number }, 'reps_invalid' | 'range_order'> {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1 || max > LIMITS.maxReps) return fail('reps_invalid');
  if (min > max) return fail('range_order');
  return ok({ repMin: min, repMax: max });
}

/** A muscle id that must exist in the taxonomy (pass `has` from `buildTaxonomy`). */
export function validateMuscleId(id: string, has: (id: string) => boolean): Result<string, 'muscle_unknown'> {
  return has(id) ? ok(id) : fail('muscle_unknown');
}

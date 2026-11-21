// Small pure helpers for the movement blocks (Phase 25).
import { parseParams, type MovementPattern, type Params } from '../../shared/movement';

/** Muscle chips: primary muscles, strongest setup-aware weight first, at most 4 (P24.1). */
export function chipMuscles(weights: Readonly<Record<string, number>>, primaryIds: readonly string[], added: readonly string[] = [], max = 4): string[] {
  const ids = [...new Set([...primaryIds, ...added])];
  const rank = new Map(ids.map((id, i) => [id, i]));
  return ids
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    .slice(0, max);
}

/** Bench angle shown in the creator stepper: the stored param, else the pattern's default, else 0. */
export function benchOf(pattern: MovementPattern | undefined, params: Params): number {
  const own = params.bench_deg;
  const def = pattern ? parseParams(pattern.defaultParam).bench_deg : undefined;
  const n = Number(own ?? def ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Movement map repo (Phase 25). Pages ask here; they never touch the dataset loader directly. Read-only.
// A dataset exercise's pattern comes from the compiled map; a custom exercise stores its own `patternId` + `param`
// (A-P24.4), so `patternFor` also accepts those.

import { getMovement } from '../../dataset/loader';
import { parseMovementData, type MovementData, type MovementPattern } from '../../shared/movement';

let cache: Promise<MovementData | null> | undefined;

/** The movement file, narrowed. `null` = missing or malformed (the plain muscle map is shown). Loaded once. */
export function loadMovementData(): Promise<MovementData | null> {
  cache ??= getMovement().then(parseMovementData, () => null);
  return cache;
}

export interface MovementFor {
  pattern: MovementPattern;
  param: string;
}

/** Contract lookup `movementFor(slug)`: null = unmapped. */
export function movementFor(data: MovementData | null, slug: string): MovementFor | null {
  const hit = data?.map[slug];
  const pattern = hit ? data?.patterns[hit.patternId] : undefined;
  return hit && pattern ? { pattern, param: hit.param } : null;
}

export async function loadMovementFor(slug: string): Promise<MovementFor | null> {
  return movementFor(await loadMovementData(), slug);
}

/** Patterns sorted by name, for the creator's chooser. */
export const patternList = (data: MovementData | null): MovementPattern[] => (data ? Object.values(data.patterns).sort((a, b) => a.name.localeCompare(b.name)) : []);

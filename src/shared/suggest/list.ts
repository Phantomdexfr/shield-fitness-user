// Tap-a-muscle list (Phase 15): contract/engines.md 8 and API_CONTRACTS.md P14.5. Pure.

import { normRole } from '../weights';
import { jitter, surpriseIndex } from './jitter';
import { compareRanked, rankCandidates, type Ranked, type ReasonSignals } from './rank';
import { meetsMark, TRACK_BITS, type Candidate, type ScoreContext } from './score';

export const SUGGESTED_COUNT = 6;

export interface ListFilters {
  machine?: string;
  category?: string;
  kind?: string;
  difficulty?: number;
  track?: string;
  unilateral?: boolean;
  beginnerFriendly?: boolean;
  /** Drop exercises that meet an avoid or sore mark. */
  injurySafe?: boolean;
}

export interface MuscleList {
  suggested: Ranked[];
  built: Ranked[];
  more: Ranked[];
  /** Only with `showAll`: exercises on a machine in maintenance, last, with a badge. */
  unavailable: Ranked[];
}

/** Exercises with a non-mobility map row for the muscle (a core id includes its detailed children). */
function forMuscle(c: Candidate, target: string, ctx: ScoreContext): boolean {
  const want = new Set(ctx.tax.expand(target));
  return c.rows.some(([id, role]) => want.has(id) && normRole(role) !== 'm' && normRole(role) !== null);
}

function passesFilters(c: Candidate, f: ListFilters | undefined, ctx: ScoreContext): boolean {
  if (!f) return true;
  if (f.machine !== undefined && c.machine !== f.machine) return false;
  if (f.category !== undefined && c.category !== f.category) return false;
  if (f.kind !== undefined && c.kind !== f.kind) return false;
  if (f.difficulty !== undefined && c.difficulty !== f.difficulty) return false;
  if (f.track !== undefined) {
    // A custom exercise (tracks 0) never matches a track filter.
    if (((TRACK_BITS[f.track] ?? 0) & c.tracks) === 0) return false;
  }
  if (f.unilateral !== undefined && !!c.unilateral !== f.unilateral) return false;
  if (f.beginnerFriendly && !c.beginner) return false;
  if (f.injurySafe && (meetsMark(c.rows, ctx.avoid, ctx.tax) || meetsMark(c.rows, ctx.sore, ctx.tax))) return false;
  return true;
}

/**
 * Three sections for one muscle: Suggested (top 6 by score), Built for you (in `builtSlugs`, by score), More (the rest,
 * by day-seeded jitter descending, then slug). An exercise is in the first section it qualifies for. Slot is `none`.
 */
export function muscleExerciseList(
  candidates: readonly Candidate[],
  target: string,
  ctx: ScoreContext,
  opts: { builtSlugs?: ReadonlySet<string>; filters?: ListFilters; signals?: ReasonSignals } = {},
): MuscleList {
  const pool = candidates.filter((c) => forMuscle(c, target, ctx) && passesFilters(c, opts.filters, ctx));
  const ranked = rankCandidates(pool, target, 'none', ctx, opts.signals);
  const available = ranked.filter((r) => !r.unavailable);
  const suggested = available.slice(0, SUGGESTED_COUNT);
  const rest = available.slice(SUGGESTED_COUNT);
  const built = rest.filter((r) => opts.builtSlugs?.has(r.slug));
  const more = rest
    .filter((r) => !opts.builtSlugs?.has(r.slug))
    .sort((a, b) => jitter(ctx.dayKey, b.slug) - jitter(ctx.dayKey, a.slug) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  built.sort(compareRanked);
  return { suggested, built, more, unavailable: ranked.filter((r) => r.unavailable) };
}

/** "Surprise me": one pick from Suggested + Built + More (not unavailable), sorted by slug; `n` = taps so far today. */
export function surpriseMe(list: MuscleList, dayKey: string, n: number): Ranked | undefined {
  const pool = [...list.suggested, ...list.built, ...list.more].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const i = surpriseIndex(dayKey, n, pool.length);
  return i < 0 ? undefined : pool[i];
}

// Suggestion score (Phase 15): contract/engines.md 6-7 and API_CONTRACTS.md P14.2. Pure; no dataset or store imports.

import type { Taxonomy } from '../muscles';
import { EMPHASIS_FACTOR, normEmphasis, normRole, type MapRowTuple } from '../weights';
import { jitter } from './jitter';

export const W_PRIMARY = 3;
export const W_SECONDARY = 1;
export const COMPOUND_MAIN = 2;
export const ISOLATION_ISO = 1;
export const TRACK_FIT = 1;
export const BEGINNER_FIT = 1;
export const HARD_FOR_BEGINNER = -1;
export const FAVOURITE = 2;
export const RECENT = -1.5;
export const SKIPPED_OFTEN = -1.5;
export const SORE = -2;
/** Skipped in at least this many of the last 5 appearances. */
export const SKIPPED_OFTEN_MIN = 3;

/** Index `tracks` bitmask bits (docs/DATASET_RUNTIME.md). */
export const TRACK_BITS: Readonly<Record<string, number>> = {
  beginner: 1, intermediate: 2, muscle_gain: 4, athlete: 8, fat_loss: 16, strength: 32, cardio: 64,
};

export type Slot = 'main' | 'isolation' | 'none';

/** What the engine needs to know about one exercise (built from the index row + map rows, or a custom exercise). */
export interface Candidate {
  slug: string;
  name: string;
  category: string;
  kind: string;
  difficulty: number;
  unilateral: boolean | number;
  beginner: boolean | number;
  /** Track bitmask (0 for a custom exercise). */
  tracks: number;
  /** Machine slug or '' when none. */
  machine: string;
  rows: readonly MapRowTuple[];
  custom?: boolean;
}

export interface ScoreContext {
  tax: Taxonomy;
  /** IST day key for the jitter. */
  dayKey: string;
  level?: string;
  track?: string;
  favourites?: ReadonlySet<string>;
  /** Slugs done in the user's previous session. */
  previousSlugs?: ReadonlySet<string>;
  /** Per slug: how often it was skipped in the last 5 sessions it appeared in. */
  skipStats?: Readonly<Record<string, { appeared: number; skipped: number }>>;
  hidden?: ReadonlySet<string>;
  /** Muscle ids marked `avoid` (hide) or `sore` (demote). A core id covers its detailed children. */
  avoid?: ReadonlySet<string>;
  sore?: ReadonlySet<string>;
  /** Machine slug -> status. `maintenance` and `out_of_order` exclude. */
  machineStatus?: Readonly<Record<string, string>>;
  /** When true, unavailable machines are kept (the list puts them last). */
  showAll?: boolean;
}

export type ExcludeReason = 'hidden' | 'avoid' | 'unavailable';

export interface ScoreParts {
  primary: number;
  secondary: number;
  compound: number;
  trackFit: number;
  beginner: number;
  favourite: number;
  recency: number;
  skipPenalty: number;
  sorePenalty: number;
  jitter: number;
}

export interface ScoreResult {
  score: number;
  parts: ScoreParts;
  /** Set when the exercise must not be offered (`unavailable` only when showAll is false). */
  excluded?: ExcludeReason;
  /** `showAll` kept an exercise on an unavailable machine; the list shows it last with a badge. */
  unavailable?: boolean;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function expandAll(ids: Iterable<string>, tax: Taxonomy): Set<string> {
  const out = new Set<string>();
  for (const id of ids) for (const m of tax.expand(id)) out.add(m);
  return out;
}

/** Engines.md 6: a mark meets an exercise when a marked muscle is a primary row at medium/high or a secondary row at high. */
export function meetsMark(rows: readonly MapRowTuple[], marks: ReadonlySet<string> | undefined, tax: Taxonomy): boolean {
  if (!marks || marks.size === 0) return false;
  const marked = expandAll(marks, tax);
  for (const [id, role, emphasis] of rows) {
    if (!marked.has(id)) continue;
    const r = normRole(role);
    const e = normEmphasis(emphasis);
    if ((r === 'p' && (e === 'h' || e === 'm')) || (r === 's' && e === 'h')) return true;
  }
  return false;
}

/** Highest emphasis factor among the exercise's rows for the target (expanded) with the given role. */
export function emphasisFor(rows: readonly MapRowTuple[], target: string, role: 'p' | 's', tax: Taxonomy): number {
  const want = new Set(tax.expand(target));
  let best = 0;
  for (const [id, r, e] of rows) {
    if (!want.has(id) || normRole(r) !== role) continue;
    const f = EMPHASIS_FACTOR[normEmphasis(e) ?? 'l'] ?? 0;
    if (normEmphasis(e) && f > best) best = f;
  }
  return best;
}

export function isUnavailable(c: Candidate, ctx: ScoreContext): boolean {
  const s = c.machine ? ctx.machineStatus?.[c.machine] : undefined;
  return s === 'maintenance' || s === 'out_of_order';
}

/** The slot a skipped item fills when its alternatives are scored (P14.2). */
export function slotForCategory(category: string): Slot {
  return category === 'compound' ? 'main' : category === 'isolation' ? 'isolation' : 'none';
}

/** Score of one exercise for one target muscle in one slot. `excluded` is set instead of a usable score when it must not be offered. */
export function scoreExercise(c: Candidate, target: string, slot: Slot, ctx: ScoreContext): ScoreResult {
  const parts: ScoreParts = {
    primary: W_PRIMARY * emphasisFor(c.rows, target, 'p', ctx.tax),
    secondary: W_SECONDARY * emphasisFor(c.rows, target, 's', ctx.tax),
    compound: slot === 'main' && c.category === 'compound' ? COMPOUND_MAIN : slot === 'isolation' && c.category === 'isolation' ? ISOLATION_ISO : 0,
    trackFit: ctx.track && ((TRACK_BITS[ctx.track] ?? 0) & c.tracks) !== 0 ? TRACK_FIT : 0,
    beginner: 0,
    favourite: ctx.favourites?.has(c.slug) ? FAVOURITE : 0,
    recency: ctx.previousSlugs?.has(c.slug) ? RECENT : 0,
    skipPenalty: 0,
    sorePenalty: meetsMark(c.rows, ctx.sore, ctx.tax) ? SORE : 0,
    jitter: jitter(ctx.dayKey, c.slug),
  };
  if (ctx.level === 'beginner') {
    if (c.beginner) parts.beginner += BEGINNER_FIT;
    if (c.difficulty === 3) parts.beginner += HARD_FOR_BEGINNER;
  }
  const st = ctx.skipStats?.[c.slug];
  if (st && st.skipped >= SKIPPED_OFTEN_MIN) parts.skipPenalty = SKIPPED_OFTEN;

  const score = round4(Object.values(parts).reduce((a, b) => a + b, 0));
  const result: ScoreResult = { score, parts };
  if (ctx.hidden?.has(c.slug)) result.excluded = 'hidden';
  else if (meetsMark(c.rows, ctx.avoid, ctx.tax)) result.excluded = 'avoid';
  else if (isUnavailable(c, ctx)) {
    if (ctx.showAll) result.unavailable = true;
    else result.excluded = 'unavailable';
  }
  return result;
}

// Skip -> alternatives (Phase 35): contract/engines.md section 9, API_CONTRACTS.md P14.6 (reasons) and P14.7 (pools).
// Pure: no DOM, no dataset, no store, no clock. The caller passes the candidate pool, the skipped exercise's variation
// texts and substitution slugs. Nothing is ever applied here: the screen shows the list and the person taps one.

import { normRole } from './weights';
import { compareRanked, scoreExercise, slotForCategory, type Candidate, type ScoreContext } from './suggest';
import type { SkipReason } from './session';

/** A candidate plus what the pools need: index `primary` ids and the detail `pattern` string. */
export interface AltCandidate extends Candidate {
  /** Index `primary` ids (core muscles), first one is the "same primary muscle" key. Custom exercises: from their primary rows. */
  primary: readonly string[];
  /** Detail `pattern` string ('' when unknown, custom). */
  pattern: string;
}

export const MAX_ALTERNATIVES = 5;
/** Score added per difficulty step below the skipped item's (reasons `pain` and `too_hard`). */
export const EASIER_STEP = 0.5;
/** Score added to single-joint exercises when the reason is `no_time`. */
export const NO_TIME_ISOLATION = 1;

export type AltChip = 'same_exercise' | 'same_muscle' | 'substitute' | 'easier';
export type AltPool = 1 | 2 | 3 | 4;

export interface AlternativeBase {
  slug: string;
  name: string;
  score: number;
  pool: AltPool;
  chip: AltChip;
  /** Machine slug ('' when none), for the thumbnail. */
  machine: string;
}
export interface VariationAlt extends AlternativeBase {
  kind: 'variation';
  /** The other variation text of the same exercise. */
  variation: string;
}
export interface ExerciseAlt extends AlternativeBase {
  kind: 'exercise';
  /** True for the person's own exercise (the screen builds a `custom` ref for it). */
  custom?: true;
}
export type Alternative = VariationAlt | ExerciseAlt;

export interface AlternativesInput {
  /** The skipped exercise as a candidate (with `primary` and `pattern`). */
  skipped: AltCandidate;
  /** The skipped session item's current variation text, left out of pool 1. */
  variation?: string;
  reason: SkipReason;
  /** Pain only: muscle ids of the area the person picked. Empty or missing = the exercise's primary muscles. */
  area?: readonly string[];
  /** Library and custom exercises that could be offered (the skipped one may be in it; it is never offered). */
  pool: readonly AltCandidate[];
  /** Variation texts of the skipped exercise in data order (empty for custom). */
  variations: readonly string[];
  /** Slugs listed for the skipped exercise in the compiled substitutions file. */
  substitutes: readonly string[];
  /** Marks, hidden, machine status, day key, level, track, favourites ... (the P14.2 context). */
  ctx: ScoreContext;
  /** Machines the person marked busy for this session: their exercises are not offered at all. */
  busyMachines?: ReadonlySet<string>;
}

export interface AlternativesResult {
  alternatives: Alternative[];
  /** The muscles the pain filter used (the area, or the exercise's primary muscles); empty for other reasons. */
  area: string[];
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Muscle ids that are primary rows of an exercise, in row order. */
export function primaryIds(rows: Candidate['rows']): string[] {
  const out: string[] = [];
  for (const [id, role] of rows) if (normRole(role) === 'p' && !out.includes(id)) out.push(id);
  return out;
}

/** The score adjustment of P14.6 for a candidate (not the skipped item's own score). */
export function reasonAdjustment(reason: SkipReason, skipped: Pick<Candidate, 'difficulty'>, c: Pick<Candidate, 'difficulty' | 'category'>): number {
  if (reason === 'pain' || reason === 'too_hard') return EASIER_STEP * Math.max(0, skipped.difficulty - c.difficulty);
  if (reason === 'no_time') return c.category === 'isolation' ? NO_TIME_ISOLATION : 0;
  return 0;
}

/** Up to 5 alternatives for a skipped exercise, in pool order (P14.7). Never throws on missing data: it just offers less. */
export function alternativesFor(input: AlternativesInput): AlternativesResult {
  const { skipped, reason, pool, ctx } = input;
  const busy = input.busyMachines ?? new Set<string>();
  const key = skipped.primary[0] ?? primaryIds(skipped.rows)[0];
  const target = key ?? '';
  const slot = slotForCategory(skipped.category);

  // Pain: the avoid test also covers the picked area (session only; saving a mark is the caller's choice).
  const area = reason === 'pain' ? (input.area && input.area.length > 0 ? [...input.area] : primaryIds(skipped.rows)) : [];
  const scoreCtx: ScoreContext = reason === 'pain' ? { ...ctx, avoid: new Set([...(ctx.avoid ?? []), ...area]) } : ctx;

  const sameMachine = (c: Pick<Candidate, 'machine'>): boolean => reason === 'busy' && skipped.machine !== '' && c.machine === skipped.machine;
  const onBusy = (c: Pick<Candidate, 'machine'>): boolean => c.machine !== '' && busy.has(c.machine);

  const out: Alternative[] = [];
  const offered = new Set<string>([skipped.slug]);
  const full = (): boolean => out.length >= MAX_ALTERNATIVES;

  const chipFor = (pool: AltPool, c: Candidate): AltChip => {
    if (pool === 1) return 'same_exercise';
    if ((reason === 'pain' || reason === 'too_hard') && c.difficulty < skipped.difficulty) return 'easier';
    return pool === 3 ? 'substitute' : 'same_muscle';
  };

  // ---- pool 1: other variations of the same exercise (keeps data order on ties) ----
  const own = scoreExercise(skipped, target, slot, scoreCtx);
  const ownUsable = !own.excluded && !onBusy(skipped) && !sameMachine(skipped);
  if (ownUsable && !full()) {
    const seen = new Set<string>();
    if (input.variation) seen.add(input.variation);
    const adj = reasonAdjustment(reason, skipped, skipped);
    for (const text of input.variations) {
      if (full()) break;
      if (seen.has(text)) continue;
      seen.add(text);
      out.push({ kind: 'variation', slug: skipped.slug, name: skipped.name, variation: text, score: round4(own.score + adj), pool: 1, chip: chipFor(1, skipped), machine: skipped.machine });
    }
  }

  // ---- pools 2-4: other exercises, each filtered, scored, sorted, appended ----
  const addPool = (poolNo: AltPool, list: readonly AltCandidate[]): void => {
    if (full()) return;
    const ranked: Array<{ c: AltCandidate; score: number }> = [];
    for (const c of list) {
      if (offered.has(c.slug)) continue;
      if (sameMachine(c) || onBusy(c)) continue;
      if (reason === 'too_hard' && c.difficulty > skipped.difficulty) continue;
      const r = scoreExercise(c, target, slot, scoreCtx);
      if (r.excluded) continue;
      ranked.push({ c, score: round4(r.score + reasonAdjustment(reason, skipped, c)) });
    }
    ranked.sort((a, b) => compareRanked({ score: a.score, name: a.c.name, slug: a.c.slug }, { score: b.score, name: b.c.name, slug: b.c.slug }));
    for (const { c, score } of ranked) {
      if (full()) break;
      if (offered.has(c.slug)) continue;
      offered.add(c.slug);
      out.push({ kind: 'exercise', slug: c.slug, name: c.name, score, pool: poolNo, chip: chipFor(poolNo, c), machine: c.machine, ...(c.custom ? { custom: true as const } : {}) });
    }
  };

  const samePrimary = (c: AltCandidate): boolean => key !== undefined && c.primary[0] === key;
  // 2: same primary muscle + same movement pattern + same category (an unknown pattern never matches)
  addPool(2, pool.filter((c) => samePrimary(c) && skipped.pattern !== '' && c.pattern === skipped.pattern && c.category === skipped.category));
  // 3: substitution groups, in the order the file lists them
  const bySlug = new Map(pool.map((c) => [c.slug, c] as const));
  addPool(3, input.substitutes.map((s) => bySlug.get(s)).filter((c): c is AltCandidate => c !== undefined));
  // 4: same primary muscle, any pattern
  addPool(4, pool.filter(samePrimary));

  return { alternatives: out, area };
}

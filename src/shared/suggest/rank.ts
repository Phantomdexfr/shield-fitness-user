// Ranking and reason codes (Phase 15): API_CONTRACTS.md P14.2 (order) and contract/engines.md 25 (reasons). Pure.

import { scoreExercise, type Candidate, type ScoreContext, type ScoreParts, type Slot } from './score';

export type ReasonCode =
  | 'recovered' | 'neglected' | 'in_routine' | 'built_by_you' | 'same_variation' | 'favourite' | 'progress_ready' | 'balances_week';

/** Priority order: the first two that apply are returned. */
export const REASON_PRIORITY: readonly ReasonCode[] = [
  'progress_ready', 'recovered', 'neglected', 'in_routine', 'built_by_you', 'favourite', 'same_variation', 'balances_week',
];
export const MAX_REASONS = 2;
/** `recovered`: the target muscle has rested at least this many days. */
export const RECOVERED_DAYS = 3;
/** `neglected`: fewer working sets than this on the target this week. */
export const NEGLECTED_SETS = 3;
/** `balances_week`: the target has under this share of the average sets of the muscles trained this week (needs 3 trained muscles). */
export const BALANCE_SHARE = 0.5;

export interface Reason {
  code: ReasonCode;
  /** The muscle the sentence is about (recovered, neglected, balances_week). */
  muscle?: string;
  /** Whole days rested (recovered). */
  days?: number;
}

/** What the caller knows about the person's week. Everything is optional; a missing signal just gives no reason. */
export interface ReasonSignals {
  /** Whole days since the muscle was last trained (recovery clock). */
  daysRested?: Readonly<Record<string, number>>;
  /** Working sets per muscle this week. */
  weekSets?: Readonly<Record<string, number>>;
  /** Exercises in the active routine (or this week's days). */
  inRoutine?: ReadonlySet<string>;
  /** Exercises the person built or created (custom exercises, own routines, gym programs they copied). */
  builtByYou?: ReadonlySet<string>;
  /** Exercises that are another setup of one done last time. */
  sameVariation?: ReadonlySet<string>;
  /** Exercises where the last session met the top of the rep range. */
  progressReady?: ReadonlySet<string>;
}

export interface Ranked {
  slug: string;
  name: string;
  score: number;
  parts: ScoreParts;
  reasons: Reason[];
  /** Kept by `showAll` on an unavailable machine; shown last with a badge. */
  unavailable?: boolean;
}

/** Order of equal scores: higher score, then shorter name, then slug. A total order, so input order never matters. */
export function compareRanked(a: { score: number; name: string; slug: string }, b: { score: number; name: string; slug: string }): number {
  return b.score - a.score || a.name.length - b.name.length || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** Up to two reason codes for one suggestion (engines.md 25). */
export function reasonsFor(c: Candidate, target: string, favourite: boolean, sig: ReasonSignals | undefined): Reason[] {
  if (!sig) return [];
  const rested = sig.daysRested?.[target];
  const sets = sig.weekSets?.[target];
  const trained = sig.weekSets ? Object.values(sig.weekSets).filter((n) => n > 0) : [];
  const avg = trained.length >= 3 ? trained.reduce((a, b) => a + b, 0) / trained.length : undefined;
  const applies: Record<ReasonCode, Reason | null> = {
    progress_ready: sig.progressReady?.has(c.slug) ? { code: 'progress_ready' } : null,
    recovered: rested !== undefined && rested >= RECOVERED_DAYS ? { code: 'recovered', muscle: target, days: Math.floor(rested) } : null,
    neglected: sets !== undefined && sets < NEGLECTED_SETS ? { code: 'neglected', muscle: target } : null,
    in_routine: sig.inRoutine?.has(c.slug) ? { code: 'in_routine' } : null,
    built_by_you: c.custom || sig.builtByYou?.has(c.slug) ? { code: 'built_by_you' } : null,
    favourite: favourite ? { code: 'favourite' } : null,
    same_variation: sig.sameVariation?.has(c.slug) ? { code: 'same_variation' } : null,
    balances_week: avg !== undefined && sets !== undefined && sets < avg * BALANCE_SHARE ? { code: 'balances_week', muscle: target } : null,
  };
  const out: Reason[] = [];
  for (const code of REASON_PRIORITY) {
    const r = applies[code];
    if (r) out.push(r);
    if (out.length === MAX_REASONS) break;
  }
  return out;
}

/** Score, drop what must not be offered, and sort. Unavailable (showAll) rows come last. Does not change the input array. */
export function rankCandidates(
  candidates: readonly Candidate[],
  target: string,
  slot: Slot,
  ctx: ScoreContext,
  signals?: ReasonSignals,
): Ranked[] {
  const out: Ranked[] = [];
  for (const c of candidates) {
    const r = scoreExercise(c, target, slot, ctx);
    if (r.excluded) continue;
    const row: Ranked = { slug: c.slug, name: c.name, score: r.score, parts: r.parts, reasons: reasonsFor(c, target, r.parts.favourite > 0, signals) };
    if (r.unavailable) row.unavailable = true;
    out.push(row);
  }
  return out.sort((a, b) => Number(!!a.unavailable) - Number(!!b.unavailable) || compareRanked(a, b));
}

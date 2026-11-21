// Muscle tier, group tier, overall rank (engines.md 26.5). Pure; works on already-collected best e1RMs.

import type { Ladder, LadderIndex, Sex, TierDef } from './ladders';
import { ladderThresholds, tierIndex } from './thresholds';

/** Best benchmark e1RM of one ladder, with the set that made it. */
export interface BestSet {
  e1rm: number;
  day: string;
  slug: string;
  weightKg: number | null;
  reps: number;
  sessionId: string;
}

export interface LadderResult {
  ladderId: string;
  name: string;
  rankWeight: number;
  /** Best benchmark e1RM in the window (null = not logged). */
  best: BestSet | null;
  /** Raw tier position on this ladder (fractional), null when not logged. */
  index: number | null;
  /** Index counted for the muscle: raw, minus one tier when the rank weight is below 0.6 (floor Wood). */
  effective: number | null;
}

export interface MuscleBadge {
  id: string;
  ranked: boolean;
  /** Tier position 0 (Wood) to 8 (Olympian); null = Unranked. */
  tier: number | null;
  /** 0 to 1 toward the next tier; 1 at Olympian. null when Unranked. */
  progress: number | null;
  /** Highest tier ever reached (stored peak or all-time lifts), never below the current tier; null = never ranked. */
  peak: number | null;
  /** Ladder that gave the tier. */
  best: LadderResult | null;
  /** Every ladder that ranks this muscle (rank weight >= 0.3), strongest rank weight first. */
  candidates: LadderResult[];
  /** What the next tier asks of the best ladder (benchmark e1RM, kg and x bodyweight at the current bodyweight). */
  next: { tier: number; thresholdKg: number; ratio: number; ladderId: string } | null;
  /** Unranked only: up to 3 ladder ids that would rank this muscle. */
  suggest: string[];
}

export interface GroupBadge {
  id: string;
  ranked: boolean;
  tier: number | null;
  peak: number | null;
  rankedMuscles: string[];
  /** Ladders with a muscle of this group at rank weight >= 0.6. */
  rankingLadders: number;
  /** Of those, the ones logged in the window. */
  rankedLadders: number;
}

export interface OverallBadge {
  tier: number | null;
  /** Fewer than 5 groups ranked. */
  provisional: boolean;
  rankedGroups: number;
}

export const MIN_GROUPS_FOR_OVERALL = 5;

/** Median of whole tiers; with an even count the two middle ones are averaged and rounded down. */
export function medianTier(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : Math.floor((s[mid - 1]! + s[mid]!) / 2);
}

/** Effective index for a muscle from a ladder's raw index: rank weight 0.6 and up counts in full, 0.3 to 0.6 one tier lower, never below Wood. */
export function effectiveIndex(raw: number, rankWeight: number): number {
  return rankWeight >= 0.6 ? raw : Math.max(0, raw - 1);
}

export interface TierContext {
  idx: LadderIndex;
  tiers: readonly TierDef[];
  sex: Sex;
  bw: number;
  /** Window bests per ladder id. */
  window: ReadonlyMap<string, BestSet>;
  /** All-time bests per ladder id (for the peak). */
  allTime: ReadonlyMap<string, BestSet>;
  peaks: Readonly<Record<string, number>>;
}

function thresholdsFor(cache: Map<string, number[]>, ctx: TierContext, l: Ladder): number[] {
  let t = cache.get(l.ladderId);
  if (!t) {
    t = ladderThresholds(l, ctx.sex, ctx.bw, ctx.tiers);
    cache.set(l.ladderId, t);
  }
  return t;
}

export function muscleBadge(muscleId: string, ctx: TierContext, cache: Map<string, number[]> = new Map()): MuscleBadge {
  const list = [...ctx.idx.laddersFor(muscleId)].sort((a, b) => b.rankWeight - a.rankWeight);
  const candidates: LadderResult[] = [];
  let top: LadderResult | null = null;
  let peakIdx = -1;
  for (const { ladder, rankWeight } of list) {
    const th = thresholdsFor(cache, ctx, ladder);
    const best = ctx.window.get(ladder.ladderId) ?? null;
    const index = best ? tierIndex(best.e1rm, th) : null;
    const effective = index == null ? null : effectiveIndex(index, rankWeight);
    const r: LadderResult = { ladderId: ladder.ladderId, name: ladder.name, rankWeight, best, index, effective };
    candidates.push(r);
    // Best candidate: highest effective index; a tie goes to the higher rank weight, then the earlier entry.
    if (effective != null && (top == null || effective > top.effective! + 1e-12)) top = r;
    const all = ctx.allTime.get(ladder.ladderId);
    if (all) peakIdx = Math.max(peakIdx, Math.floor(effectiveIndex(tierIndex(all.e1rm, th), rankWeight) + 1e-12));
  }
  const maxTier = ctx.tiers.length - 1;
  const tier = top ? Math.min(maxTier, Math.floor(top.effective! + 1e-12)) : null;
  const stored = ctx.peaks[muscleId];
  let peak: number | null = null;
  if (stored != null || peakIdx >= 0 || tier != null) peak = Math.max(stored ?? 0, peakIdx, tier ?? 0);

  let progress: number | null = null;
  let next: MuscleBadge['next'] = null;
  if (top && tier != null) {
    progress = tier >= maxTier ? 1 : top.effective! - tier;
    if (tier < maxTier) {
      const ladder = ctx.idx.ladder(top.ladderId)!;
      const th = thresholdsFor(cache, ctx, ladder);
      // Next muscle tier = ladder position tier+1 (full weight) or tier+2 (one tier lower for secondary lifts).
      const pos = Math.min(maxTier, tier + 1 + (top.rankWeight >= 0.6 ? 0 : 1));
      next = { tier: tier + 1, thresholdKg: th[pos]!, ratio: th[pos]! / ctx.bw, ladderId: top.ladderId };
    }
  }
  const suggest = tier == null ? list.map((c) => c.ladder.ladderId).slice(0, 3) : [];
  return { id: muscleId, ranked: tier != null, tier, progress, peak, best: top, candidates, next, suggest };
}

export function groupBadge(
  id: string, members: readonly string[], muscles: Readonly<Record<string, MuscleBadge>>, ctx: TierContext,
): GroupBadge {
  const ranked = members.filter((m) => muscles[m]?.ranked);
  const tier = medianTier(ranked.map((m) => muscles[m]!.tier!));
  const peaks = members.map((m) => muscles[m]?.peak).filter((p): p is number => p != null);
  const stored = ctx.peaks[`group:${id}`];
  const peakBase = medianTier(peaks);
  const peak = tier == null && stored == null && peakBase == null ? null : Math.max(stored ?? 0, peakBase ?? 0, tier ?? 0);
  const ladders = new Set<string>();
  const logged = new Set<string>();
  for (const m of members) {
    for (const { ladder, rankWeight } of ctx.idx.laddersFor(m)) {
      if (rankWeight < 0.6) continue;
      ladders.add(ladder.ladderId);
      if (ctx.window.has(ladder.ladderId)) logged.add(ladder.ladderId);
    }
  }
  return { id, ranked: tier != null, tier, peak, rankedMuscles: ranked, rankingLadders: ladders.size, rankedLadders: logged.size };
}

export function overallBadge(groups: Readonly<Record<string, GroupBadge>>): OverallBadge {
  const tiers = Object.values(groups).filter((g) => g.ranked).map((g) => g.tier!);
  return { tier: medianTier(tiers), provisional: tiers.length < MIN_GROUPS_FOR_OVERALL, rankedGroups: tiers.length };
}

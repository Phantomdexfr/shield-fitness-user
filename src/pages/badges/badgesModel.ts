// Pure helpers for the muscle badge screens (Phase 47). No DOM, no storage; the screens own the strings.

import type { BadgeResult, GroupBadge, MuscleBadge } from '../../shared/badges';

export const TIER_COUNT = 9;
export const TIER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Tier colour class for the crest and the swatches (colours are tokens, the name is always written beside them). */
export const tierClass = (tier: number | null): string => `sf-bd__t--${tier == null ? 'none' : Math.max(0, Math.min(TIER_COUNT - 1, tier))}`;

/** Muscles that have a tier, for the body figure. */
export function figureTiers(result: BadgeResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, m] of Object.entries(result.muscles)) if (m.tier != null) out[id] = m.tier;
  return out;
}

/** Ranked muscles, highest tier first, then name order of id. The text twin of the body figure. */
export function rankedRows(result: BadgeResult): MuscleBadge[] {
  return Object.values(result.muscles)
    .filter((m) => m.tier != null)
    .sort((a, b) => (b.tier! - a.tier!) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function unrankedCount(result: BadgeResult): number {
  return Object.values(result.muscles).filter((m) => m.tier == null).length;
}

/** Strongest and weakest ranked group. Null unless two ranked groups differ in tier (ties never name a "weakest"). */
export function strongestWeakest(groups: Readonly<Record<string, GroupBadge>>, order: readonly string[]): { strong: string; weak: string } | null {
  const ranked = order.filter((g) => groups[g]?.tier != null);
  if (ranked.length < 2) return null;
  let strong = ranked[0]!;
  let weak = ranked[0]!;
  for (const g of ranked) {
    if (groups[g]!.tier! > groups[strong]!.tier!) strong = g;
    if (groups[g]!.tier! < groups[weak]!.tier!) weak = g;
  }
  return groups[strong]!.tier === groups[weak]!.tier ? null : { strong, weak };
}

/** 0 to 100, whole percent, for "62% to Platinum". */
export const pct = (progress: number | null | undefined): number => Math.max(0, Math.min(100, Math.round((progress ?? 0) * 100)));

export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Keys of the implausible sets the engine left out, in the repo's confirm format. */
export const confirmKeys = (result: BadgeResult): string[] => result.needsConfirm.map((c) => `${c.sessionId}:${c.exerciseIndex}:${c.setIndex}`);

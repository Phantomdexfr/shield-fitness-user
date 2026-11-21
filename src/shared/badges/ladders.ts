// Muscle badge ladders (Phase 46, contract/engines.md section 26.1). Pure: the caller passes the parsed CSV rows.

export type LoadMode = 'total' | 'per_hand' | 'bodyweight';
export type Sex = 'm' | 'f' | 'unspecified';

export interface Ladder {
  ladderId: string;
  name: string;
  kind: string;
  /** Share of bodyweight counted as load (bodyweight lifts only; 0 for loaded lifts). */
  bwFraction: number;
  anchorM: number;
  anchorF: number;
  refBwM: number;
  refBwF: number;
  /** muscle id -> rank weight (0.3 to 1). */
  muscles: Record<string, number>;
  source: string;
}

export interface LadderMapRow {
  slug: string;
  ladderId: string;
  factor: number;
  loadMode: LoadMode;
}

export interface TierDef {
  id: string;
  name: string;
  position: number;
  fraction: number;
  experienceSets: number;
}

/** `chest:1.0;upper_chest:0.7` -> { chest: 1, upper_chest: 0.7 }. Bad parts are dropped. */
export function parseMuscleList(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split(';')) {
    const [id, w] = part.split(':');
    const weight = Number(w);
    if (id && id.trim() && Number.isFinite(weight) && weight > 0) out[id.trim()] = weight;
  }
  return out;
}

/** Raw CSV record (string cells, as papaparse gives them) -> Ladder. */
export function ladderFromRecord(r: Record<string, string>): Ladder {
  return {
    ladderId: r.ladder_id!,
    name: r.name ?? r.ladder_id!,
    kind: r.kind ?? '',
    bwFraction: Number(r.bw_fraction ?? 0),
    anchorM: Number(r.anchor_m),
    anchorF: Number(r.anchor_f),
    refBwM: Number(r.ref_bw_m),
    refBwF: Number(r.ref_bw_f),
    muscles: parseMuscleList(r.muscles ?? ''),
    source: r.source ?? '',
  };
}

export function mapRowFromRecord(r: Record<string, string>): LadderMapRow | null {
  if (!r.slug || !r.ladder_id || r.ladder_id === 'none') return null;
  const factor = Number(r.factor);
  const mode = r.load_mode as LoadMode;
  if (!(factor > 0) || (mode !== 'total' && mode !== 'per_hand' && mode !== 'bodyweight')) return null;
  return { slug: r.slug, ladderId: r.ladder_id, factor, loadMode: mode };
}

export function tierFromRecord(r: Record<string, string>): TierDef {
  return { id: r.tier_id!, name: r.name!, position: Number(r.position), fraction: Number(r.fraction), experienceSets: Number(r.experience_sets) };
}

export interface BadgeData {
  ladders: readonly Ladder[];
  /** Mapped exercises only (`none` rows are left out). */
  map: readonly LadderMapRow[];
  /** 9 tiers, Wood first. */
  tiers: readonly TierDef[];
}

export interface LadderIndex {
  ladder(id: string): Ladder | undefined;
  mapOf(slug: string): LadderMapRow | undefined;
  /** Ladders that list the muscle at rank weight >= 0.3, ladder order. */
  laddersFor(muscleId: string): Array<{ ladder: Ladder; rankWeight: number }>;
  /** Every muscle id named by any ladder, sorted. */
  muscleIds: string[];
}

export function buildLadderIndex(data: BadgeData): LadderIndex {
  const byId = new Map(data.ladders.map((l) => [l.ladderId, l]));
  const bySlug = new Map(data.map.map((m) => [m.slug, m]));
  const per = new Map<string, Array<{ ladder: Ladder; rankWeight: number }>>();
  for (const l of data.ladders) {
    for (const [m, w] of Object.entries(l.muscles)) {
      if (w < 0.3) continue;
      const list = per.get(m) ?? [];
      list.push({ ladder: l, rankWeight: w });
      per.set(m, list);
    }
  }
  return {
    ladder: (id) => byId.get(id),
    mapOf: (slug) => bySlug.get(slug),
    laddersFor: (m) => per.get(m) ?? [],
    muscleIds: [...per.keys()].sort(),
  };
}

/** Anchor and reference bodyweight for a sex. Unspecified = the average of both (engines.md 26.6). */
export function anchorFor(l: Ladder, sex: Sex): { anchor: number; refBw: number } {
  if (sex === 'm') return { anchor: l.anchorM, refBw: l.refBwM };
  if (sex === 'f') return { anchor: l.anchorF, refBw: l.refBwF };
  return { anchor: (l.anchorM + l.anchorF) / 2, refBw: (l.refBwM + l.refBwF) / 2 };
}

/** The 11 groups of the group tier (parent_group values in the detailed taxonomy). */
export const BADGE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'glutes', 'quads', 'hamstrings', 'calves',
] as const;

/** Group id -> member muscle ids, from `{ id, parentGroup }` rows. Ids outside the 11 groups (neck, full_body, cardio) are dropped. */
export function groupsOf(muscles: ReadonlyArray<{ id: string; parentGroup: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const g of BADGE_GROUPS) out[g] = [];
  for (const m of muscles) if (out[m.parentGroup]) out[m.parentGroup]!.push(m.id);
  return out;
}

/** Compiled `badges` dataset file (Phase 47, scripts/compile-dataset.mjs) -> BadgeData. Null when the file is missing or malformed. */
export function parseBadgeData(raw: unknown): BadgeData | null {
  const o = raw as { ladders?: unknown[][]; map?: unknown[][]; tiers?: unknown[][] } | null;
  if (!o || !Array.isArray(o.ladders) || !Array.isArray(o.map) || !Array.isArray(o.tiers)) return null;
  const ladders = o.ladders.map((r): Ladder => ({
    ladderId: String(r[0]), name: String(r[1]), kind: String(r[2]), bwFraction: Number(r[3]),
    anchorM: Number(r[4]), anchorF: Number(r[5]), refBwM: Number(r[6]), refBwF: Number(r[7]),
    muscles: parseMuscleList(String(r[8] ?? '')), source: String(r[9] ?? ''),
  }));
  const map = o.map.map((r): LadderMapRow => ({ slug: String(r[0]), ladderId: String(r[1]), factor: Number(r[2]), loadMode: r[3] as LoadMode }));
  const tiers = o.tiers.map((r): TierDef => ({ id: String(r[0]), name: String(r[1]), position: Number(r[2]), fraction: Number(r[3]), experienceSets: Number(r[4]) }));
  if (ladders.length === 0 || tiers.length !== 9) return null;
  return { ladders, map, tiers };
}

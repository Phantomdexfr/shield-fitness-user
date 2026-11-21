// Muscle badges data (Phase 47): turns the stored sessions, body weight and the person's answers into the engine's input
// (src/shared/badges, engines.md 26) and keeps the few things the engine cannot recompute: sex, "skipped", peaks, confirmed sets.
// Nothing leaves the device. Weights come from the same variation/setup rules the heatmap uses.

import { listSessions } from './sessions';
import { exercisesRepo, listCustomExercises } from './exercises';
import { bodyStatsRepo, prefsRepo } from '../local';
import { getBadges, getMuscles, getSetupOptions, getVariationShift } from '../../dataset/loader';
import { rowsToWeights, type MapRowTuple } from '../../shared/weights';
import { dayOfSession } from '../../shared/history';
import { istDayKey, type DayKey } from '../../shared/dates';
import { roundKg } from '../../shared/units';
import {
  computeBadges, groupsOf, parseBadgeData, sessionPromotions,
  type BadgeData, type BadgeInput, type BadgeResult, type BadgeSession, type NeedsInput, type Promotion, type Sex,
} from '../../shared/badges';
import { parseSetupData, setupWeights } from '../../pages/exercise/setupModel';
import type { Setup } from '../../shared/setup';

const PROFILE_ID = 'badges.profile';
const ROLE: Record<string, string> = { primary: 'p', secondary: 's', stabiliser: 't' };
const EMPH: Record<string, string> = { high: 'h', medium: 'm', low: 'l' };

/** The taxonomy's `parent_group` has 18 values; the badge groups are 11. These parents fold into a badge group ([A-P47.3]). */
const GROUP_OF_PARENT: Record<string, string> = { abs: 'core', obliques: 'core', lower_back: 'core', lats: 'back', traps: 'back' };

export interface BadgeProfile {
  /** null = never asked (nothing is assumed). */
  sex: Sex | null;
  /** The person skipped the first-run prompt: badges stay hidden until they set it up. */
  skipped: boolean;
  /** Highest tiers ever reached: muscle id -> tier, `group:<id>` -> tier. */
  peaks: Record<string, number>;
  /** Implausible sets the person confirmed, `<sessionId>:<exerciseIndex>:<setIndex>`. */
  confirmed: string[];
}

export const EMPTY_PROFILE: BadgeProfile = { sex: null, skipped: false, peaks: {}, confirmed: [] };

export function parseProfile(v: unknown): BadgeProfile {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const sex = o.sex === 'm' || o.sex === 'f' || o.sex === 'unspecified' ? o.sex : null;
  const peaks: Record<string, number> = {};
  if (o.peaks && typeof o.peaks === 'object') {
    for (const [k, n] of Object.entries(o.peaks as Record<string, unknown>)) if (typeof n === 'number' && n >= 0 && n <= 8) peaks[k] = n;
  }
  const confirmed = Array.isArray(o.confirmed) ? o.confirmed.filter((x): x is string => typeof x === 'string') : [];
  return { sex, skipped: o.skipped === true, peaks, confirmed };
}

export async function getProfile(): Promise<BadgeProfile> {
  return parseProfile((await prefsRepo.get(PROFILE_ID))?.value);
}

export async function saveProfile(p: BadgeProfile): Promise<void> {
  await prefsRepo.put({ client_id: PROFILE_ID, value: p });
}

export interface BodyweightRow {
  day: DayKey;
  kg: number;
}

async function loadBodyStats(): Promise<BodyweightRow[]> {
  const rows = await bodyStatsRepo.list().catch(() => []);
  const out: BodyweightRow[] = [];
  for (const r of rows) {
    if (r.deleted_at) continue;
    if (typeof r.kg === 'number' && typeof r.day === 'string' && r.kg > 0) out.push({ day: r.day, kg: r.kg });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Parse what the person typed ("82", "82.5", "82,5"). Null when it is not a believable bodyweight (25 to 400 kg). */
export function parseBodyweight(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 25 || n > 400) return null;
  return roundKg(n);
}

/** One reading per day: typing again on the same day replaces it. */
export async function saveBodyweight(kg: number, day: DayKey = istDayKey(Date.now())): Promise<void> {
  // Keep fat / cm typed the same day on /progress/body: spread the existing row, change only day and kg.
  const existing = await bodyStatsRepo.get(`bw:${day}`).catch(() => undefined);
  await bodyStatsRepo.put({ ...(existing ?? {}), client_id: `bw:${day}`, day, kg: roundKg(kg) });
}

export async function latestBodyweight(): Promise<number | null> {
  const s = await loadBodyStats();
  return s.length ? s[s.length - 1]!.kg : null;
}

async function loadSessions(confirmed: ReadonlySet<string>): Promise<BadgeSession[]> {
  const [sessions, custom, shiftAll, rawSetup] = await Promise.all([
    listSessions(),
    listCustomExercises().catch(() => []),
    getVariationShift().catch(() => ({})),
    getSetupOptions().catch(() => null),
  ]);
  const setupData = parseSetupData(rawSetup);
  const cache = new Map<string, { rows: MapRowTuple[]; custom: boolean } | null>();
  const info = async (slug: string) => {
    if (cache.has(slug)) return cache.get(slug)!;
    const c = custom.find((x) => x.slug === slug);
    let v: { rows: MapRowTuple[]; custom: boolean } | null = null;
    if (c) v = { custom: true, rows: (c.muscles ?? []).map((m): MapRowTuple => [m.id, ROLE[m.role] ?? 'p', EMPH[m.emphasis] ?? 'm', 0]) };
    else {
      const full = await exercisesRepo.get(slug).catch(() => undefined);
      if (full) v = { custom: false, rows: full.muscles as unknown as MapRowTuple[] };
    }
    cache.set(slug, v);
    return v;
  };
  const out: BadgeSession[] = [];
  for (const s of sessions) {
    const exercises: BadgeSession['exercises'][number][] = [];
    // Every item keeps its place (empty when it cannot count) so `exerciseIndex` in a confirm request stays the item's index.
    for (const it of s.items) {
      const slug = it.ref.kind === 'lib' ? it.ref.slug : custom.find((c) => c.id === (it.ref as { id: string }).id)?.slug;
      const ex = slug && it.sets.length > 0 ? await info(slug) : null;
      if (!slug || !ex) {
        exercises.push({ slug: slug ?? '', weights: {}, sets: [] });
        continue;
      }
      const weights = ex.custom
        ? rowsToWeights(ex.rows)
        : setupWeights(ex.rows, it.variation, (shiftAll as Record<string, Record<string, Array<[string, string]>>>)[slug] ?? {}, setupData, slug, it.setup as Setup | undefined);
      const idx = exercises.length;
      exercises.push({
        slug,
        weights,
        sets: it.sets.map((st, k) => ({ weightKg: st.weightKg, reps: st.reps, tag: st.tag, confirmed: confirmed.has(`${s.id}:${idx}:${k}`) })),
      });
    }
    out.push({ id: s.id, day: dayOfSession(s), exercises });
  }
  return out;
}

export interface BadgeState {
  data: BadgeData;
  profile: BadgeProfile;
  bodyweightKg: number | null;
  /** Needs sex and/or bodyweight, or the person skipped. */
  result: BadgeResult | NeedsInput;
  /** Total logged sessions (zero = nothing to rank yet). */
  sessionCount: number;
}

async function buildInput(profile: BadgeProfile, asOf: DayKey): Promise<{ data: BadgeData; input: BadgeInput; bodyStats: BodyweightRow[]; sessionCount: number } | null> {
  const [raw, { muscles }] = await Promise.all([getBadges().catch(() => null), getMuscles()]);
  const data = parseBadgeData(raw);
  if (!data) return null;
  const sessions = await loadSessions(new Set(profile.confirmed));
  const bodyStats = await loadBodyStats();
  const groups = groupsOf(muscles.map((m) => ({ id: m.id, parentGroup: GROUP_OF_PARENT[m.parent] ?? m.parent })));
  const input: BadgeInput = { sessions, bodyStats, sex: profile.sex, asOf, peaks: profile.peaks, groups };
  return { data, input, bodyStats, sessionCount: sessions.length };
}

/** Everything the badge screens need. Peaks that rose are written back. */
export async function loadBadgeState(asOf: DayKey = istDayKey(Date.now())): Promise<BadgeState | null> {
  const profile = await getProfile();
  const built = await buildInput(profile, asOf);
  if (!built) return null;
  const result = computeBadges(built.data, built.input);
  if (result.status === 'ok') {
    const before = JSON.stringify(profile.peaks);
    if (JSON.stringify(result.peaks) !== before) await saveProfile({ ...profile, peaks: result.peaks }).catch(() => undefined);
  }
  const bw = built.bodyStats.length ? built.bodyStats[built.bodyStats.length - 1]!.kg : null;
  return { data: built.data, profile, bodyweightKg: bw, result, sessionCount: built.sessionCount };
}

/** Tier raises a finished session produced (empty when badges are off, skipped or not set up). */
export async function loadSessionPromotions(sessionId: string): Promise<Promotion[]> {
  const profile = await getProfile();
  if (profile.skipped || !profile.sex) return [];
  const built = await buildInput(profile, istDayKey(Date.now()));
  if (!built) return [];
  return sessionPromotions(built.data, built.input, sessionId);
}

/** Count every implausible set the engine held back (the person says "yes, this is right"). */
export async function confirmSets(keys: readonly string[]): Promise<void> {
  const p = await getProfile();
  await saveProfile({ ...p, confirmed: [...new Set([...p.confirmed, ...keys])] });
}

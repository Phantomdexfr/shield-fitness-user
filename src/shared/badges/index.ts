// Muscle strength engine (Phase 46, contract/engines.md section 26). Pure: no DOM, no storage, no clock (`asOf` is a parameter),
// no randomness. The caller passes the parsed dataset files and the person's history; nothing is read from the app.

import { daysBetween, type DayKey } from '../dates';
import {
  buildLadderIndex, type BadgeData, type Sex,
} from './ladders';
import {
  experienceMp, experienceOf, lastTrained, medianExperienceTier, rustOf, type ExpExercise, type Experience, type Rust,
} from './experience';
import { benchmarkE1RM, isImplausible, ladderThresholds, loadFor } from './thresholds';
import {
  groupBadge, muscleBadge, overallBadge,
  type BestSet, type GroupBadge, type MuscleBadge, type OverallBadge, type TierContext,
} from './tiers';

export * from './ladders';
export * from './thresholds';
export * from './tiers';
export * from './experience';

/** Strength only looks at the last 365 days (the asOf day and the 364 before it). Peak and experience are never windowed. */
export const WINDOW_DAYS = 365;

export interface BadgeSet {
  weightKg: number | null | undefined;
  reps: number | null | undefined;
  tag?: 'normal' | 'warmup' | 'drop' | 'superset';
  /** The person confirmed an implausible set ("is this right?"), so it counts. */
  confirmed?: boolean;
}

export interface BadgeExercise extends ExpExercise {
  slug: string;
  sets: readonly BadgeSet[];
}

export interface BadgeSession {
  id: string;
  /** IST day the session started on. */
  day: DayKey;
  exercises: readonly BadgeExercise[];
}

export interface BodyStat {
  day: DayKey;
  kg: number;
}

export interface BadgeInput {
  /** Any order; sorted by day, then by position here. Sessions after `asOf` are ignored. */
  sessions: readonly BadgeSession[];
  /** Body weight history. Empty -> `needsBodyweight`. */
  bodyStats: readonly BodyStat[];
  /** null = never asked -> `needsSex` (nothing is assumed). 'unspecified' = averaged anchors, labelled Estimated. */
  sex: Sex | null;
  asOf: DayKey;
  /** Stored peaks: muscle id -> tier, group `group:<id>` -> tier. */
  peaks?: Readonly<Record<string, number>>;
  /** Group id -> member muscle ids (`groupsOf`). */
  groups: Readonly<Record<string, readonly string[]>>;
  /** Muscles to rank; default = every muscle a ladder names. */
  muscles?: readonly string[];
}

export interface NeedsInput {
  status: 'needs_input';
  needsBodyweight: boolean;
  needsSex: boolean;
}

export interface ConfirmSet {
  sessionId: string;
  slug: string;
  exerciseIndex: number;
  setIndex: number;
  ladderId: string;
  benchmarkE1rm: number;
  bodyweightKg: number;
}

export interface BadgeResult {
  status: 'ok';
  /** Sex was left unspecified: anchors are averaged, so every badge is an estimate. */
  estimated: boolean;
  /** Bodyweight the thresholds were taken at (latest stat at or before asOf). */
  bodyweightKg: number;
  asOf: DayKey;
  muscles: Record<string, MuscleBadge>;
  groups: Record<string, GroupBadge>;
  overall: OverallBadge;
  experience: {
    muscles: Record<string, Experience>;
    groups: Record<string, number | null>;
    overall: number | null;
  };
  rust: Record<string, Rust>;
  /** Peaks to store back (muscles and `group:<id>`), never lower than the ones passed in. */
  peaks: Record<string, number>;
  /** Implausible sets waiting for a confirm; they are left out of every tier until confirmed. */
  needsConfirm: ConfirmSet[];
}

export interface Promotion {
  kind: 'muscle' | 'group' | 'overall';
  id: string;
  /** Tier before (null = Unranked). */
  from: number | null;
  to: number;
}

function bodyweightAt(stats: readonly BodyStat[], day: DayKey): number {
  // `stats` is sorted by day. Latest stat at or before the day; a day before the first stat uses the first stat.
  let kg = stats[0]!.kg;
  for (const s of stats) {
    if (s.day <= day) kg = s.kg;
    else break;
  }
  return kg;
}

export function computeBadges(data: BadgeData, input: BadgeInput): BadgeResult | NeedsInput {
  const stats = input.bodyStats
    .filter((s) => Number.isFinite(s.kg) && s.kg > 0)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.day < b.s.day ? -1 : a.s.day > b.s.day ? 1 : a.i - b.i))
    .map((x) => x.s);
  const needsBodyweight = stats.length === 0;
  const needsSex = input.sex == null;
  if (needsBodyweight || needsSex) return { status: 'needs_input', needsBodyweight, needsSex };
  const sex = input.sex as Sex;

  const idx = buildLadderIndex(data);
  const asOf = input.asOf;
  const bw = bodyweightAt(stats, asOf);
  const sessions = input.sessions
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.day <= asOf)
    .sort((a, b) => (a.s.day < b.s.day ? -1 : a.s.day > b.s.day ? 1 : a.i - b.i))
    .map((x) => x.s);

  const window = new Map<string, BestSet>();
  const allTime = new Map<string, BestSet>();
  const needsConfirm: ConfirmSet[] = [];
  for (const s of sessions) {
    const inWindow = daysBetween(s.day, asOf) < WINDOW_DAYS;
    const sessionBw = bodyweightAt(stats, s.day);
    s.exercises.forEach((ex, exerciseIndex) => {
      const map = idx.mapOf(ex.slug);
      const ladder = map ? idx.ladder(map.ladderId) : undefined;
      if (!map || !ladder) return;
      ex.sets.forEach((set, setIndex) => {
        if (set.tag === 'warmup') return;
        const load = loadFor(map.loadMode, ladder.bwFraction, sessionBw, set.weightKg);
        if (load == null) return;
        const b = benchmarkE1RM(load, set.reps, map.factor);
        if (b == null) return;
        if (isImplausible(b, sessionBw) && !set.confirmed) {
          needsConfirm.push({ sessionId: s.id, slug: ex.slug, exerciseIndex, setIndex, ladderId: ladder.ladderId, benchmarkE1rm: b, bodyweightKg: sessionBw });
          return;
        }
        const rec: BestSet = { e1rm: b, day: s.day, slug: ex.slug, weightKg: set.weightKg ?? null, reps: set.reps as number, sessionId: s.id };
        const a = allTime.get(ladder.ladderId);
        if (!a || b > a.e1rm) allTime.set(ladder.ladderId, rec);
        if (inWindow) {
          const w = window.get(ladder.ladderId);
          if (!w || b > w.e1rm) window.set(ladder.ladderId, rec);
        }
      });
    });
  }

  const ctx: TierContext = { idx, tiers: data.tiers, sex, bw, window, allTime, peaks: input.peaks ?? {} };
  const cache = new Map<string, number[]>();
  const muscleIds = input.muscles ?? idx.muscleIds;
  const muscles: Record<string, MuscleBadge> = {};
  for (const m of muscleIds) muscles[m] = muscleBadge(m, ctx, cache);
  const groups: Record<string, GroupBadge> = {};
  for (const [g, members] of Object.entries(input.groups)) groups[g] = groupBadge(g, members, muscles, ctx);
  const overall = overallBadge(groups);

  const peaks: Record<string, number> = { ...(input.peaks ?? {}) };
  for (const [m, b] of Object.entries(muscles)) if (b.peak != null) peaks[m] = Math.max(peaks[m] ?? 0, b.peak);
  for (const [g, b] of Object.entries(groups)) if (b.peak != null) peaks[`group:${g}`] = Math.max(peaks[`group:${g}`] ?? 0, b.peak);

  // Experience and rust: whole history up to asOf, no window.
  const mp = experienceMp(sessions);
  const expMuscles: Record<string, Experience> = {};
  for (const [m, v] of Object.entries(mp)) expMuscles[m] = experienceOf(v, data.tiers);
  const expGroups: Record<string, number | null> = {};
  for (const [g, members] of Object.entries(input.groups)) expGroups[g] = medianExperienceTier(members, expMuscles);
  const expOverall = (() => {
    const tiers = Object.values(expGroups).filter((t): t is number => t != null);
    if (tiers.length === 0) return null;
    const s = [...tiers].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 === 1 ? s[mid]! : Math.floor((s[mid - 1]! + s[mid]!) / 2);
  })();
  const last = lastTrained(sessions);
  const rust: Record<string, Rust> = {};
  for (const m of new Set([...Object.keys(last), ...muscleIds])) rust[m] = rustOf(last[m], asOf);

  return {
    status: 'ok',
    estimated: sex === 'unspecified',
    bodyweightKg: bw,
    asOf,
    muscles,
    groups,
    overall,
    experience: { muscles: expMuscles, groups: expGroups, overall: expOverall },
    rust,
    peaks,
    needsConfirm,
  };
}

/** Tier raises between two results (before and after a session). From Unranked counts only when the new tier is Beginner or higher. */
export function promotionsBetween(before: BadgeResult, after: BadgeResult): Promotion[] {
  const out: Promotion[] = [];
  const check = (kind: Promotion['kind'], id: string, from: number | null, to: number | null) => {
    if (to == null) return;
    if (from == null ? to >= 1 : to > from) out.push({ kind, id, from, to });
  };
  for (const id of Object.keys(after.muscles).sort()) check('muscle', id, before.muscles[id]?.tier ?? null, after.muscles[id]!.tier);
  for (const id of Object.keys(after.groups).sort()) check('group', id, before.groups[id]?.tier ?? null, after.groups[id]!.tier);
  check('overall', 'overall', before.overall.tier, after.overall.tier);
  return out;
}

/**
 * Promotions a session produced: the result with the sessions before it against the result with it, both at the session's day.
 * Returns [] when badges cannot be computed yet or the session is not in the list.
 */
export function sessionPromotions(data: BadgeData, input: BadgeInput, sessionId: string): Promotion[] {
  const ordered = input.sessions
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.day < b.s.day ? -1 : a.s.day > b.s.day ? 1 : a.i - b.i))
    .map((x) => x.s);
  const at = ordered.findIndex((s) => s.id === sessionId);
  if (at < 0) return [];
  const day = ordered[at]!.day;
  const base = { ...input, asOf: day, peaks: undefined };
  const before = computeBadges(data, { ...base, sessions: ordered.slice(0, at) });
  const after = computeBadges(data, { ...base, sessions: ordered.slice(0, at + 1) });
  if (before.status !== 'ok' || after.status !== 'ok') return [];
  return promotionsBetween(before, after);
}

/** Convenience for the UI: thresholds of one ladder at the result's bodyweight, in kg per tier. */
export function thresholdsAt(data: BadgeData, ladderId: string, sex: Sex, bw: number): number[] | null {
  const l = data.ladders.find((x) => x.ladderId === ladderId);
  return l ? ladderThresholds(l, sex, bw, data.tiers) : null;
}

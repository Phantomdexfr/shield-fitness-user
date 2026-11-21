// Progress series (Phase 53): pure shapes for `/progress` and `/progress/exercise/<slug>`. No DOM, no storage, no clock (today is a parameter).
// Days are IST day keys; a session belongs to the IST day it STARTED on; weeks start on Monday. Warm-ups never count (sessionStats drops them).
// Streaks and consistency follow contract/engines.md section 24.

import { addDays, istDayKey, istWeekStartKey, dayKeyStart, daysBetween, type DayKey } from './dates';
import { bestE1rm, topWeight, workingSets, type EngineSet, type ExerciseResult } from './engine/sessionStats';
import { isPlateau } from './engine/plateau';
import { finishedSessions } from './history';
import { refId, type Session } from './session';
import { roundKg } from './units';
import type { Schedule } from './schedule';

export type CustomSlug = (id: string) => string | undefined;
const none: CustomSlug = () => undefined;

const startMs = (s: Session): number => Date.parse(s.startedAt);
const dayOf = (s: Session): DayKey | null => {
  const ms = startMs(s);
  return Number.isFinite(ms) ? istDayKey(ms) : null;
};
const slugOfItem = (it: Session['items'][number], customSlug: CustomSlug): string | undefined => (it.ref.kind === 'lib' ? it.ref.slug : customSlug(it.ref.id));

// ---------------------------------------------------------------- per exercise

export type ExerciseMetric = 'weight' | 'reps' | 'e1rm';

export interface ExercisePoint {
  day: DayKey;
  /** Heaviest working weight that day, kg (null = bodyweight only). */
  weight: number | null;
  /** Most reps in one working set that day (null = none logged). */
  reps: number | null;
  e1rm: number | null;
  /** Working sets that day. */
  sets: number;
}

/** One point per IST day for an exercise, oldest first. Several sessions on one day merge to the best of each metric. Sessions without a working set are skipped. */
export function exercisePoints(sessions: readonly Session[], slug: string, customSlug: CustomSlug = none): ExercisePoint[] {
  const byDay = new Map<DayKey, ExercisePoint>();
  for (const s of finishedSessions([...sessions])) {
    const day = dayOf(s);
    if (!day) continue;
    for (const it of s.items) {
      if (slugOfItem(it, customSlug) !== slug) continue;
      const ws = workingSets(it.sets as EngineSet[]);
      if (ws.length === 0) continue;
      const w = topWeight(ws);
      const reps = Math.max(...ws.map((x) => (typeof x.reps === 'number' && Number.isFinite(x.reps) ? x.reps : 0)));
      const e = bestE1rm(ws);
      const cur = byDay.get(day);
      const next: ExercisePoint = {
        day,
        weight: w > 0 ? roundKg(w) : null,
        reps: reps > 0 ? reps : null,
        e1rm: e == null ? null : roundKg(e),
        sets: ws.length,
      };
      if (!cur) byDay.set(day, next);
      else
        byDay.set(day, {
          day,
          weight: maxOf(cur.weight, next.weight),
          reps: maxOf(cur.reps, next.reps),
          e1rm: maxOf(cur.e1rm, next.e1rm),
          sets: cur.sets + next.sets,
        });
    }
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

const maxOf = (a: number | null, b: number | null): number | null => (a == null ? b : b == null ? a : Math.max(a, b));

export interface ExerciseSummary {
  sessions: number;
  bestWeight: number | null;
  bestE1rm: number | null;
  bestReps: number | null;
  lastDay: DayKey | null;
}

export function exerciseSummary(points: readonly ExercisePoint[]): ExerciseSummary {
  let bw: number | null = null;
  let be: number | null = null;
  let br: number | null = null;
  for (const p of points) {
    bw = maxOf(bw, p.weight);
    be = maxOf(be, p.e1rm);
    br = maxOf(br, p.reps);
  }
  return { sessions: points.length, bestWeight: bw, bestE1rm: be, bestReps: br, lastDay: points.length ? (points[points.length - 1] as ExercisePoint).day : null };
}

/** Chart points for one metric: `y` is null when that day has no value (the line breaks, no NaN). */
export function metricPoints(points: readonly ExercisePoint[], metric: ExerciseMetric): { x: DayKey; y: number | null }[] {
  return points.map((p) => ({ x: p.day, y: p[metric] }));
}

/** Per-session results of an exercise, oldest first, for the plateau rule (one per finished session that has the exercise). */
export function exerciseResults(sessions: readonly Session[], slug: string, customSlug: CustomSlug = none): ExerciseResult[] {
  return finishedSessions([...sessions])
    .filter((s) => dayOf(s) !== null)
    .sort((a, b) => startMs(a) - startMs(b))
    .map((s) => ({ sets: s.items.filter((it) => slugOfItem(it, customSlug) === slug).flatMap((it) => it.sets as EngineSet[]) }))
    .filter((r) => workingSets(r.sets).length > 0);
}

/** Plateau hint for one exercise (engine rule: last 4 sessions did not beat the earlier best e1RM by 1%). */
export const plateauHint = (sessions: readonly Session[], slug: string, customSlug: CustomSlug = none): boolean => isPlateau(exerciseResults(sessions, slug, customSlug));

export interface ExerciseListEntry {
  slug: string;
  sessions: number;
  lastDay: DayKey;
  plateau: boolean;
}

/** Every exercise with at least one logged working set, most recently trained first (ties by slug). */
export function exerciseList(sessions: readonly Session[], customSlug: CustomSlug = none): ExerciseListEntry[] {
  const slugs = new Set<string>();
  for (const s of finishedSessions([...sessions])) for (const it of s.items) {
    const slug = slugOfItem(it, customSlug);
    if (slug && workingSets(it.sets as EngineSet[]).length > 0) slugs.add(slug);
  }
  const out: ExerciseListEntry[] = [];
  for (const slug of slugs) {
    const pts = exercisePoints(sessions, slug, customSlug);
    if (pts.length === 0) continue;
    out.push({ slug, sessions: pts.length, lastDay: (pts[pts.length - 1] as ExercisePoint).day, plateau: plateauHint(sessions, slug, customSlug) });
  }
  return out.sort((a, b) => (a.lastDay < b.lastDay ? 1 : a.lastDay > b.lastDay ? -1 : a.slug < b.slug ? -1 : 1));
}

// ---------------------------------------------------------------- weekly volume

export interface WeekVolume {
  /** Monday of the IST week. */
  weekStart: DayKey;
  /** Sum of weight x reps over working sets, kg. */
  volume: number;
  sessions: number;
}

/** The last `weeks` IST weeks ending with the week of `today` (oldest first), zeros included. */
export function weeklyVolume(sessions: readonly Session[], today: DayKey, weeks = 12): WeekVolume[] {
  const n = Math.max(1, Math.min(52, Math.floor(weeks)));
  const thisWeek = istWeekStartKey(dayKeyStart(today));
  const out: WeekVolume[] = [];
  for (let i = n - 1; i >= 0; i--) out.push({ weekStart: addDays(thisWeek, -7 * i), volume: 0, sessions: 0 });
  const index = new Map(out.map((w, i) => [w.weekStart, i]));
  for (const s of finishedSessions([...sessions])) {
    const ms = startMs(s);
    if (!Number.isFinite(ms)) continue;
    const i = index.get(istWeekStartKey(ms));
    if (i === undefined) continue;
    const w = out[i] as WeekVolume;
    w.sessions += 1;
    for (const it of s.items) for (const x of workingSets(it.sets as EngineSet[])) {
      const kg = typeof x.weightKg === 'number' && Number.isFinite(x.weightKg) && x.weightKg > 0 ? x.weightKg : 0;
      const reps = typeof x.reps === 'number' && Number.isFinite(x.reps) && x.reps > 0 ? x.reps : 0;
      w.volume += kg * reps;
    }
  }
  return out.map((w) => ({ ...w, volume: Math.round(w.volume) }));
}

/** Index of the week with the most volume (the newest on a tie); -1 when every week is zero. */
export function topWeekIndex(weeks: readonly WeekVolume[]): number {
  let best = -1;
  let max = 0;
  weeks.forEach((w, i) => {
    if (w.volume > 0 && w.volume >= max) {
      max = w.volume;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------- consistency grid

export interface GridRange {
  from: DayKey;
  to: DayKey;
}

/** The Monday `weeks - 1` weeks before this week, up to today. */
export function gridRange(today: DayKey, weeks = 12): GridRange {
  const n = Math.max(1, Math.min(53, Math.floor(weeks)));
  return { from: addDays(istWeekStartKey(dayKeyStart(today)), -7 * (n - 1)), to: today };
}

/** Sessions per day inside the range (days with none are left out; the grid draws them as empty). */
export function gridCells(sessions: readonly Session[], range: GridRange): { day: DayKey; value: number }[] {
  const counts = new Map<DayKey, number>();
  for (const s of finishedSessions([...sessions])) {
    const d = dayOf(s);
    if (d && d >= range.from && d <= range.to) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, value]) => ({ day, value }));
}

// ---------------------------------------------------------------- streaks and consistency (engines.md 24)

export const DEFAULT_TARGET = 3;
/** One grace week per this many weeks keeps a streak alive. */
export const GRACE_SPAN = 8;

const clampTarget = (n: number): number => Math.max(1, Math.min(7, Math.round(n)));

/** Training days per week the schedule asks for. No schedule (or nothing countable) = 3. Rest days are never counted. */
export function scheduledTarget(schedule: Schedule | undefined): number {
  if (!schedule) return DEFAULT_TARGET;
  switch (schedule.mode) {
    case 'weekdays':
      return schedule.weekdays.length > 0 ? clampTarget(new Set(schedule.weekdays).size) : DEFAULT_TARGET;
    case 'cycle': {
      const days = schedule.pattern.filter((p) => p === 'T').length;
      return days > 0 && schedule.pattern.length > 0 ? clampTarget((days * 7) / schedule.pattern.length) : DEFAULT_TARGET;
    }
    case 'every_n':
      return schedule.n >= 1 ? clampTarget(7 / schedule.n) : DEFAULT_TARGET;
    case 'floating':
      return schedule.maxPerWeek >= 1 ? clampTarget(schedule.maxPerWeek) : DEFAULT_TARGET;
    case 'ab_weeks':
      return clampTarget((scheduledTarget(schedule.weekA) + scheduledTarget(schedule.weekB)) / 2);
  }
}

/** The person's own number wins; otherwise the routine's schedule; otherwise 3. */
export const weeklyTarget = (own: number | null | undefined, schedule: Schedule | undefined): number => (typeof own === 'number' && Number.isFinite(own) && own >= 1 ? clampTarget(own) : scheduledTarget(schedule));

export interface Consistency {
  target: number;
  /** Sessions finished this IST week. */
  thisWeek: number;
  /** Ring fill, 0..1 (sessions / target, capped). */
  fill: number;
  /** This week already has `target` sessions. */
  keptNow: boolean;
  /** Consecutive kept weeks (this week included once it is kept). A grace week keeps the streak alive but is not counted. */
  streak: number;
  /** The streak got through a grace week. */
  graceUsed: boolean;
}

/** Sessions per IST week, keyed by Monday. */
export function weekCounts(sessions: readonly Session[]): Map<DayKey, number> {
  const m = new Map<DayKey, number>();
  for (const s of finishedSessions([...sessions])) {
    const ms = startMs(s);
    if (!Number.isFinite(ms)) continue;
    const k = istWeekStartKey(ms);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * A week is kept when sessions >= target. The week in progress never breaks a streak (it counts once kept). Going back from last week:
 * a kept week adds one; a missed week is forgiven by the grace rule only if no other grace week lies within 7 weeks of it; any other
 * miss ends the streak. Weeks before the first session are not misses. The current target applies to every past week.
 */
export function consistency(sessions: readonly Session[], today: DayKey, target: number): Consistency {
  const tgt = clampTarget(target);
  const counts = weekCounts(sessions);
  const thisStart = istWeekStartKey(dayKeyStart(today));
  const now = counts.get(thisStart) ?? 0;
  const keptNow = now >= tgt;
  const first = [...counts.keys()].sort()[0];
  let streak = keptNow ? 1 : 0;
  const graces: number[] = [];
  if (first !== undefined) {
    const span = Math.floor(daysBetween(first, thisStart) / 7);
    for (let back = 1; back <= span; back++) {
      const week = addDays(thisStart, -7 * back);
      if ((counts.get(week) ?? 0) >= tgt) {
        streak += 1;
        continue;
      }
      // A grace week is allowed once per 8 weeks, and only if an earlier kept week exists to carry the streak on to.
      if (graces.every((g) => Math.abs(g - back) >= GRACE_SPAN)) {
        const earlier = Array.from({ length: span - back }, (_, k) => addDays(thisStart, -7 * (back + k + 1))).some((w) => (counts.get(w) ?? 0) >= tgt);
        if (earlier) {
          graces.push(back);
          continue;
        }
      }
      break;
    }
  }
  return { target: tgt, thisWeek: now, fill: Math.min(1, now / tgt), keptNow, streak, graceUsed: graces.length > 0 };
}

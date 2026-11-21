// Body stats and goals (Phase 54): pure maths. No DOM, no storage, no clock (today is a parameter). Days are IST day keys.
// Body entries reuse the `bodyStats` rows the muscle badges already read (client_id `bw:<day>`, fields `day`, `kg`); body fat and
// measurements are extra optional fields on the same row. Weights are kg, lengths cm.

import { daysBetween, isDayKey, type DayKey } from './dates';
import { roundKg } from './units';

// ---------------------------------------------------------------- body entries

export const MEASURES = ['chest', 'waist', 'hips', 'arm', 'thigh'] as const;
export type Measure = (typeof MEASURES)[number];

export interface BodyEntry {
  day: DayKey;
  kg: number | null;
  /** Body fat, percent. */
  fat: number | null;
  cm: Partial<Record<Measure, number>>;
}

export const RANGE = { kg: [25, 400], fat: [2, 60], cm: [10, 300], height: [100, 250] } as const;

/** What the person typed ("82", "82.5", "82,5"). Null for empty, not a number, or outside [min, max]. */
export function parseNumber(text: string, min: number, max: number): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

/** Entries from stored rows: deleted or day-less rows are dropped, bad numbers become null, one entry per day, oldest first. */
export function parseEntries(rows: readonly { day?: unknown; kg?: unknown; fat?: unknown; cm?: unknown; deleted_at?: unknown }[]): BodyEntry[] {
  const byDay = new Map<DayKey, BodyEntry>();
  for (const r of rows) {
    if (r.deleted_at || typeof r.day !== 'string' || !isDayKey(r.day)) continue;
    const cm: Partial<Record<Measure, number>> = {};
    const raw = (r.cm && typeof r.cm === 'object' ? r.cm : {}) as Record<string, unknown>;
    for (const m of MEASURES) {
      const v = num(raw[m], RANGE.cm[0], RANGE.cm[1]);
      if (v !== null) cm[m] = v;
    }
    byDay.set(r.day, { day: r.day, kg: num(r.kg, RANGE.kg[0], RANGE.kg[1]), fat: num(r.fat, RANGE.fat[0], RANGE.fat[1]), cm });
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Typing again on a day keeps what was not typed: only the fields in `patch` change. */
export function mergeEntry(prev: BodyEntry | undefined, patch: Partial<Omit<BodyEntry, 'day'>> & { day: DayKey }): BodyEntry {
  return {
    day: patch.day,
    kg: patch.kg !== undefined ? patch.kg : (prev?.kg ?? null),
    fat: patch.fat !== undefined ? patch.fat : (prev?.fat ?? null),
    cm: { ...(prev?.cm ?? {}), ...(patch.cm ?? {}) },
  };
}

export const hasValue = (e: BodyEntry): boolean => e.kg !== null || e.fat !== null || Object.keys(e.cm).length > 0;

export type BodyField = 'kg' | 'fat' | Measure;

/** Chart points for one field; days without a value are left out (the line joins real readings, never a zero). */
export function bodySeries(entries: readonly BodyEntry[], field: BodyField): { x: DayKey; y: number }[] {
  const out: { x: DayKey; y: number }[] = [];
  for (const e of entries) {
    const v = field === 'kg' ? e.kg : field === 'fat' ? e.fat : (e.cm[field] ?? null);
    if (v !== null && Number.isFinite(v)) out.push({ x: e.day, y: v });
  }
  return out;
}

/** The newest value of a field, or null. */
export function latestOf(entries: readonly BodyEntry[], field: BodyField): number | null {
  const s = bodySeries(entries, field);
  return s.length ? (s[s.length - 1] as { y: number }).y : null;
}

/** Body mass index, one decimal. Null without a believable weight and height. */
export function bmi(kg: number | null, heightCm: number | null): number | null {
  if (kg === null || heightCm === null || !(kg > 0) || !(heightCm >= RANGE.height[0])) return null;
  const m = heightCm / 100;
  return Math.round((kg / (m * m)) * 10) / 10;
}

export type BmiBand = 'under' | 'healthy' | 'over' | 'high';
/** The usual adult cut-offs (18.5, 25, 30). A rough guide: it cannot tell muscle from fat. */
export const bmiBand = (v: number): BmiBand => (v < 18.5 ? 'under' : v < 25 ? 'healthy' : v < 30 ? 'over' : 'high');

// ---------------------------------------------------------------- goals

export type GoalKind = 'weight' | 'body_fat' | 'lift' | 'attendance' | 'event';
export const GOAL_KINDS: readonly GoalKind[] = ['weight', 'body_fat', 'lift', 'attendance', 'event'];

export interface Goal {
  id: string;
  kind: GoalKind;
  /** Event name, or an optional label for the others. */
  title?: string;
  /** weight kg, body fat %, lift e1RM kg, attendance = sessions to log, event = unused (0). */
  target: number;
  /** The value when the goal was made (attendance and event: 0). */
  start: number;
  startDay: DayKey;
  /** Weight and body fat: optional. Lift and attendance: optional. Event: the event day (required). */
  deadline?: DayKey;
  /** Lift goals: the exercise slug. */
  slug?: string;
  /** The day the achievement moment was shown. */
  achievedOn?: DayKey;
}

export type GoalProblem = 'target' | 'same_as_start' | 'deadline_past' | 'deadline_order' | 'slug' | 'event_date' | 'title';

const TARGET_RANGE: Record<Exclude<GoalKind, 'event'>, readonly [number, number]> = { weight: RANGE.kg, body_fat: RANGE.fat, lift: [1, 1000], attendance: [1, 1000] };

/** First problem with a goal about to be saved, or null. `today` is the IST day. */
export function goalProblem(g: Pick<Goal, 'kind' | 'target' | 'start' | 'startDay' | 'deadline' | 'slug' | 'title'>, today: DayKey): GoalProblem | null {
  if (g.kind === 'event') {
    if (!g.title || g.title.trim() === '') return 'title';
    if (!g.deadline || !isDayKey(g.deadline)) return 'event_date';
    return g.deadline < today ? 'deadline_past' : null;
  }
  const [lo, hi] = TARGET_RANGE[g.kind];
  if (!Number.isFinite(g.target) || g.target < lo || g.target > hi) return 'target';
  if (g.kind === 'attendance' && !Number.isInteger(g.target)) return 'target';
  if (g.kind === 'lift' && !g.slug) return 'slug';
  if ((g.kind === 'weight' || g.kind === 'body_fat' || g.kind === 'lift') && g.target === g.start) return 'same_as_start';
  if (g.deadline !== undefined) {
    if (!isDayKey(g.deadline)) return 'deadline_order';
    if (g.deadline < g.startDay) return 'deadline_order';
    if (g.deadline < today) return 'deadline_past';
  }
  return null;
}

export type GoalStatus = 'reached' | 'ahead' | 'on_track' | 'behind' | 'overdue' | 'open';

export interface GoalProgress {
  /** 0..1 along the way from start to target. */
  fraction: number;
  /** Whole percent, 0..100. */
  pct: number;
  reached: boolean;
  current: number | null;
  /** Distance still to go (same unit as the target), 0 once reached; null when current is unknown. */
  remaining: number | null;
  /** Days to the deadline (negative when past); null without one. */
  daysLeft: number | null;
  status: GoalStatus;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** Share of the way from `start` to `target` (either direction). `start === target` is 1 only when already there. */
export function progressFraction(start: number, target: number, current: number | null): number {
  if (current === null || !Number.isFinite(current)) return 0;
  if (start === target) return current === target ? 1 : 0;
  return clamp01((current - start) / (target - start));
}

const TOLERANCE = 0.1;

/**
 * Where a goal stands. `current` is the latest weight / body fat, the best e1RM for the lift, or the sessions since the goal began.
 * An event goal fills with the days between its start and the event day and is reached on that day.
 * With a deadline: behind / on track / ahead compare the progress with the share of time used (10 % either way is on track).
 */
export function goalProgress(g: Goal, current: number | null, today: DayKey): GoalProgress {
  const daysLeft = g.deadline && isDayKey(g.deadline) ? daysBetween(today, g.deadline) : null;
  if (g.kind === 'event') {
    const total = g.deadline ? Math.max(1, daysBetween(g.startDay, g.deadline)) : 1;
    const used = g.deadline ? daysBetween(g.startDay, today) : 0;
    const reached = daysLeft !== null && daysLeft <= 0;
    const f = reached ? 1 : clamp01(used / total);
    return { fraction: f, pct: Math.round(f * 100), reached, current: null, remaining: null, daysLeft, status: reached ? 'reached' : 'open' };
  }
  const f = progressFraction(g.start, g.target, current);
  const up = g.target > g.start;
  const reached = current !== null && Number.isFinite(current) && (g.target === g.start ? current === g.target : up ? current >= g.target : current <= g.target);
  const remaining = current === null || !Number.isFinite(current) ? null : reached ? 0 : roundKg(Math.abs(g.target - current));
  let status: GoalStatus = 'open';
  if (reached) status = 'reached';
  else if (daysLeft !== null) {
    if (daysLeft < 0) status = 'overdue';
    else {
      const total = Math.max(1, daysBetween(g.startDay, g.deadline as DayKey));
      const time = clamp01(daysBetween(g.startDay, today) / total);
      status = f >= time + TOLERANCE ? 'ahead' : f < time - TOLERANCE ? 'behind' : 'on_track';
    }
  }
  return { fraction: reached ? 1 : f, pct: Math.round((reached ? 1 : f) * 100), reached, current, remaining, daysLeft, status };
}

export interface Milestone {
  pct: 25 | 50 | 75 | 100;
  /** The value to reach (rounded to 0.1, whole sessions for attendance). */
  value: number;
  reached: boolean;
}

/** Quarter-way marks from start to target. Event goals have none. */
export function milestones(g: Goal, current: number | null): Milestone[] {
  if (g.kind === 'event') return [];
  const out: Milestone[] = [];
  for (const pct of [25, 50, 75, 100] as const) {
    const raw = g.start + ((g.target - g.start) * pct) / 100;
    const value = g.kind === 'attendance' ? Math.ceil(raw - 1e-9) : Math.round(raw * 10) / 10;
    const up = g.target >= g.start;
    out.push({ pct, value, reached: current !== null && Number.isFinite(current) && (up ? current >= value : current <= value) });
  }
  return out;
}

/** Goals that are reached and have not had their achievement moment yet. */
export function toCelebrate(goals: readonly Goal[], progress: ReadonlyMap<string, GoalProgress>): Goal[] {
  return goals.filter((g) => !g.achievedOn && progress.get(g.id)?.reached === true);
}

/** Sessions on or after `startDay` (day keys of finished sessions in, a count out). */
export const sessionsSince = (days: readonly DayKey[], startDay: DayKey): number => days.filter((d) => d >= startDay).length;

/** A stored row back into a goal; anything malformed is dropped (null). */
export function parseGoal(row: Record<string, unknown>): Goal | null {
  if (row.deleted_at) return null;
  const kind = row.kind;
  if (typeof kind !== 'string' || !(GOAL_KINDS as readonly string[]).includes(kind)) return null;
  const id = row.client_id;
  const target = row.target;
  const start = row.start;
  const startDay = row.startDay;
  if (typeof id !== 'string' || typeof target !== 'number' || !Number.isFinite(target) || typeof start !== 'number' || !Number.isFinite(start) || typeof startDay !== 'string' || !isDayKey(startDay)) return null;
  const g: Goal = { id, kind: kind as GoalKind, target, start, startDay };
  if (typeof row.title === 'string' && row.title) g.title = row.title;
  if (typeof row.deadline === 'string' && isDayKey(row.deadline)) g.deadline = row.deadline;
  if (typeof row.slug === 'string' && row.slug) g.slug = row.slug;
  if (typeof row.achievedOn === 'string' && isDayKey(row.achievedOn)) g.achievedOn = row.achievedOn;
  return g;
}

// Scheduler engine (Phase 32). Pure: no DOM, no clock, no storage; `today` is always a parameter.
// Spec: contract/engines.md section 16 and docs/SCHEDULER.md ("Phase 29 UX spec", ex. 1-13).
// Weekdays are 0=Mon..6=Sun; dates are IST day keys (`src/shared/dates.ts`).

import { addDays, daysBetween, isDayKey, weekdayOfKey, type DayKey } from './dates';
import { roundKg } from './units';

export type CycleTile = 'T' | 'A' | 'M' | 'R';
export type Schedule =
  | { mode: 'weekdays'; weekdays: number[] }
  | { mode: 'cycle'; pattern: CycleTile[]; startDate: string }
  | { mode: 'every_n'; n: number }
  | { mode: 'floating'; maxPerWeek: number; minRestDays?: number }
  | { mode: 'ab_weeks'; weekA: Schedule; weekB: Schedule };

/** [A-P29.2] Extra data kept on the local routine document; ignored by anything that does not know it. */
export interface ScheduleMeta {
  anchorDate?: string;
  /** ISO date of each deload week's start. */
  deloadWeeks: string[];
  /** The day the schedule was last saved (A/B fallback anchor, lower bound for missed days). */
  savedOn?: string;
}

export type ScheduleError = 'no_training_day' | 'cycle_length' | 'every_n_range' | 'floating_range' | 'weekday_range' | 'bad_date' | 'nested';

export const CYCLE_MIN = 2;
export const CYCLE_MAX = 14;
export const EVERY_N_MAX = 14;
export const MAX_PER_WEEK_MAX = 7;
export const MIN_REST_MAX = 3;
/** Missed planned days in a row after which one "Welcome back" card replaces the sheets (ex. 8). */
export const BREAK_AFTER = 3;
/** The rest-day hint shows when this share of the Day's target muscles is fatigued (ex. 10). */
export const HINT_SHARE = 0.6;

const TILES: readonly CycleTile[] = ['T', 'A', 'M', 'R'];
const isTile = (x: unknown): x is CycleTile => typeof x === 'string' && (TILES as readonly string[]).includes(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

/** Next tile when tapping a cycle tile: T -> A -> M -> R -> T. */
export function nextTile(t: CycleTile): CycleTile {
  return TILES[(TILES.indexOf(t) + 1) % TILES.length]!;
}

export const CYCLE_PRESETS: Record<string, CycleTile[]> = {
  TTR: ['T', 'T', 'R'],
  TTTRTTR: ['T', 'T', 'T', 'R', 'T', 'T', 'R'],
  TR: ['T', 'R'],
  TTRTR: ['T', 'T', 'R', 'T', 'R'],
};

/** Checks a schedule the user built. Returns the first problem, or null when it is fine. */
export function scheduleProblem(s: Schedule, nested = false): ScheduleError | null {
  switch (s.mode) {
    case 'weekdays':
      return s.weekdays.every((d) => isInt(d, 0, 6)) ? null : 'weekday_range';
    case 'cycle':
      if (!isInt(s.pattern.length, CYCLE_MIN, CYCLE_MAX) || !s.pattern.every(isTile)) return 'cycle_length';
      if (!isDayKey(s.startDate)) return 'bad_date';
      return s.pattern.includes('T') ? null : 'no_training_day';
    case 'every_n':
      return isInt(s.n, 1, EVERY_N_MAX) ? null : 'every_n_range';
    case 'floating':
      if (!isInt(s.maxPerWeek, 1, MAX_PER_WEEK_MAX)) return 'floating_range';
      return s.minRestDays === undefined || isInt(s.minRestDays, 0, MIN_REST_MAX) ? null : 'floating_range';
    case 'ab_weeks': {
      if (nested) return 'nested';
      for (const sub of [s.weekA, s.weekB]) {
        if (sub.mode !== 'weekdays' && sub.mode !== 'cycle') return 'nested';
        const p = scheduleProblem(sub, true);
        if (p) return p;
      }
      return null;
    }
  }
}

/** Reads a stored `routine.schedule` (typed `unknown`). A bad value is dropped, never thrown. */
export function parseSchedule(raw: unknown): Schedule | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  let s: Schedule | undefined;
  if (r.mode === 'weekdays' && Array.isArray(r.weekdays)) s = { mode: 'weekdays', weekdays: r.weekdays as number[] };
  else if (r.mode === 'cycle' && Array.isArray(r.pattern) && typeof r.startDate === 'string') s = { mode: 'cycle', pattern: r.pattern as CycleTile[], startDate: r.startDate };
  else if (r.mode === 'every_n' && typeof r.n === 'number') s = { mode: 'every_n', n: r.n };
  else if (r.mode === 'floating' && typeof r.maxPerWeek === 'number') s = { mode: 'floating', maxPerWeek: r.maxPerWeek, ...(typeof r.minRestDays === 'number' ? { minRestDays: r.minRestDays } : {}) };
  else if (r.mode === 'ab_weeks') {
    const a = parseSchedule(r.weekA);
    const b = parseSchedule(r.weekB);
    if (a && b) s = { mode: 'ab_weeks', weekA: a, weekB: b };
  }
  return s && scheduleProblem(s) === null ? s : undefined;
}

export function parseMeta(raw: unknown): ScheduleMeta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const weeks = Array.isArray(r.deloadWeeks) ? (r.deloadWeeks as unknown[]).filter((x): x is string => typeof x === 'string' && isDayKey(x)) : [];
  return {
    deloadWeeks: [...new Set(weeks)].sort(),
    ...(typeof r.anchorDate === 'string' && isDayKey(r.anchorDate) ? { anchorDate: r.anchorDate } : {}),
    ...(typeof r.savedOn === 'string' && isDayKey(r.savedOn) ? { savedOn: r.savedOn } : {}),
  };
}

/** ex. 13: no `schedule` but the older `weekdays` list behaves as fixed weekdays; neither = no schedule ("flexible"). */
export function effectiveSchedule(routine: { schedule?: unknown; weekdays?: number[] }): Schedule | undefined {
  const s = parseSchedule(routine.schedule);
  if (s) return s;
  const wd = (routine.weekdays ?? []).filter((d) => isInt(d, 0, 6));
  return wd.length > 0 ? { mode: 'weekdays', weekdays: wd } : undefined;
}

// ---------------------------------------------------------------- weeks

export type WeekStart = 'mon' | 'sun';

/** First day of the display week that contains `date`. */
export function weekStartOf(date: DayKey, weekStart: WeekStart = 'mon'): DayKey {
  const wd = weekdayOfKey(date); // 0 = Mon
  const back = weekStart === 'mon' ? wd : (wd + 1) % 7;
  return addDays(date, -back);
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;

// ---------------------------------------------------------------- the plan for one date

export type Kind = 'T' | 'A' | 'M' | 'R';
/** `open` = decided by the recovery clock (floating); `none` = no schedule. */
export type DateKind = Kind | 'open' | 'none';

export interface PlanContext {
  today: DayKey;
  weekStart?: WeekStart;
  meta?: ScheduleMeta;
  /** IST day keys of finished sessions. */
  sessionDates?: readonly string[];
  /** Per-date choices: `rest` = chosen rest day, `train` = "move here". */
  overrides?: Readonly<Record<string, 'rest' | 'train'>>;
}

const lastSession = (dates: readonly string[] | undefined, before?: DayKey): DayKey | undefined => {
  const list = (dates ?? []).filter((d) => before === undefined || d <= before).sort();
  return list[list.length - 1];
};

function everyNDue(n: number, today: DayKey, dates: readonly string[] | undefined): DayKey {
  const last = lastSession(dates);
  if (!last) return today;
  const due = addDays(last, n);
  return due < today ? today : due;
}

/** What the plan says about one date, ignoring local overrides. */
export function baseKind(s: Schedule | undefined, date: DayKey, ctx: PlanContext): DateKind {
  if (!s) return 'none';
  switch (s.mode) {
    case 'weekdays':
      return s.weekdays.length === 0 ? 'none' : s.weekdays.includes(weekdayOfKey(date)) ? 'T' : 'R';
    case 'cycle':
      return s.pattern[mod(daysBetween(s.startDate, date), s.pattern.length)] ?? 'R';
    case 'every_n': {
      // Today is due when n or more days passed since the last session (or there is none); future dates project forward.
      // Past dates are never planned (there is no fixed date to miss).
      if (date < ctx.today) return 'R';
      if (date === ctx.today) {
        const last = lastSession(ctx.sessionDates);
        return !last || daysBetween(last, date) >= s.n ? 'T' : 'R';
      }
      const diff = daysBetween(everyNDue(s.n, ctx.today, ctx.sessionDates), date);
      return diff >= 0 && diff % s.n === 0 ? 'T' : 'R';
    }
    case 'floating':
      return 'open';
    case 'ab_weeks': {
      const ws = ctx.weekStart ?? 'mon';
      const anchor = ctx.meta?.anchorDate ?? ctx.meta?.savedOn ?? ctx.today;
      const weeks = floorDiv(daysBetween(weekStartOf(anchor, ws), weekStartOf(date, ws)), 7);
      return baseKind(mod(weeks, 2) === 0 ? s.weekA : s.weekB, date, ctx);
    }
  }
}

export function kindOn(s: Schedule | undefined, date: DayKey, ctx: PlanContext): DateKind {
  const o = ctx.overrides?.[date];
  if (o === 'rest') return 'R';
  if (o === 'train') return 'T';
  return baseKind(s, date, ctx);
}

// ---------------------------------------------------------------- which Day

export interface PlanDay {
  id: string;
  name: string;
  targetMuscles: string[];
}

/** The Day whose turn it is: `pointer` wraps around. */
export const dayAt = (days: readonly PlanDay[], pointer: number): PlanDay | undefined => (days.length === 0 ? undefined : days[mod(pointer, days.length)]);

/** The pointer after finishing, or skipping on purpose, the Day at `index` (ex. 8). */
export const pointerAfter = (index: number, count: number): number => (count <= 0 ? 0 : mod(index + 1, count));

export interface WeekCell {
  date: DayKey;
  kind: DateKind;
  /** Index into the routine's days for a training date. */
  dayIndex?: number;
  today: boolean;
  /** Planned, in the past, no session (shown with a small dash). */
  missed?: boolean;
  deload: boolean;
}

export interface PlanInput {
  schedule?: Schedule;
  days: readonly PlanDay[];
  pointer: number;
  today: DayKey;
  weekStart?: WeekStart;
  meta?: ScheduleMeta;
  sessionDates?: readonly string[];
  overrides?: Readonly<Record<string, 'rest' | 'train'>>;
  /** Missed dates the user already decided about (and so never come back). */
  decided?: readonly string[];
}

/** The plan context from the user's own choices only (no automatic shifts). */
const userCtxOf = (i: PlanInput): PlanContext => ({
  today: i.today,
  ...(i.weekStart ? { weekStart: i.weekStart } : {}),
  ...(i.meta ? { meta: i.meta } : {}),
  ...(i.sessionDates ? { sessionDates: i.sessionDates } : {}),
  ...(i.overrides ? { overrides: i.overrides } : {}),
});

/** Modes with fixed dates, where a rest date can be given up so the training days slide forward. */
const isFixed = (s: Schedule | undefined): boolean => !!s && (s.mode === 'weekdays' || s.mode === 'cycle' || s.mode === 'ab_weeks');
/** How far ahead to look for a rest date to give up. */
export const SHIFT_AHEAD = 14;

/** First rest date ('R') from `from` on, looking `SHIFT_AHEAD` days ahead. */
function firstRest(s: Schedule | undefined, from: DayKey, ctx: PlanContext): DayKey | undefined {
  for (let n = 0; n < SHIFT_AHEAD; n++) {
    const d = addDays(from, n);
    if (kindOn(s, d, ctx) === 'R') return d;
  }
  return undefined;
}

/**
 * Planned training dates nobody logged count as rest, and the plan slides forward: each one uses up the next rest date
 * (Mon to Fri trained, Thursday missed: Saturday becomes a training day). Worked out from the sessions every time, so logging
 * the missed day later (or editing a date) puts the plan back. Not applied after a long break (the Welcome back card handles that),
 * to dates the user already decided about, or to "every N", floating and no-plan schedules.
 */
export function autoShifts(i: PlanInput): Record<string, 'train'> {
  const s = i.schedule;
  if (!isFixed(s) || !i.sessionDates) return {}; // without the list of logged sessions nothing can be called missed
  const base = userCtxOf(i);
  const since = i.meta?.savedOn ?? addDays(i.today, -14);
  const lo = since > addDays(i.today, -14) ? since : addDays(i.today, -14);
  const done = new Set(i.sessionDates ?? []);
  const decided = new Set(i.decided ?? []);
  let streak = 0;
  for (let d = addDays(i.today, -1); d >= lo; d = addDays(d, -1)) {
    if (kindOn(s, d, base) !== 'T') continue;
    if (done.has(d)) break;
    streak++;
  }
  if (streak > BREAK_AFTER) return {};
  const out: Record<string, 'train'> = {};
  for (let d = lo; d < i.today; d = addDays(d, 1)) {
    // Only days the plan really asked for count; a make-up date nobody used just goes away (no chain reaction).
    if (kindOn(s, d, base) !== 'T' || done.has(d) || decided.has(d)) continue;
    const ctx: PlanContext = { ...base, overrides: { ...out, ...(i.overrides ?? {}) } };
    const target = firstRest(s, addDays(d, 1), ctx);
    if (!target) break;
    out[target] = 'train';
  }
  return out;
}

const ctxOf = (i: PlanInput): PlanContext => {
  const c = userCtxOf(i);
  const auto = autoShifts(i);
  return Object.keys(auto).length === 0 ? c : { ...c, overrides: { ...auto, ...(i.overrides ?? {}) } };
};

/**
 * The choices to store when the user rests on `date`: that date becomes a rest day and the next rest date becomes a training
 * day, so no training day is lost (1 2 3 4 5 r r becomes 1 2 3 r 4 5 r). With no rest date left, the days just move later.
 */
export function restShift(i: PlanInput, date: DayKey): Record<string, 'rest' | 'train'> {
  const out: Record<string, 'rest' | 'train'> = { [date]: 'rest' };
  if (!isFixed(i.schedule)) return out;
  const ctx: PlanContext = { ...ctxOf(i), overrides: { ...ctxOf(i).overrides, [date]: 'rest' } };
  const target = firstRest(i.schedule, addDays(date, 1), ctx);
  if (target) out[target] = 'train';
  return out;
}

/** The next `count` dates from today (ex. 2: the Days rotate across training dates, not weekdays). Floating shows `open`. */
export function weekCells(i: PlanInput, count = 7): WeekCell[] {
  const ctx = ctxOf(i);
  const cells: WeekCell[] = [];
  let k = 0;
  for (let n = 0; n < count; n++) {
    const date = addDays(i.today, n);
    const kind = kindOn(i.schedule, date, ctx);
    const cell: WeekCell = { date, kind, today: n === 0, deload: isDeloadWeek(i.meta, date, i.weekStart) };
    if (kind === 'T' && i.days.length > 0) cell.dayIndex = mod(i.pointer + k++, i.days.length);
    cells.push(cell);
  }
  return cells;
}

/** The first training date after today (looking up to 14 days ahead) and its Day, for "Rest day. Next: Legs on Fri." */
export function nextTraining(i: PlanInput): { date: DayKey; dayIndex: number } | undefined {
  const cells = weekCells(i, 15).slice(1);
  const hit = cells.find((c) => c.kind === 'T' && c.dayIndex !== undefined);
  return hit && hit.dayIndex !== undefined ? { date: hit.date, dayIndex: hit.dayIndex } : undefined;
}

/** The cycle tiles for the Cycle view: one row, today's tile marked. */
export function cycleTiles(s: Extract<Schedule, { mode: 'cycle' }>, today: DayKey): { tile: CycleTile; today: boolean }[] {
  const at = mod(daysBetween(s.startDate, today), s.pattern.length);
  return s.pattern.map((tile, idx) => ({ tile, today: idx === at }));
}

// ---------------------------------------------------------------- missed days

export interface MissedResult {
  /** Planned training dates before today with no session and no decision, oldest first. */
  dates: DayKey[];
  /** Planned days missed in a row (ignoring rest dates), counted back from yesterday. */
  inARow: number;
  /** More than BREAK_AFTER in a row: show one "Welcome back" card, no sheets. */
  welcomeBack: boolean;
}

/** Only fixed-date modes (weekdays, cycle, A/B of those) can miss a day; "every N", floating and none never do. */
export function missedDays(i: PlanInput, since: DayKey): MissedResult {
  const none: MissedResult = { dates: [], inARow: 0, welcomeBack: false };
  const s = i.schedule;
  if (!s || s.mode === 'every_n' || s.mode === 'floating') return none;
  const ctx = userCtxOf(i);
  const done = new Set(i.sessionDates ?? []);
  const decided = new Set(i.decided ?? []);
  const lo = since > addDays(i.today, -14) ? since : addDays(i.today, -14);
  const dates: DayKey[] = [];
  let streak = 0;
  let counting = true;
  for (let d = addDays(i.today, -1); d >= lo; d = addDays(d, -1)) {
    const kind = kindOn(s, d, ctx);
    if (kind !== 'T') continue;
    const missed = !done.has(d);
    if (missed && !decided.has(d)) dates.unshift(d);
    if (counting && missed) streak++;
    else counting = false;
  }
  return { dates, inARow: streak, welcomeBack: streak > BREAK_AFTER };
}

// ---------------------------------------------------------------- recovery, floating, hints

export type RecoveryState = 'fresh' | 'ready' | 'recovering' | 'fatigued';
export type RecoveryStates = Readonly<Record<string, RecoveryState>>;
const SCORE: Record<RecoveryState, number> = { fresh: 3, ready: 2, recovering: 1, fatigued: 0 };

export const hasRecovery = (r?: RecoveryStates): boolean => !!r && Object.keys(r).length > 0;

/** Mean of the Day's target muscles' scores (ex. 6). Undefined when there is nothing to score. */
export function readiness(day: PlanDay, r?: RecoveryStates): number | undefined {
  if (!hasRecovery(r)) return undefined;
  const scores = day.targetMuscles.map((m) => r![m]).filter((s): s is RecoveryState => s !== undefined).map((s) => SCORE[s]);
  return scores.length === 0 ? undefined : scores.reduce((a, b) => a + b, 0) / scores.length;
}

export interface RankedDay {
  index: number;
  score: number;
}

/** Days best-first by readiness; ties keep rotation order starting at the pointer. Empty when there is no data. */
export function rankDays(days: readonly PlanDay[], pointer: number, r?: RecoveryStates): RankedDay[] {
  const out: RankedDay[] = [];
  for (let k = 0; k < days.length; k++) {
    const index = mod(pointer + k, days.length);
    const score = readiness(days[index]!, r);
    if (score !== undefined) out.push({ index, score });
  }
  return out.sort((a, b) => b.score - a.score); // Array.sort is stable: rotation order breaks ties
}

export interface Hint {
  /** The fatigued target muscles, in the Day's order. */
  muscles: string[];
}

/** ex. 10: hint when >= 60% of the Day's target muscles are fatigued. Hidden with no data, no targets, or when off. */
export function restHint(day: PlanDay | undefined, r: RecoveryStates | undefined, enabled: boolean): Hint | undefined {
  if (!enabled || !day || day.targetMuscles.length === 0 || !hasRecovery(r)) return undefined;
  const tired = day.targetMuscles.filter((m) => r![m] === 'fatigued');
  return tired.length / day.targetMuscles.length >= HINT_SHARE ? { muscles: tired } : undefined;
}

export const sessionsInWeek = (dates: readonly string[] | undefined, today: DayKey, ws: WeekStart = 'mon'): number => {
  const start = weekStartOf(today, ws);
  const end = addDays(start, 6);
  return (dates ?? []).filter((d) => d >= start && d <= end).length;
};

// ---------------------------------------------------------------- Today

export type TodayKind = 'train' | 'active' | 'mobility' | 'rest' | 'suggest' | 'no_days';

export interface TodayPlan {
  kind: TodayKind;
  /** The Day to offer (train, suggest, and the best Day for a rest date's "start another"). */
  dayIndex?: number;
  /** Rest dates: the next training date and Day. */
  next?: { date: DayKey; dayIndex: number };
  /** Floating with recovery data: which line to show. */
  line?: 'most_recovered' | 'all_recovering' | 'rotation';
  /** Floating cap reached (still startable). */
  cap?: number;
  /** Every-N: the Day is due. */
  due?: boolean;
  deload: boolean;
}

export interface TodayInput extends PlanInput {
  recovery?: RecoveryStates;
  /** The user chose "Rest" on the hint for today (counts as shift: nothing moves). */
  restChosen?: boolean;
}

/** What the Today card shows (ex. 1, 3, 5, 6, 12, 13). Nothing here blocks starting any Day. */
export function todayPlan(input: TodayInput): TodayPlan {
  // "Rest" on the hint is a chosen rest date: the pointer does not move, so the Day stays next (ex. 11).
  const i: TodayInput = input.restChosen ? { ...input, overrides: { ...input.overrides, [input.today]: 'rest' } } : input;
  const deload = isDeloadWeek(i.meta, i.today, i.weekStart);
  if (i.days.length === 0) return { kind: 'no_days', deload };
  const s = i.schedule;
  const base = { deload };

  if (!s || (s.mode === 'weekdays' && s.weekdays.length === 0)) {
    // ex. 13: "No plan today. Here is a good one." Best readiness when data exists, else the rotation.
    const best = rankDays(i.days, i.pointer, i.recovery)[0];
    return { kind: 'suggest', dayIndex: best ? best.index : mod(i.pointer, i.days.length), ...base };
  }

  if (s.mode === 'floating') {
    const fl = s;
    const done = sessionsInWeek(i.sessionDates, i.today, i.weekStart);
    const last = lastSession(i.sessionDates);
    const gap = last === undefined ? Infinity : daysBetween(last, i.today);
    const capped = done >= fl.maxPerWeek;
    if (hasRecovery(i.recovery)) {
      const ranked = rankDays(i.days, i.pointer, i.recovery);
      const best = ranked[0];
      if (best) {
        const line = best.score < 1 ? 'all_recovering' : 'most_recovered';
        return { kind: 'suggest', dayIndex: best.index, line, ...(capped ? { cap: fl.maxPerWeek } : {}), ...base };
      }
    }
    const rested = gap > (fl.minRestDays ?? 1);
    if (!capped && rested) return { kind: 'train', dayIndex: mod(i.pointer, i.days.length), line: 'rotation', ...base };
    const rotation = mod(i.pointer, i.days.length);
    return { kind: capped ? 'suggest' : 'rest', dayIndex: rotation, line: 'rotation', ...(capped ? { cap: fl.maxPerWeek } : {}), ...base };
  }

  const cell = weekCells(i, 1)[0]!;
  const kind: DateKind = cell.kind;
  if (kind === 'T') {
    const everyN = s.mode === 'every_n';
    return { kind: 'train', dayIndex: cell.dayIndex ?? mod(i.pointer, i.days.length), ...(everyN ? { due: true } : {}), ...base };
  }
  if (kind === 'A') return { kind: 'active', ...base };
  if (kind === 'M') return { kind: 'mobility', ...base };
  const next = nextTraining(i);
  return { kind: 'rest', dayIndex: mod(i.pointer, i.days.length), ...(next ? { next } : {}), ...base };
}

// ---------------------------------------------------------------- deload

/** The ISO date of the week start used to store/compare deload weeks (display week start applies). */
export const isDeloadWeek = (meta: ScheduleMeta | undefined, date: DayKey, ws: WeekStart = 'mon'): boolean => {
  if (!meta || meta.deloadWeeks.length === 0) return false;
  const start = weekStartOf(date, ws);
  return meta.deloadWeeks.some((w) => weekStartOf(w, ws) === start);
};

export const DEFAULT_SETS_PCT = 60;
export const DEFAULT_LOAD_PCT = 90;

/** Sets in a deload week: scaled, rounded, never below 1 (ex. 9). Suggestions only; the plan is not changed. */
export const deloadSets = (sets: number, pct = DEFAULT_SETS_PCT): number => Math.max(1, Math.round((sets * pct) / 100));
/** Load in a deload week, 2 dp (ex. 9). */
export const deloadLoad = (kg: number, pct = DEFAULT_LOAD_PCT): number => roundKg((kg * pct) / 100);

export function toggleDeloadWeek(meta: ScheduleMeta, date: DayKey, ws: WeekStart = 'mon'): ScheduleMeta {
  const start = weekStartOf(date, ws);
  const has = meta.deloadWeeks.some((w) => weekStartOf(w, ws) === start);
  const weeks = has ? meta.deloadWeeks.filter((w) => weekStartOf(w, ws) !== start) : [...meta.deloadWeeks, start].sort();
  return { ...meta, deloadWeeks: weeks };
}

// ---------------------------------------------------------------- settings (SC5)

export interface ScheduleSettings {
  hints: boolean;
  missed: 'shift' | 'skip';
  weekStart: WeekStart;
  setsPct: number;
  loadPct: number;
}

export const DEFAULT_SETTINGS: ScheduleSettings = { hints: true, missed: 'shift', weekStart: 'mon', setsPct: DEFAULT_SETS_PCT, loadPct: DEFAULT_LOAD_PCT };

const step5 = (v: unknown, lo: number, hi: number, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v / 5) * 5)) : dflt);

/** Normalises stored settings: anything unknown falls back to the default. */
export function parseSettings(raw: unknown): ScheduleSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    hints: typeof r.hints === 'boolean' ? r.hints : DEFAULT_SETTINGS.hints,
    missed: r.missed === 'skip' ? 'skip' : 'shift',
    weekStart: r.weekStart === 'sun' ? 'sun' : 'mon',
    setsPct: step5(r.setsPct, 40, 100, DEFAULT_SETS_PCT),
    loadPct: step5(r.loadPct, 70, 100, DEFAULT_LOAD_PCT),
  };
}

export const isDefaultSettings = (s: ScheduleSettings): boolean =>
  s.hints === DEFAULT_SETTINGS.hints && s.missed === DEFAULT_SETTINGS.missed && s.weekStart === DEFAULT_SETTINGS.weekStart && s.setsPct === DEFAULT_SETTINGS.setsPct && s.loadPct === DEFAULT_SETTINGS.loadPct;

/** The "Reset to defaults" button only resets the two deload numbers (it is under "Deload scaling"). */
export const deloadIsDefault = (s: ScheduleSettings): boolean => s.setsPct === DEFAULT_SETS_PCT && s.loadPct === DEFAULT_LOAD_PCT;

// ---------------------------------------------------------------- active recovery / mobility picks

export interface PickRow {
  slug: string;
  category: string;
  subCategory: string;
}

/**
 * ex. 12: 2 to 3 light items from real dataset categories (nothing invented).
 * Mobility: category `recovery` or sub-category `mobility`. Active recovery: those plus `cardio_machine`.
 * The pick is stable for a date (the date picks where in the sorted list it starts).
 */
export function recoveryPicks(kind: 'active' | 'mobility', rows: readonly PickRow[], date: DayKey, count = 3): string[] {
  const light = rows.filter((r) => r.category === 'recovery' || r.subCategory === 'mobility');
  const cardio = kind === 'active' ? rows.filter((r) => r.subCategory === 'cardio_machine') : [];
  const pool = [...new Set([...light, ...cardio].map((r) => r.slug))].sort();
  if (pool.length === 0) return [];
  const start = mod(daysBetween('2026-01-01', date), pool.length);
  return Array.from({ length: Math.min(count, pool.length) }, (_, k) => pool[(start + k) % pool.length]!);
}

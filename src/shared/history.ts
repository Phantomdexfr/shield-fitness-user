// Session summary, history calendar and PR wall (Phase 39). Pure: no DOM, no storage, no clock (time is a parameter).
// Days are IST day keys (`YYYY-MM-DD`); a session belongs to the IST day it STARTED on.

import { addDays, dayKeyStart, istDayKey, weekdayOfKey, type DayKey } from './dates';
import { sessionStats } from './engine/sessionStats';
import type { EngineSet } from './engine/sessionStats';
import { PR_METRICS, type BoardCard, type PRMetric } from './pr';
import { isOpen, type Session } from './session';

// ---------- summary numbers ----------

export interface SummaryStats {
  /** Whole minutes from start to end (0 when not ended; never negative). */
  minutes: number;
  workingSets: number;
  /** Sum of weight x reps over working sets, kg. */
  volume: number;
  totalReps: number;
  /** Items with at least one working set. */
  exercises: number;
  skipped: number;
  /** Heaviest working weight across the session, kg (0 = bodyweight only). */
  topWeight: number;
}

/** What the summary and a history entry show about one session. Warm-ups never count (the stats engine drops them). */
export function summaryOf(s: Session): SummaryStats {
  const all: EngineSet[] = s.items.flatMap((it) => it.sets as EngineSet[]);
  const st = sessionStats(all);
  const start = Date.parse(s.startedAt);
  const end = s.endedAt ? Date.parse(s.endedAt) : start;
  return {
    minutes: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60000)) : 0,
    workingSets: st.workingSets,
    volume: st.volume,
    totalReps: st.totalReps,
    exercises: s.items.filter((it) => sessionStats(it.sets as EngineSet[]).workingSets > 0).length,
    skipped: s.items.filter((it) => it.status === 'skipped').length,
    topWeight: st.topWeight,
  };
}

/** Compact volume text: 12,450 kg stays whole; kilo-tonnes are not used (a gym number should read exactly). */
export const volumeText = (kg: number): string => `${Math.round(kg).toLocaleString('en-IN')} kg`;

// ---------- muscles hit (mini body) ----------

/** A muscle map row as the dataset stores it: `[muscleId, role, emphasis]` with role p / s / t. */
export type MapRowLike = readonly [string, string, string, ...unknown[]];

/**
 * Muscles trained in a session for the read-only mini body: primary beats secondary, stabilisers count as secondary.
 * `perExercise` is one list of map rows per trained exercise (the caller skips exercises with no working set).
 */
export function musclesHit(perExercise: ReadonlyArray<readonly MapRowLike[]>): Record<string, 'primary' | 'secondary'> {
  const out: Record<string, 'primary' | 'secondary'> = {};
  for (const rows of perExercise) {
    for (const [id, role] of rows) {
      if (role === 'p') out[id] = 'primary';
      else if ((role === 's' || role === 't') && out[id] !== 'primary') out[id] = 'secondary';
    }
  }
  return out;
}

// ---------- history list + calendar ----------

/** The IST day a session started on. */
export const dayOfSession = (s: Session): DayKey => istDayKey(Date.parse(s.startedAt));

/** Finished sessions that have something to show (an item), newest first. Open sessions are not history yet. */
export function finishedSessions(list: readonly Session[]): Session[] {
  return list.filter((s) => !isOpen(s) && s.items.length > 0).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export interface DayGroup {
  day: DayKey;
  sessions: Session[];
}

/** Sessions grouped by IST start day, newest day first, newest session first inside a day. */
export function groupByDay(list: readonly Session[]): DayGroup[] {
  const map = new Map<DayKey, Session[]>();
  for (const s of finishedSessions(list)) {
    const k = dayOfSession(s);
    const g = map.get(k);
    if (g) g.push(s);
    else map.set(k, [s]);
  }
  return [...map].map(([day, sessions]) => ({ day, sessions })).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

export const monthOfDay = (day: DayKey): string => day.slice(0, 7);

/** `YYYY-MM` moved by whole months (negative = back). */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(idx / 12)).padStart(4, '0')}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export interface CalendarCell {
  /** null for the blank cells before the 1st and after the last day. */
  day: DayKey | null;
  /** Day of month, 0 for blanks. */
  n: number;
  /** Finished sessions that started that day. */
  count: number;
}

/**
 * A Monday-first month grid (weeks of 7). `counts` maps day -> sessions. Always whole weeks; 4 to 6 rows.
 * Blank cells keep the columns aligned with the weekday header.
 */
export function monthGrid(ym: string, counts: ReadonlyMap<DayKey, number>): CalendarCell[][] {
  const first = `${ym}-01`;
  const next = `${shiftMonth(ym, 1)}-01`;
  const length = Math.round((dayKeyStart(next) - dayKeyStart(first)) / 86_400_000);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < weekdayOfKey(first); i++) cells.push({ day: null, n: 0, count: 0 });
  for (let d = 0; d < length; d++) {
    const day = addDays(first, d);
    cells.push({ day, n: d + 1, count: counts.get(day) ?? 0 });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, n: 0, count: 0 });
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Day -> number of finished sessions, for the calendar dots. */
export function countByDay(list: readonly Session[]): Map<DayKey, number> {
  const m = new Map<DayKey, number>();
  for (const s of finishedSessions(list)) m.set(dayOfSession(s), (m.get(dayOfSession(s)) ?? 0) + 1);
  return m;
}

// ---------- PR wall ----------

export interface WallEntry {
  key: string;
  slug: string;
  grip?: string;
  metric: PRMetric;
  value: number;
  /** IST day the record was set. */
  day: DayKey;
}

/** Every current record on one list, newest first (ties: board order, then metric order). */
export function prWall(board: readonly BoardCard[]): WallEntry[] {
  const out: WallEntry[] = [];
  for (const c of board) {
    for (const m of PR_METRICS) {
      const value = c.records[m];
      const day = c.dates[m];
      if (value != null && day) out.push({ key: c.key, slug: c.slug, ...(c.grip ? { grip: c.grip } : {}), metric: m, value, day });
    }
  }
  return out.map((e, i) => ({ e, i })).sort((a, b) => (a.e.day === b.e.day ? a.i - b.i : a.e.day < b.e.day ? 1 : -1)).map((x) => x.e);
}

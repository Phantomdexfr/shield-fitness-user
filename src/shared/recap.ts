// Recap cards (Phase 61): year-in-review numbers for any date range, and "muscle of the week". Pure: no DOM, no storage, no clock.
// Days are IST day keys. A session belongs to the IST day it STARTED on. Only finished sessions count; warm-up and drop sets are
// not working sets (engine `isWorking`), so they never count here either.

import { addDays, daysBetween, isDayKey, weekdayOfKey, type DayKey } from './dates';
import { setWeight, workingSets, type EngineSet } from './engine/sessionStats';
import { dayOfSession, finishedSessions, type MapRowLike } from './history';
import { sessionPRs, type PRMetric } from './pr';
import { refId, type Session } from './session';
import { roundKg } from './units';

export interface RecapRange {
  from: DayKey;
  to: DayKey;
}

/** 1 January to 31 December of `year`. */
export const yearRange = (year: number): RecapRange => ({ from: `${String(year).padStart(4, '0')}-01-01`, to: `${String(year).padStart(4, '0')}-12-31` });

/** The `days` days ending on `today` (inclusive). */
export const lastDaysRange = (today: DayKey, days: number): RecapRange => ({ from: addDays(today, -(Math.max(1, Math.floor(days)) - 1)), to: today });

/** A range is usable when both keys are real days and from <= to. */
export function validRange(r: RecapRange): boolean {
  return isDayKey(r.from) && isDayKey(r.to) && r.from <= r.to;
}

export const inRange = (day: DayKey, r: RecapRange): boolean => day >= r.from && day <= r.to;

/** What the recap needs to know about an exercise, supplied by the caller (the data layer reads the dataset). */
export interface RecapDeps {
  /** Slug for an item reference (custom exercises map to their own slug). */
  slugOf: (ref: Session['items'][number]['ref']) => string;
  /** Muscle map rows `[muscleId, role, emphasis]` of an exercise; empty when unknown. */
  musclesOf: (slug: string) => readonly MapRowLike[];
  /** Slug of a custom exercise id (for judging PRs); omit when there are none. */
  customSlug?: (id: string) => string | undefined;
}

export interface RecapStats {
  range: RecapRange;
  sessions: number;
  workingSets: number;
  /** Sum of weight x reps over working sets, kg (2 dp). */
  volume: number;
  /** Heaviest working-set weight in the range; null when no set had a weight. */
  heaviest: { slug: string; kg: number; day: DayKey } | null;
  /** Muscle with the most working sets credited as primary; null when nothing is known. */
  mostTrained: { id: string; sets: number } | null;
  /** Least-trained among muscles that got at least one primary set (a muscle with zero sets is never "the least"); null unless 2+ muscles. */
  leastTrained: { id: string; sets: number } | null;
  /** Longest run of consecutive IST days with a session, inside the range. */
  longestStreakDays: number;
  /** Exercise done in the most sessions (ties: more working sets, then slug). */
  favourite: { slug: string; sessions: number } | null;
  /** The weight record with the biggest gain over its previous value, set inside the range. */
  biggestPr: { slug: string; metric: PRMetric; value: number; previous: number; day: DayKey } | null;
}

/** Longest run of consecutive days in a set of day keys. */
export function longestRun(days: Iterable<DayKey>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const d of sorted) {
    run = prev !== null && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** Numbers for the year-in-review cards. `all` is every session (history is needed to judge PRs); only those inside `range` are counted. */
export function computeRecap(all: readonly Session[], range: RecapRange, deps: RecapDeps, separateByGrip = false): RecapStats {
  const mine = finishedSessions([...all]).filter((s) => inRange(dayOfSession(s), range));
  let sets = 0;
  let volume = 0;
  let heaviest: RecapStats['heaviest'] = null;
  const muscleSets = new Map<string, number>();
  const exSessions = new Map<string, { sessions: number; sets: number }>();
  for (const s of mine) {
    const day = dayOfSession(s);
    const seen = new Set<string>();
    for (const it of s.items) {
      if (it.status === 'skipped') continue;
      const ws = workingSets(it.sets as EngineSet[]);
      if (ws.length === 0) continue;
      const slug = deps.slugOf(it.ref);
      sets += ws.length;
      for (const w of ws) {
        const kg = setWeight(w);
        volume += kg * (w.reps as number);
        if (kg > 0 && (heaviest === null || kg > heaviest.kg)) heaviest = { slug, kg: roundKg(kg), day };
      }
      for (const row of deps.musclesOf(slug)) {
        if (row[1] === 'p') muscleSets.set(row[0], (muscleSets.get(row[0]) ?? 0) + ws.length);
      }
      const e = exSessions.get(slug) ?? { sessions: 0, sets: 0 };
      e.sets += ws.length;
      if (!seen.has(slug)) {
        seen.add(slug);
        e.sessions += 1;
      }
      exSessions.set(slug, e);
    }
  }
  const byMuscle = [...muscleSets].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const byFav = [...exSessions].sort((a, b) => b[1].sessions - a[1].sessions || b[1].sets - a[1].sets || (a[0] < b[0] ? -1 : 1));

  // Biggest PR: judge each session against the sessions before it, keep weight records that beat an earlier weight.
  let biggest: RecapStats['biggestPr'] = null;
  let gain = 0;
  for (const s of [...mine].reverse()) {
    for (const pr of sessionPRs(s, all, separateByGrip, deps.customSlug ?? (() => undefined))) {
      for (const h of pr.hits) {
        if (h.metric !== 'weight' || h.previous == null) continue;
        const g = h.value - h.previous;
        if (g > gain) {
          gain = g;
          biggest = { slug: pr.slug, metric: h.metric, value: h.value, previous: h.previous, day: dayOfSession(s) };
        }
      }
    }
  }

  return {
    range,
    sessions: mine.length,
    workingSets: sets,
    volume: roundKg(volume),
    heaviest,
    mostTrained: byMuscle[0] ? { id: byMuscle[0][0], sets: byMuscle[0][1] } : null,
    leastTrained: byMuscle.length >= 2 ? { id: byMuscle[byMuscle.length - 1]![0], sets: byMuscle[byMuscle.length - 1]![1] } : null,
    longestStreakDays: longestRun(mine.map(dayOfSession)),
    favourite: byFav[0] ? { slug: byFav[0][0], sessions: byFav[0][1].sessions } : null,
    biggestPr: biggest,
  };
}

export type RecapCardKind = 'totals' | 'heaviest' | 'muscles' | 'streak' | 'favourite' | 'pr';

/** The cards to show, in order. A card with no data is left out; no sessions in the range = no cards. */
export function recapCards(s: RecapStats): RecapCardKind[] {
  if (s.sessions === 0) return [];
  const out: RecapCardKind[] = ['totals'];
  if (s.heaviest) out.push('heaviest');
  if (s.mostTrained) out.push('muscles');
  out.push('streak');
  if (s.favourite) out.push('favourite');
  if (s.biggestPr) out.push('pr');
  return out;
}

// ---------- muscle of the week ----------

/** ISO-8601 week of an IST day: the week belongs to the year of its Thursday. */
export function isoWeekOf(day: DayKey): { year: number; week: number } {
  const thursday = addDays(day, 3 - weekdayOfKey(day));
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(daysBetween(`${thursday.slice(0, 4)}-01-01`, thursday) / 7) + 1;
  return { year, week };
}

export interface WeekMuscle<R> {
  row: R;
  /** The one daily-life fact shown (the first line of the row's `inDailyLife`). */
  fact: string;
  year: number;
  week: number;
}

/**
 * The muscle for the ISO week of `day`: the same unit for everyone, all week, then the next one on Monday. Rows are used in the
 * order given (the atlas file order), so the same week always picks the same row. Rows without a daily-life line are skipped.
 */
export function muscleOfWeek<R extends { inDailyLife: readonly string[] }>(day: DayKey, rows: readonly R[]): WeekMuscle<R> | null {
  const usable = rows.filter((r) => r.inDailyLife.length > 0 && (r.inDailyLife[0] ?? '').trim() !== '');
  if (usable.length === 0) return null;
  const { year, week } = isoWeekOf(day);
  const row = usable[(year * 53 + week) % usable.length] as R;
  return { row, fact: row.inDailyLife[0] as string, year, week };
}

/** Name of a ref for callers that only have the id string (kept here so tests share one helper). */
export const refSlug = (ref: Session['items'][number]['ref']): string => (ref.kind === 'lib' ? ref.slug : refId(ref));

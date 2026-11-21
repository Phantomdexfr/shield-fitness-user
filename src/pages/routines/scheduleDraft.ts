// Draft state of the Schedule editor (SC1). One entry per mode is kept until Save, so a mis-tap loses nothing.
import { isDayKey, type DayKey } from '../../shared/dates';
import { CYCLE_PRESETS, scheduleProblem, type CycleTile, type Schedule, type ScheduleError } from '../../shared/schedule';

export type Mode = 'none' | 'weekdays' | 'cycle' | 'every_n' | 'floating' | 'ab_weeks';
export type SubKind = 'weekdays' | 'cycle';

export interface SubDraft {
  kind: SubKind;
  weekdays: number[];
  pattern: CycleTile[];
  start: DayKey;
}

export interface Draft {
  mode: Mode;
  weekdays: number[];
  pattern: CycleTile[];
  start: DayKey;
  n: number;
  maxPerWeek: number;
  minRest: number;
  a: SubDraft;
  b: SubDraft;
  anchor: DayKey;
}

const sub = (today: DayKey, over: Partial<SubDraft> = {}): SubDraft => ({ kind: 'weekdays', weekdays: [], pattern: [...CYCLE_PRESETS.TTR!], start: today, ...over });

export function emptyDraft(today: DayKey): Draft {
  return {
    mode: 'none', weekdays: [], pattern: [...CYCLE_PRESETS.TTR!], start: today, n: 2, maxPerWeek: 4, minRest: 1,
    a: sub(today), b: sub(today), anchor: today,
  };
}

const fromSub = (s: Schedule, today: DayKey): SubDraft =>
  s.mode === 'cycle' ? sub(today, { kind: 'cycle', pattern: [...s.pattern], start: s.startDate }) : s.mode === 'weekdays' ? sub(today, { kind: 'weekdays', weekdays: [...s.weekdays] }) : sub(today);

/** Fills the draft from a stored schedule. */
export function draftFrom(s: Schedule | undefined, anchor: DayKey | undefined, today: DayKey): Draft {
  const d = emptyDraft(today);
  if (!s) return d;
  d.mode = s.mode;
  if (s.mode === 'weekdays') d.weekdays = [...s.weekdays];
  if (s.mode === 'cycle') {
    d.pattern = [...s.pattern];
    d.start = s.startDate;
  }
  if (s.mode === 'every_n') d.n = s.n;
  if (s.mode === 'floating') {
    d.maxPerWeek = s.maxPerWeek;
    d.minRest = s.minRestDays ?? 1;
  }
  if (s.mode === 'ab_weeks') {
    d.a = fromSub(s.weekA, today);
    d.b = fromSub(s.weekB, today);
    d.anchor = anchor && isDayKey(anchor) ? anchor : today;
  }
  return d;
}

const subSchedule = (s: SubDraft): Schedule => (s.kind === 'cycle' ? { mode: 'cycle', pattern: s.pattern, startDate: s.start } : { mode: 'weekdays', weekdays: [...s.weekdays].sort((x, y) => x - y) });

/** The schedule the draft describes; `undefined` = no schedule (also: fixed weekdays with none chosen). */
export function draftSchedule(d: Draft): Schedule | undefined {
  switch (d.mode) {
    case 'none':
      return undefined;
    case 'weekdays':
      return d.weekdays.length === 0 ? undefined : { mode: 'weekdays', weekdays: [...d.weekdays].sort((x, y) => x - y) };
    case 'cycle':
      return { mode: 'cycle', pattern: d.pattern, startDate: d.start };
    case 'every_n':
      return { mode: 'every_n', n: d.n };
    case 'floating':
      return { mode: 'floating', maxPerWeek: d.maxPerWeek, minRestDays: d.minRest };
    case 'ab_weeks':
      return { mode: 'ab_weeks', weekA: subSchedule(d.a), weekB: subSchedule(d.b) };
  }
}

/** The first problem that blocks Save (only the cycle rules do; everything else is clamped by its control). */
export function draftProblem(d: Draft): ScheduleError | null {
  const s = draftSchedule(d);
  return s ? scheduleProblem(s) : null;
}

export const sameDraft = (a: Draft, b: Draft): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Weekday numbers in the order of the week-start setting. */
export const weekdayOrder = (weekStart: 'mon' | 'sun'): number[] => (weekStart === 'mon' ? [0, 1, 2, 3, 4, 5, 6] : [6, 0, 1, 2, 3, 4, 5]);

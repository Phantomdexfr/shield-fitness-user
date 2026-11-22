// Calendar helpers (Phase 84). Pure: no DOM, no clock, today is always a parameter.
// A day is "YYYY-MM-DD" (the same DayKey as dates.ts), a month is "YYYY-MM". Weeks start on Monday.
import { isDayKey, type DayKey } from './dates';

export const CAL_MIN_YEAR = 1900;
export const CAL_MAX_YEAR = 2100;

export interface Ymd { y: number; m: number; d: number }
export interface GridCell { key: DayKey; day: number; inMonth: boolean }

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Days in a month; `m` is 1 to 12. */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function dayKeyOf(y: number, m: number, d: number): DayKey {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Split a valid day key; null when it is not a real date. */
export function parseDay(key: string): Ymd | null {
  if (!isDayKey(key)) return null;
  return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)), d: Number(key.slice(8, 10)) };
}

/** "YYYY-MM" -> year and month, or null. */
export function parseMonth(key: string): { y: number; m: number } | null {
  const r = /^(\d{4})-(\d{2})$/.exec(key);
  if (!r) return null;
  const y = Number(r[1]);
  const m = Number(r[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

export function monthKeyOf(y: number, m: number): string {
  return `${pad(y, 4)}-${pad(m)}`;
}

/** 0 = Monday ... 6 = Sunday for the 1st of a month. */
export function firstWeekday(y: number, m: number): number {
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}

/** Move a (year, month) by whole months, carrying the year. */
export function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12 + 12) % 12 + 1 };
}

/** Always 42 cells (6 rows of 7), Monday first, leading and trailing days of the next and previous month included. */
export function monthGrid(y: number, m: number): GridCell[] {
  const lead = firstWeekday(y, m);
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const prevDays = daysInMonth(prev.y, prev.m);
  const here = daysInMonth(y, m);
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const n = i - lead + 1;
    if (n < 1) cells.push({ key: dayKeyOf(prev.y, prev.m, prevDays + n), day: prevDays + n, inMonth: false });
    else if (n > here) cells.push({ key: dayKeyOf(next.y, next.m, n - here), day: n - here, inMonth: false });
    else cells.push({ key: dayKeyOf(y, m, n), day: n, inMonth: true });
  }
  return cells;
}

/** A day is allowed when it is a real date and inside [min, max] (either bound may be empty). */
export function inRange(key: DayKey, min?: DayKey, max?: DayKey): boolean {
  if (!isDayKey(key)) return false;
  if (min && key < min) return false;
  if (max && key > max) return false;
  return true;
}

/** Pull a day into [min, max]. */
export function clampDay(key: DayKey, min?: DayKey, max?: DayKey): DayKey {
  if (min && key < min) return min;
  if (max && key > max) return max;
  return key;
}

/** Keep the day-of-month when the month or year changes; 31 Jan moved to Feb becomes 28 or 29 Feb. */
export function fitToMonth(key: DayKey, y: number, m: number): DayKey {
  const p = parseDay(key);
  const d = Math.min(p ? p.d : 1, daysInMonth(y, m));
  return dayKeyOf(y, m, d);
}

/** Years for the Year dropdown, newest first. */
export function yearOptions(from: number, to: number): number[] {
  const lo = Math.max(CAL_MIN_YEAR, Math.min(from, to));
  const hi = Math.min(CAL_MAX_YEAR, Math.max(from, to));
  const out: number[] = [];
  for (let y = hi; y >= lo; y--) out.push(y);
  return out;
}

/** Where the picker opens: the chosen day, else today pulled into [min, max]. */
export function startDay(value: DayKey, today: DayKey, min?: DayKey, max?: DayKey): DayKey {
  return clampDay(isDayKey(value) ? value : today, min, max);
}

/** "12 Mar 1998" from a day key and 12 short month names (index 0 = January). */
export function dayLabel(key: DayKey, monthNames: readonly string[]): string {
  const p = parseDay(key);
  return p ? `${p.d} ${monthNames[p.m - 1] ?? ''} ${p.y}` : '';
}

/** "Mar 1998" from "1998-03". */
export function monthLabel(key: string, monthNames: readonly string[]): string {
  const p = parseMonth(key);
  return p ? `${monthNames[p.m - 1] ?? ''} ${p.y}` : '';
}

/** The year a birth date gives, as text ("" when the date is not valid). */
export function yearOfDay(key: string): string {
  const p = parseDay(key);
  return p ? String(p.y) : '';
}

// Heat periods (Phase 43). Pure: no clock (today and anchors are parameters). Days are IST day keys, ends inclusive.
// Week = Monday..Sunday, month = calendar month, custom = any two days, all = first logged day .. today.

import { addDays, daysBetween, isDayKey, weekdayOfKey, type DayKey } from '../dates';

export type PeriodKind = 'day' | 'week' | 'month' | 'custom' | 'all';

export interface Period {
  kind: PeriodKind;
  /** First day, inclusive. */
  from: DayKey;
  /** Last day, inclusive. */
  to: DayKey;
  /** Whole days in the period (>= 1). */
  days: number;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

function make(kind: PeriodKind, a: DayKey, b: DayKey): Period {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return { kind, from, to, days: daysBetween(from, to) + 1 };
}

const monthStart = (key: DayKey): DayKey => `${key.slice(0, 7)}-01`;

/** First day of the month `n` months after the month of `key` (negative = before). */
function addMonths(key: DayKey, n: number): DayKey {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${pad(yy, 4)}-${pad(mm + 1)}-01`;
}

/** Day, week (Monday start) or month that contains `anchor`. */
export function periodFor(kind: 'day' | 'week' | 'month', anchor: DayKey): Period {
  if (!isDayKey(anchor)) throw new Error(`bad day key: ${anchor}`);
  if (kind === 'day') return make('day', anchor, anchor);
  if (kind === 'week') {
    const from = addDays(anchor, -weekdayOfKey(anchor));
    return make('week', from, addDays(from, 6));
  }
  const from = monthStart(anchor);
  return make('month', from, addDays(addMonths(from, 1), -1));
}

/** Any two days; given in the wrong order they are swapped. */
export function customPeriod(a: DayKey, b: DayKey): Period {
  if (!isDayKey(a) || !isDayKey(b)) throw new Error(`bad day key: ${a} / ${b}`);
  return make('custom', a, b);
}

/** Preset range ending today: "last 7 / 14 / 30 / 90 days" includes today. Needs n >= 1. */
export function lastDays(n: number, today: DayKey): Period {
  const k = Math.max(1, Math.floor(n));
  return make('custom', addDays(today, -(k - 1)), today);
}

/** All time: the earliest logged day (or today when nothing is logged) up to today. A future entry extends it. */
export function allPeriod(entryDays: readonly DayKey[], today: DayKey): Period {
  let from = today;
  let to = today;
  for (const d of entryDays) {
    if (d < from) from = d;
    if (d > to) to = d;
  }
  return make('all', from, to);
}

/** Previous / next period of the same kind (n = -1 / +1). Custom moves by its own length; all does not move. */
export function shiftPeriod(p: Period, n: number): Period {
  switch (p.kind) {
    case 'day': return make('day', addDays(p.from, n), addDays(p.from, n));
    case 'week': return make('week', addDays(p.from, 7 * n), addDays(p.to, 7 * n));
    case 'month': return periodFor('month', addMonths(p.from, n));
    case 'custom': return make('custom', addDays(p.from, p.days * n), addDays(p.to, p.days * n));
    default: return p;
  }
}

export const inPeriod = (p: Period, day: DayKey): boolean => day >= p.from && day <= p.to;

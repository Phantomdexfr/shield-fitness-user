// Text helpers for history screens (Phase 39). Days are IST day keys; labels use UTC parts of the key so the device zone never shifts them.

import type { DayKey } from '../../shared/dates';

const partsOf = (key: DayKey): [number, number, number] => key.split('-').map(Number) as [number, number, number];

/** "Fri, 20 Nov" for a day key. */
export function dayLabel(key: DayKey): string {
  const [y, m, d] = partsOf(key);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "November 2026" for `YYYY-MM`. */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

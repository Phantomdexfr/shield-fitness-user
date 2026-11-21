// Dates (Phase 12). Pure: time is always a parameter (ms since epoch, UTC); nothing here reads the clock.
// Stored UTC, shown Asia/Kolkata. India has no daylight saving, so IST is a fixed UTC+5:30 and the gym day is IST midnight.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** A calendar day in IST as "YYYY-MM-DD". */
export type DayKey = string;

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** The IST day key that contains this instant. */
export function istDayKey(ms: number): DayKey {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isDayKey(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** UTC ms of IST midnight at the start of a day key. */
export function dayKeyStart(key: DayKey): number {
  if (!isDayKey(key)) throw new Error(`bad day key: ${key}`);
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
}

/** UTC ms of the IST midnight that starts the day containing `ms` (the "gym day" start). */
export function istDayStart(ms: number): number {
  return dayKeyStart(istDayKey(ms));
}

/** Move a day key by whole days (negative = back). */
export function addDays(key: DayKey, days: number): DayKey {
  return istDayKey(dayKeyStart(key) + days * DAY_MS);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((dayKeyStart(b) - dayKeyStart(a)) / DAY_MS);
}

/** 0 = Monday ... 6 = Sunday (engines.md weekday numbering). */
export function weekdayOfKey(key: DayKey): number {
  const jsDay = new Date(dayKeyStart(key) + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function istWeekday(ms: number): number {
  return weekdayOfKey(istDayKey(ms));
}

/** The Monday of the IST week that contains `ms`. */
export function istWeekStartKey(ms: number): DayKey {
  const key = istDayKey(ms);
  return addDays(key, -weekdayOfKey(key));
}

/** "YYYY-MM-DD HH:mm" in IST. */
export function formatIst(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${istDayKey(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Parse an ISO-8601 string with an offset or Z. Returns null if it is not a valid instant. */
export function parseIso(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

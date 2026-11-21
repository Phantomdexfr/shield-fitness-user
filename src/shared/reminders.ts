// Workout reminders (Phase 63): the saved choice and the next time it points at. Pure: time is a parameter.
// Days are 0..6 with 0 = Monday, matching dates.istWeekday. Time is "HH:MM" in IST.
import { DAY_MS, istDayStart, istWeekday } from './dates';

export interface ReminderPrefs {
  on: boolean;
  days: number[];
  time: string;
}

export const REMINDER_ID = 'reminders:prefs';
export const DEFAULT_REMINDERS: ReminderPrefs = { on: false, days: [0, 2, 4], time: '18:00' };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isReminderTime = (s: unknown): s is string => typeof s === 'string' && TIME_RE.test(s);

/** Whatever was stored becomes a valid choice: days sorted, unique, 0..6; a bad time reads as the default. */
export function parseReminders(raw: unknown): ReminderPrefs {
  const r = (raw ?? {}) as Partial<Record<keyof ReminderPrefs, unknown>>;
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort((a, b) => a - b)
    : DEFAULT_REMINDERS.days;
  return {
    on: r.on === true,
    days,
    time: isReminderTime(r.time) ? r.time : DEFAULT_REMINDERS.time,
  };
}

/** The next reminder moment (ms) strictly after `nowMs`, or null when it is off or no day is chosen. */
export function nextReminderAt(p: ReminderPrefs, nowMs: number): number | null {
  if (!p.on || p.days.length === 0 || !isReminderTime(p.time)) return null;
  const [h, m] = p.time.split(':').map(Number) as [number, number];
  const start = istDayStart(nowMs);
  for (let i = 0; i <= 7; i++) {
    const dayMs = start + i * DAY_MS;
    if (!p.days.includes(istWeekday(dayMs))) continue;
    const when = dayMs + (h * 60 + m) * 60_000;
    if (when > nowMs) return when;
  }
  return null;
}

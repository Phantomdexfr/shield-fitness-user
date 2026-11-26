// Timed exercises (Phase 93): planks, holds, carries and timed stretches are logged in seconds, not reps. Pure: the clock
// is always a parameter. The hold timer keeps real time (start stamp plus what was banked before a pause), so a locked
// screen or a background tab never loses seconds.

import { roundKg } from './units';
import type { SetLog } from './session';

/** Library slugs logged as a time. Static planks, holds, carries, timed stretches and rolls (moving planks stay in reps). */
export const TIMED_SLUGS: ReadonlySet<string> = new Set([
  // planks
  'plank', 'rkc-plank', 'reverse-plank', 'balance-trainer-plank', 'stability-ball-plank', 'suspension-plank', 'side-plank', 'copenhagen-plank', 'shoulder-tap-plank',
  // holds
  'prone-cobra-hold', 'push-up-hold-bottom-position', 'bear-hold', 'boat-hold', 'hollow-hold', 'isometric-split-squat-hold', 'deep-squat-hold', 'wall-sit',
  'wall-handstand-hold', 'barbell-static-hold-deadlift-hold', 'dumbbell-static-hold', 'plate-pinch-hold', 'neck-isometric-hold-hand-resistance', 'balance-trainer-single-leg-balance',
  // carries
  'barbell-zercher-carry', 'kettlebell-bottoms-up-carry', 'kettlebell-rack-carry', 'kettlebell-suitcase-carry', 'kettlebell-waiter-carry', 'dumbbell-farmers-carry',
  'dumbbell-front-rack-carry', 'dumbbell-goblet-carry', 'dumbbell-waiter-carry', 'plate-hug-carry',
  // timed stretches and rolls
  'childs-pose', 'foam-roller-calf-roll', 'foam-roller-glute-roll', 'foam-roller-hamstring-roll', 'foam-roller-lat-roll', 'foam-roller-quad-roll', 'foam-roller-thoracic-extension',
]);

export const isTimedSlug = (slug: string): boolean => TIMED_SLUGS.has(slug);

export const MAX_HOLD_SECONDS = 3600;
/** A timed set shorter than this does not count as a working set for Experience. */
export const MIN_TIMED_SECONDS = 10;

// ---------- the live hold timer ----------

export interface HoldTimer {
  running: boolean;
  /** Milliseconds banked from earlier runs (before the last pause). */
  bankedMs: number;
  /** Epoch ms of the last start, or null when paused. */
  startedAt: number | null;
}

export const IDLE_HOLD: HoldTimer = { running: false, bankedMs: 0, startedAt: null };

export const startHold = (t: HoldTimer, now: number): HoldTimer => (t.running ? t : { running: true, bankedMs: t.bankedMs, startedAt: now });
export const pauseHold = (t: HoldTimer, now: number): HoldTimer => (t.running && t.startedAt != null ? { running: false, bankedMs: t.bankedMs + Math.max(0, now - t.startedAt), startedAt: null } : t);
export const holdMs = (t: HoldTimer, now: number): number => t.bankedMs + (t.running && t.startedAt != null ? Math.max(0, now - t.startedAt) : 0);
/** Whole seconds shown and logged (never above one hour). */
export const holdSeconds = (t: HoldTimer, now: number): number => Math.min(MAX_HOLD_SECONDS, Math.floor(holdMs(t, now) / 1000));
/** A timer showing exactly this many seconds, paused (used when the person types or steps the number). */
export const holdAt = (seconds: number): HoldTimer => ({ running: false, bankedMs: Math.max(0, Math.min(MAX_HOLD_SECONDS, Math.round(seconds))) * 1000, startedAt: null });

/** Countdown mode: seconds left, never below 0. */
export const secondsLeft = (t: HoldTimer, now: number, target: number): number => Math.max(0, target - Math.floor(holdMs(t, now) / 1000));

/** Default target: the middle of the exercise's range (stored as seconds for timed exercises), rounded to 5 s. */
export function defaultTarget(repMin: number, repMax: number): number {
  const mid = (Math.max(0, repMin) + Math.max(repMin, repMax)) / 2;
  return Math.min(MAX_HOLD_SECONDS, Math.max(5, Math.round(mid / 5) * 5));
}

// ---------- rows ----------

export interface TimedDraft {
  seconds: number;
  /** Added load (plate on the back, carried weight). 0 = bodyweight. */
  weightKg: number;
}

/** One timed row: seconds, no reps; weight only when given. */
export function timedFromDraft(d: TimedDraft, doneAt: string, restSec?: number): SetLog {
  const set: SetLog = {
    weightKg: d.weightKg > 0 ? roundKg(Math.min(1000, d.weightKg)) : null,
    reps: null,
    seconds: Math.max(0, Math.min(MAX_HOLD_SECONDS, Math.round(d.seconds))),
    tag: 'normal',
    doneAt,
  };
  if (restSec != null && restSec > 0) set.restSec = Math.round(restSec);
  return set;
}

/** "45", "1:30" for a clock face. */
export function clockSeconds(s: number): string {
  const n = Math.max(0, Math.floor(s));
  return n < 60 ? String(n) : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

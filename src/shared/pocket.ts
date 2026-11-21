// Pocket tools (Phase 38): contract/engines.md section 20. Pure: no DOM, no storage, no clock (time is a parameter).
// Plate calculator, warm-up ramp, smart rest seconds and the rest timer arithmetic.

import { roundKg } from './units';
import { snapToStep } from './engine/overload';

export type ExerciseClass = 'isolation' | 'compound' | 'bodyweight' | 'cardio' | 'mobility';

// ---------- exercise class ----------

export interface ClassInput {
  kind: string;
  category: string;
  subCategory: string;
}

/** Library `category` + `kind` -> the class the pocket tools use. Unknown values fall back to isolation (no ramp, 60 s). */
export function classOf(x: ClassInput): ExerciseClass {
  if (x.kind === 'cardio' || x.subCategory === 'cardio_machine' || x.subCategory === 'conditioning') return 'cardio';
  if (x.category === 'warmup' || x.category === 'recovery') return 'mobility';
  if (x.kind === 'bodyweight') return 'bodyweight';
  if (x.category === 'compound') return 'compound';
  return 'isolation';
}

// ---------- plate calculator ----------

export type PlateUnit = 'kg' | 'lb';

export const DEFAULT_BAR: Record<PlateUnit, number> = { kg: 20, lb: 45 };
export const DEFAULT_PLATES: Record<PlateUnit, readonly number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export interface PlateCount {
  plate: number;
  count: number;
}

export interface PlatesResult {
  /** Plates for ONE side, largest first. */
  perSide: PlateCount[];
  /** Bar plus both sides, exactly what is loaded. */
  total: number;
  /** target - total (0 when exact; never negative). */
  remainder: number;
  /** The next loadable total above `total` (null when no plate is left). */
  nextUp: number | null;
  /** Target is lighter than the bar: nothing to load. */
  belowBar: boolean;
}

const hundredths = (n: number): number => Math.round(n * 100);
const back = (h: number): number => roundKg(h / 100);

/**
 * Greedy per side from the largest plate. Works in hundredths so 1.25 + 2.5 never drifts. Duplicates and non-positive
 * plates in the inventory are ignored. When the target cannot be made exactly, `total` is the nearest loadable weight
 * at or below the target and `nextUp` the one just above it.
 */
export function platesFor(target: number, bar: number, inventory: readonly number[]): PlatesResult {
  const plates = [...new Set(inventory.filter((p) => Number.isFinite(p) && p > 0).map(hundredths))].sort((a, b) => b - a);
  const barH = hundredths(Math.max(0, bar));
  const targetH = hundredths(Math.max(0, Number.isFinite(target) ? target : 0));
  if (targetH < barH) return { perSide: [], total: back(barH), remainder: 0, nextUp: plates.length ? back(barH + 2 * (plates[plates.length - 1] as number)) : null, belowBar: true };
  let side = Math.floor((targetH - barH) / 2);
  const perSide: PlateCount[] = [];
  let used = 0;
  for (const p of plates) {
    const n = Math.floor(side / p);
    if (n > 0) {
      perSide.push({ plate: back(p), count: n });
      side -= n * p;
      used += n * p;
    }
  }
  const totalH = barH + 2 * used;
  const smallest = plates.length ? (plates[plates.length - 1] as number) : null;
  return {
    perSide,
    total: back(totalH),
    remainder: back(Math.max(0, targetH - totalH)),
    nextUp: smallest === null ? null : back(totalH + 2 * smallest),
    belowBar: false,
  };
}

// ---------- warm-up ramp ----------

export interface RampSet {
  weightKg: number;
  reps: number;
}

export const RAMP_MIN_KG = 40;
export const RAMP: ReadonlyArray<{ pct: number; reps: number }> = [
  { pct: 0.5, reps: 8 },
  { pct: 0.7, reps: 5 },
  { pct: 0.85, reps: 3 },
];

/**
 * 50% x 8, 70% x 5, 85% x 3, rounded to the weight step. Only compound exercises with a working weight of at least 40 kg;
 * everything else gets []. A step that rounds onto the one before it, or up to the working weight, is dropped.
 * The caller tags every returned set `warmup`, which keeps it out of volume and PRs.
 */
export function warmupSets(workingKg: number, cls: ExerciseClass, step: number, minKg = RAMP_MIN_KG): RampSet[] {
  if (cls !== 'compound' || !Number.isFinite(workingKg) || workingKg < minKg || !(step > 0)) return [];
  const out: RampSet[] = [];
  let prev = 0;
  for (const r of RAMP) {
    const w = Math.max(step, snapToStep(workingKg * r.pct, step));
    if (w <= prev || w >= workingKg) continue;
    out.push({ weightKg: w, reps: r.reps });
    prev = w;
  }
  return out;
}

// ---------- smart rest ----------

export const REST_DEFAULT: Record<ExerciseClass, number> = { isolation: 60, compound: 90, bodyweight: 60, cardio: 0, mobility: 0 };
export const REST_HEAVY = 180;
export const REST_MIN_LOGGED = 3;
export const REST_WINDOW = 5;

export interface RestInput {
  cls: ExerciseClass;
  /** Rep target of the set just done (planned or actual). */
  reps?: number | null;
  /** Weight just done as a fraction of the current best e1RM (0-1+), when known. */
  e1rmFraction?: number | null;
  /** Actual rests recorded for this exercise, oldest first. */
  history?: readonly number[];
}

/** The class default: isolation 60, compound 90, heavy compound (reps <= 5 or >= 85% e1RM) 180, cardio / mobility 0. */
export function defaultRest(cls: ExerciseClass, reps?: number | null, e1rmFraction?: number | null): number {
  if (cls === 'compound' && ((reps != null && reps >= 1 && reps <= 5) || (e1rmFraction != null && e1rmFraction >= 0.85))) return REST_HEAVY;
  return REST_DEFAULT[cls];
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** After 3 or more logged rests: the median of the last 5, clamped to 50%-150% of the default. Whole seconds. */
export function restSeconds(i: RestInput): number {
  const base = defaultRest(i.cls, i.reps, i.e1rmFraction);
  const h = (i.history ?? []).filter((x) => Number.isFinite(x) && x > 0);
  if (base === 0 || h.length < REST_MIN_LOGGED) return base;
  const m = median(h.slice(-REST_WINDOW));
  return Math.round(Math.min(base * 1.5, Math.max(base * 0.5, m)));
}

// ---------- rest timer (arithmetic only) ----------

export interface RestTimer {
  startedAt: number;
  seconds: number;
}

export const startRest = (nowMs: number, seconds: number): RestTimer => ({ startedAt: nowMs, seconds: Math.max(0, Math.round(seconds)) });
export const elapsedRest = (t: RestTimer, nowMs: number): number => Math.max(0, Math.floor((nowMs - t.startedAt) / 1000));
export const remainingRest = (t: RestTimer, nowMs: number): number => Math.max(0, t.seconds - elapsedRest(t, nowMs));
export const restDone = (t: RestTimer, nowMs: number): boolean => remainingRest(t, nowMs) === 0;
/** +/- seconds on a running timer; never below 0 and never above 15 minutes. */
export const adjustRest = (t: RestTimer, deltaSec: number): RestTimer => ({ ...t, seconds: Math.min(900, Math.max(0, t.seconds + deltaSec)) });
/** What to record as the actual rest when the next set is logged: whole seconds, 5 s to 15 min, otherwise not recorded. */
export function actualRest(t: RestTimer | null | undefined, nowMs: number): number | undefined {
  if (!t) return undefined;
  const e = elapsedRest(t, nowMs);
  return e >= 5 && e <= 900 ? e : undefined;
}
export const clockText = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;

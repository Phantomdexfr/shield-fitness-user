// Recovery clock, balance metrics and neglected muscles (Phase 48). contract/engines.md section 5 (recovery) and
// docs/HEATMAP.md (balance card, neglected strip). Pure: no DOM, no storage, no clock (`now` is a parameter).

import type { Taxonomy } from './muscles';
import { tidy9 } from './heat/rawHeat';

export type RecoveryState = 'fatigued' | 'recovering' | 'ready' | 'fresh';
export type SizeClass = 'large' | 'medium' | 'small';

export const HOUR_MS = 3_600_000;
/** Hours a muscle needs, by size (engines.md 5). */
export const TARGET_HOURS: Readonly<Record<SizeClass, number>> = { large: 72, medium: 48, small: 36 };
/** A set counts as "trained" for the clock only when the muscle's weight in it is at least this. */
export const TRAINED_WEIGHT = 0.6;

const LARGE = ['chest', 'upper_chest', 'lower_chest', 'back', 'lats', 'rhomboids_teres', 'lower_back', 'quads', 'quads_lower', 'glutes', 'hamstrings'];
const MEDIUM = ['shoulders', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'traps', 'upper_traps', 'mid_lower_traps', 'abs', 'obliques'];
// engines.md 5 says "etc." for the small class: these are the rest of the trained muscles [A-P48.1].
const SMALL = ['forearms', 'calves', 'soleus', 'tibialis_anterior', 'neck', 'adductors', 'abductors', 'rotator_cuff', 'hip_flexors', 'serratus_anterior'];

const SIZE: Readonly<Record<string, SizeClass>> = Object.fromEntries([
  ...LARGE.map((id) => [id, 'large'] as const),
  ...MEDIUM.map((id) => [id, 'medium'] as const),
  ...SMALL.map((id) => [id, 'small'] as const),
]);

/** Size class of a muscle id, or undefined for ids with no clock (`full_body`, `cardio`, unknown ids). */
export const sizeOf = (id: string): SizeClass | undefined => SIZE[id];

/**
 * State of one muscle. `lastTrainedAt` is ms UTC, or null/undefined when never trained (-> `fresh`).
 * Elapsed / target: < 0.5 fatigued, < 1 recovering, < 2 ready, >= 2 fresh. A time in the future counts as just trained.
 * Integer millisecond compares, so the boundaries are exact.
 */
export function recoveryState(lastTrainedAt: number | null | undefined, size: SizeClass, now: number): RecoveryState {
  if (lastTrainedAt == null) return 'fresh';
  const elapsed = Math.max(0, now - lastTrainedAt);
  const target = TARGET_HOURS[size] * HOUR_MS;
  if (elapsed * 2 < target) return 'fatigued';
  if (elapsed < target) return 'recovering';
  if (elapsed < target * 2) return 'ready';
  return 'fresh';
}

/** One exercise as done at one moment (the caller uses the set's time, or the session's when sets carry none). */
export interface RecoveryEntry {
  at: number;
  /** Weight per muscle id for the exercise as logged (see `exerciseWeights`). */
  weights: Readonly<Record<string, number>>;
}

export interface RecoveryInfo {
  state: RecoveryState;
  size: SizeClass;
  lastTrainedAt: number | null;
  /** Hours since the last trained set (2 dp), null when never trained. */
  hoursSince: number | null;
  /** Hours until the muscle is `ready` (0 once it is), 2 dp. */
  hoursLeft: number;
}

/** Latest time each muscle id was trained (weight >= 0.6), as logged. Parents are not rolled up here. */
export function lastTrained(entries: readonly RecoveryEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    for (const [id, w] of Object.entries(e.weights)) {
      if (w >= TRAINED_WEIGHT && e.at > (out[id] ?? -Infinity)) out[id] = e.at;
    }
  }
  return out;
}

const hours2 = (ms: number): number => Math.round((ms / HOUR_MS) * 100) / 100;

/**
 * Recovery of every muscle that has a clock (a leaf, or a core id with children). A core id's last time is the latest
 * of its own and its children's: training upper chest also tires "chest". Muscles never trained are `fresh`.
 */
export function recoveryMap(entries: readonly RecoveryEntry[], tax: Taxonomy, now: number): Record<string, RecoveryInfo> {
  const own = lastTrained(entries);
  const out: Record<string, RecoveryInfo> = {};
  for (const id of tax.ids) {
    const size = sizeOf(id);
    if (!size) continue;
    let last: number | null = own[id] ?? null;
    for (const c of tax.childrenOf(id)) {
      const t = own[c];
      if (t !== undefined && (last === null || t > last)) last = t;
    }
    const elapsed = last === null ? null : Math.max(0, now - last);
    out[id] = {
      state: recoveryState(last, size, now),
      size,
      lastTrainedAt: last,
      hoursSince: elapsed === null ? null : hours2(elapsed),
      hoursLeft: elapsed === null ? 0 : hours2(Math.max(0, TARGET_HOURS[size] * HOUR_MS - elapsed)),
    };
  }
  return out;
}

/** The plain id -> state record the scheduler reads (`RecoveryStates` in schedule.ts). */
export function recoveryStates(map: Readonly<Record<string, RecoveryInfo>>): Record<string, RecoveryState> {
  const out: Record<string, RecoveryState> = {};
  for (const [id, i] of Object.entries(map)) out[id] = i.state;
  return out;
}

/** Ids that are `ready` or `fresh`, in the order of `tax.ids`. Core ids with children are left out (their children speak for them). */
export function readyMuscles(map: Readonly<Record<string, RecoveryInfo>>, tax: Taxonomy): string[] {
  return tax.ids.filter((id) => {
    const i = map[id];
    return !!i && (i.state === 'ready' || i.state === 'fresh') && tax.childrenOf(id).length === 0;
  });
}

// ---------------------------------------------------------------- balance

export type AxisId = 'pushPull' | 'upperLower' | 'frontBack';
export type Side = 'a' | 'b';
/** a = push / upper / front, b = pull / lower / back. */
export const AXES: Readonly<Record<AxisId, { a: string; b: string }>> = {
  pushPull: { a: 'push', b: 'pull' },
  upperLower: { a: 'upper', b: 'lower' },
  frontBack: { a: 'front', b: 'back' },
};

// Which side of each axis a muscle sits on [A-P48.2]. A muscle missing from an axis (core, side delts for front/back,
// legs for push/pull) is not counted on that axis. Core ids that have children are listed too (custom exercises name them).
const PUSH = ['chest', 'upper_chest', 'lower_chest', 'front_delts', 'side_delts', 'shoulders', 'triceps', 'serratus_anterior'];
const PULL = ['back', 'lats', 'rhomboids_teres', 'rear_delts', 'traps', 'upper_traps', 'mid_lower_traps', 'biceps', 'forearms'];
const UPPER = [...PUSH, ...PULL, 'neck', 'rotator_cuff'];
const LOWER = ['quads', 'quads_lower', 'hamstrings', 'glutes', 'calves', 'soleus', 'tibialis_anterior', 'adductors', 'abductors'];
const FRONT = ['chest', 'upper_chest', 'lower_chest', 'front_delts', 'biceps', 'abs', 'obliques', 'hip_flexors', 'quads', 'quads_lower', 'adductors', 'tibialis_anterior'];
const BACK = ['back', 'lats', 'rhomboids_teres', 'rear_delts', 'traps', 'upper_traps', 'mid_lower_traps', 'triceps', 'lower_back', 'glutes', 'hamstrings', 'calves', 'soleus', 'abductors'];

const SIDES: Readonly<Record<AxisId, { a: ReadonlySet<string>; b: ReadonlySet<string> }>> = {
  pushPull: { a: new Set(PUSH), b: new Set(PULL) },
  upperLower: { a: new Set(UPPER), b: new Set(LOWER) },
  frontBack: { a: new Set(FRONT), b: new Set(BACK) },
};

/** Below this much work (weighted sets) on an axis there is nothing to say. */
export const BALANCE_MIN = 6;
/** The smaller side must be at least this share of the bigger side to count as balanced (75%). */
export const BALANCE_OK = 0.75;

export interface AxisBalance {
  axis: AxisId;
  /** Weighted sets on each side (9 dp). */
  a: number;
  b: number;
  /** `no_data` under BALANCE_MIN in total; `balanced` when smaller / bigger >= 0.75; else the bigger side leads. */
  verdict: 'no_data' | 'balanced' | 'a_leads' | 'b_leads';
  /** The smaller side as a whole percent of the bigger one ("Pull is 40% of your push work"); null with no data. */
  percent: number | null;
}

/** Balance on the three axes from raw heat (`rawHeat(entries, period)`), usually over the last 28 days. */
export function balance(raw: Readonly<Record<string, number>>): Record<AxisId, AxisBalance> {
  const out = {} as Record<AxisId, AxisBalance>;
  for (const axis of Object.keys(AXES) as AxisId[]) {
    let a = 0;
    let b = 0;
    for (const [id, v] of Object.entries(raw)) {
      if (!(v > 0)) continue;
      if (SIDES[axis].a.has(id)) a += v;
      if (SIDES[axis].b.has(id)) b += v;
    }
    a = tidy9(a);
    b = tidy9(b);
    if (a + b < BALANCE_MIN) {
      out[axis] = { axis, a, b, verdict: 'no_data', percent: null };
      continue;
    }
    const hi = Math.max(a, b);
    const ratio = hi === 0 ? 1 : Math.min(a, b) / hi;
    out[axis] = {
      axis, a, b,
      verdict: ratio >= BALANCE_OK ? 'balanced' : a > b ? 'a_leads' : 'b_leads',
      percent: Math.round(ratio * 100),
    };
  }
  return out;
}

// ---------------------------------------------------------------- neglected

export interface Neglected {
  id: string;
  /** Whole IST-free days since last trained (floor of hours / 24), null when never trained. */
  daysSince: number | null;
}

/** Leaf muscles that have a clock (no core id that has children). */
export function trackedMuscles(tax: Taxonomy): string[] {
  return tax.ids.filter((id) => sizeOf(id) !== undefined && tax.childrenOf(id).length === 0);
}

/**
 * Tracked muscles with no heat in the period (`raw` is `rawHeat(entries, period)`; a core id with heat counts for its
 * children). Never-trained muscles come first, then the longest since last trained; ties by id.
 */
export function neglectedMuscles(raw: Readonly<Record<string, number>>, map: Readonly<Record<string, RecoveryInfo>>, tax: Taxonomy, now: number): Neglected[] {
  const out: Neglected[] = [];
  for (const id of trackedMuscles(tax)) {
    const parent = tax.parentOf(id);
    if ((raw[id] ?? 0) > 0 || (parent && parent !== id && (raw[parent] ?? 0) > 0)) continue;
    const last = map[id]?.lastTrainedAt ?? null;
    out.push({ id, daysSince: last === null ? null : Math.floor(Math.max(0, now - last) / (24 * HOUR_MS)) });
  }
  return out.sort((x, y) => {
    if (x.daysSince === null && y.daysSince !== null) return -1;
    if (y.daysSince === null && x.daysSince !== null) return 1;
    return (y.daysSince ?? 0) - (x.daysSince ?? 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  });
}

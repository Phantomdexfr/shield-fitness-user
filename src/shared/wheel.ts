// Phase 101: pure maths for the wheel picker (no DOM, no storage, no clock). The component in src/ui/components/WheelPicker.tsx
// only turns scroll position into an index and back; every rule (value lists, snapping, clamping, steps) lives here.
import { stepOf } from './engine/overload';
import { kgToLb } from './units';

/** Height of one wheel line in px. The component sets `--wheel-item` from this, so scroll maths and CSS cannot disagree. */
export const WHEEL_ITEM_PX = 44;
/** Lines shown at once (odd, so one sits in the middle between the two gold lines). */
export const WHEEL_ROWS = 5;
/** A list longer than this is cut (a wheel with thousands of lines is a mistake in the caller, not a feature). */
export const WHEEL_MAX_ITEMS = 2000;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 1e-9;

export const clampValue = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** min, min+step, ... up to max (inclusive when it lands on the grid), 2 dp so 0.1 + 0.2 never shows. Invalid input gives []. */
export function wheelValues(min: number, max: number, step: number): number[] {
  if (![min, max, step].every(Number.isFinite) || !(step > 0) || min > max) return [];
  const out: number[] = [];
  for (let i = 0; i < WHEEL_MAX_ITEMS; i += 1) {
    const v = round2(min + i * step);
    if (v > max + EPS) break;
    out.push(v);
  }
  return out;
}

/** Index of the value nearest to `v` (a tie keeps the lower one). -1 for an empty list. */
export function nearestIndex(values: readonly number[], v: number): number {
  if (values.length === 0) return -1;
  if (!Number.isFinite(v)) return 0;
  let best = 0;
  let bestD = Infinity;
  values.forEach((x, i) => {
    const d = Math.abs(x - v);
    if (d < bestD - EPS) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** The list value a free number snaps to (clamped to the list ends first). */
export function snapValue(values: readonly number[], v: number): number | null {
  const i = nearestIndex(values, v);
  return i < 0 ? null : (values[i] as number);
}

/** The line in the middle for a scroll offset (rounded, never outside the list). */
export function indexAtScroll(scrollTop: number, count: number, itemPx: number = WHEEL_ITEM_PX): number {
  if (count <= 0 || !Number.isFinite(scrollTop)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / itemPx)));
}

export const scrollForIndex = (index: number, itemPx: number = WHEEL_ITEM_PX): number => Math.max(0, index) * itemPx;

/** Move by `delta` lines (keyboard), clamped to the list. */
export const stepIndex = (index: number, delta: number, count: number): number => Math.min(Math.max(count - 1, 0), Math.max(0, index + delta));

export interface WheelRange {
  min: number;
  max: number;
  step: number;
  unit: 'kg' | 'lb';
}

/** The wheel for a training weight. kg uses the step the app already uses (a machine's own step, else the 2.5 kg default: `stepOf`).
 *  lb counts whole pounds: the app has no pound step table (see Awaiting from owner), so the wheel does not invent one. */
export function weightWheel(units: 'kg' | 'lb', minKg: number, maxKg: number, stepKg?: number | null): WheelRange {
  if (units === 'lb') return { min: Math.ceil(kgToLb(minKg)), max: Math.floor(kgToLb(maxKg)), step: 1, unit: 'lb' };
  return { min: minKg, max: maxKg, step: stepOf(stepKg), unit: 'kg' };
}

/** Phase 107-a: the range for the logger's weight or reps wheel. A normal wheel stops at 500 kg / 100 reps (a short list scrolls well on a phone);
 *  a value above that opens the full range (MAX_KG / MAX_REPS) so nothing the person logged is out of reach.
 *  The grid starts at the value's remainder (61 on a 2.5 step starts at 1), so the current value is ALWAYS on the wheel and opening it never changes it. */
export function loggerWheel(value: number, step: number, hardMax: number, kind: 'weight' | 'reps'): { min: number; max: number; step: number; value: number } {
  const soft = kind === 'weight' ? 500 : 100;
  const max = value > soft ? hardMax : Math.min(soft, hardMax);
  const v = Number.isFinite(value) ? Math.min(Math.max(value, 0), hardMax) : 0;
  let off = round2(v % step);
  if (off < EPS || step - off < EPS) off = 0;
  return { min: off, max, step, value: v };
}

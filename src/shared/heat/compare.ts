// Compare mode (engines.md section 4): two periods, per-muscle delta of heat01 (current - base). Pure.
// More work = positive (gold on screen), less = negative (steel). Never red.

import type { HeatMap } from './index';
import { tidy9 } from './rawHeat';

export interface HeatDelta {
  base: number;
  current: number;
  /** current - base, 9 places. */
  delta: number;
  trend: 'gain' | 'loss' | 'same';
}

export interface HeatComparison {
  detail: Record<string, HeatDelta>;
  rolled: Record<string, HeatDelta>;
}

function deltas(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, HeatDelta> {
  const out: Record<string, HeatDelta> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const base = a[id] ?? 0;
    const current = b[id] ?? 0;
    if (base === 0 && current === 0) continue;
    const delta = tidy9(current - base);
    out[id] = { base, current, delta, trend: delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'same' };
  }
  return out;
}

const heatOf = (m: Readonly<Record<string, { heat01: number }>>): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const [id, v] of Object.entries(m)) o[id] = v.heat01;
  return o;
};

/** Each period keeps its own reference, so a week and a month compare fairly. Muscles untouched in both are left out. */
export function compareHeat(base: HeatMap, current: HeatMap): HeatComparison {
  return {
    detail: deltas(heatOf(base.muscles), heatOf(current.muscles)),
    rolled: deltas(heatOf(base.rolled), heatOf(current.rolled)),
  };
}

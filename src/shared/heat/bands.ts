// Heat and band of one muscle (engines.md section 4). Pure.

import { tidy9 } from './rawHeat';

export type Band = 0 | 1 | 2 | 3 | 4 | 5;

/** Band edges on heat01: below 0.2 = 1, 0.2 = 2, 0.4 = 3, 0.6 = 4, 0.8 and up = 5. A value on an edge goes to the higher band. */
export const BAND_EDGES = [0.2, 0.4, 0.6, 0.8] as const;

/** heat01 = clamp(raw / ref, 0, 1), rounded to 9 places so 1.2 / 6 is exactly 0.2. A zero reference with raw > 0 is full. */
export function heat01(raw: number, ref: number): number {
  if (!(raw > 0)) return 0;
  if (!(ref > 0)) return 1;
  return Math.min(1, Math.max(0, tidy9(raw / ref)));
}

/** 0 when nothing was trained (heat 0), else 1..5. */
export function bandOf(heat: number): Band {
  if (!(heat > 0)) return 0;
  let b = 1;
  for (const edge of BAND_EDGES) if (heat >= edge) b += 1;
  return b as Band;
}

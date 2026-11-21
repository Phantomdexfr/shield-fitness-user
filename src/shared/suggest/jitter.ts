// Seeded jitter (Phase 15): API_CONTRACTS.md P14.3. Pure; the day key is a parameter (IST `YYYY-MM-DD`).

/** FNV-1a, 32 bit, over the UTF-8 bytes of `text`. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic pseudo-random value in [-0.5, 0.5], 4 decimals; stable for one (day, slug), new the next day. */
export function jitter(dayKey: string, slug: string): number {
  return Math.round((fnv1a32(`${dayKey}|${slug}`) / 4294967295 - 0.5) * 1e4) / 1e4;
}

/** Index for "Surprise me": `n` = how many times it was tapped today (from 0). `length` must be > 0. */
export function surpriseIndex(dayKey: string, n: number, length: number): number {
  return length > 0 ? fnv1a32(`${dayKey}|surprise|${n}`) % length : -1;
}

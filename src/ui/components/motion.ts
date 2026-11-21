// Motion helpers. Durations mirror --dur-* in tokens.css; reduced motion zeroes everything.
export const DUR = { fast: 90, base: 180, slow: 320 } as const;
export const MAX_STAGGERED_ITEMS = 8;
const STAGGER_STEP_MS = 40;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Duration in ms for JS-driven timing; 0 under reduced motion. */
export function dur(name: keyof typeof DUR): number {
  return prefersReducedMotion() ? 0 : DUR[name];
}

/** List entry delay: short stagger, only the first 8 items animate, none under reduced motion. */
export function staggerDelay(index: number): number {
  if (prefersReducedMotion() || index >= MAX_STAGGERED_ITEMS) return 0;
  return index * STAGGER_STEP_MS;
}

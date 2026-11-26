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

// Phase 102: pure sheet maths (premium sheets). No DOM here; Overlay.tsx feeds it numbers from pointer events.
export type SheetDetent = 'medium' | 'large';
export type SheetRelease = 'dismiss' | 'medium' | 'large' | 'stay';
export const SHEET = {
  /** Pull down this far (px) and let go: the sheet goes (the classic sheet uses the same 80). */
  dismissPx: 80,
  /** A flick faster than this (px per ms) counts as a decision even if it was short. */
  flingPxMs: 0.6,
  /** Height caps in dvh: medium is about half a screen, large is the classic cap. */
  mediumDvh: 55,
  largeDvh: 90,
} as const;

/** Resistance when a sheet is pulled past its limit: grows with the pull but never passes `dim`. 0 stays 0. */
export function rubberBand(over: number, dim = 320): number {
  if (!(over > 0) || !(dim > 0)) return 0;
  return (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
}

/** Speed in px/ms (positive = moving down) from the two newest pointer samples; 0 when they are too close in time or too old.
 *  `liftAt` (when the finger lifted): a finger that paused before lifting is not a flick, so a newest sample older than 100 ms means 0. */
export function sheetVelocity(samples: ReadonlyArray<{ y: number; t: number }>, liftAt?: number): number {
  const a = samples[samples.length - 2];
  const b = samples[samples.length - 1];
  if (!a || !b || b.t - a.t < 1 || b.t - a.t > 120) return 0;
  if (liftAt !== undefined && liftAt - b.t > 100) return 0;
  return (b.y - a.y) / (b.t - a.t);
}

/** What a sheet does when the finger lifts. `dy` px dragged (positive = down), `velocity` px/ms (positive = down). */
export function sheetRelease(dy: number, velocity: number, detent: SheetDetent, canMedium: boolean): SheetRelease {
  const down = dy >= SHEET.dismissPx || velocity >= SHEET.flingPxMs;
  const up = -dy >= SHEET.dismissPx || velocity <= -SHEET.flingPxMs;
  if (down && !(up && dy < 0)) {
    // From large, with a medium stop: one step down, unless it was a long pull or a hard flick.
    const far = dy >= SHEET.dismissPx * 2.5 || velocity >= SHEET.flingPxMs * 2;
    if (detent === 'large' && canMedium && !far) return 'medium';
    return 'dismiss';
  }
  if (up) return detent === 'medium' && canMedium ? 'large' : 'stay';
  return 'stay';
}

/** Pixels the on-screen keyboard covers at the bottom (0 without a visual viewport or with no keyboard). */
export function keyboardInset(layoutH: number, vv: { height: number; offsetTop: number } | null | undefined): number {
  if (!vv) return 0;
  const covered = layoutH - vv.height - vv.offsetTop;
  return covered > 40 ? Math.round(covered) : 0;
}

// Phase 103: pure navigation rules (premium page motion). No DOM here; src/app/pageMotion.ts feeds numbers in.
export type NavDirection = 'push' | 'pop' | 'none';
/** What a page change looks like: `push` slides in from the right, `pop` from the left, `swipe` (the finger already moved the page) and `vt` (a View Transition draws it) draw nothing extra. */
export type PageDir = NavDirection | 'swipe' | 'vt';
/** The back swipe starts only this close to the left edge (px). */
export const SWIPE_EDGE_PX = 20;
/** A pull shorter than this (px) is never a back swipe, whatever its speed. */
export const SWIPE_MIN_PX = 40;

/** Direction from the in-app history counter (`navIndex()`): deeper = push, shallower = pop, same (tab switch, replace) = none.
 *  The browser's own history stays the source of truth: this only reads the counter, it never decides where to go. */
export function navDirection(prevIdx: number, nextIdx: number): NavDirection {
  if (nextIdx > prevIdx) return 'push';
  if (nextIdx < prevIdx) return 'pop';
  return 'none';
}

/** Back swipe release: far enough (40% of the width) or a quick flick (px/ms, positive = right) goes back; a short pull cancels. */
export function swipeBackRelease(dx: number, velocity: number, width: number): 'back' | 'cancel' {
  if (!(width > 0) || dx < SWIPE_MIN_PX) return 'cancel';
  return dx >= width * 0.4 || velocity >= 0.5 ? 'back' : 'cancel';
}

/** Is a gesture starting at (x, y) a back swipe candidate? Needs an in-app page behind, a start at the left edge. */
export function swipeBackStarts(x: number, hasHistory: boolean): boolean {
  return hasHistory && x >= 0 && x <= SWIPE_EDGE_PX;
}

/** Full motion: the phone's setting AND the in-app Motion setting both allow it (either one says reduced = no motion). */
export function motionAllowed(rootMotion: string | null | undefined): boolean {
  return !prefersReducedMotion() && rootMotion !== 'reduced';
}

// Phase 104: pure feedback rules (premium motion II). No DOM here; Feedback.tsx and the charts feed values in.
/** Does a feedback animation (count-up, draw-in, set check, PR mark, pull) play? Classic keeps its old rule (the phone's setting only);
 *  Premium also obeys the in-app Motion setting (`data-motion="reduced"` = nothing plays). */
export function fxPlays(style: 'premium' | 'classic', rootMotion: string | null | undefined): boolean {
  return style === 'premium' ? motionAllowed(rootMotion) : !prefersReducedMotion();
}

const played = new Set<string>();
let playedView = '';
/** "Once per view": true the first time a (view, key) pair asks, false after that, until the view (the page path) changes.
 *  A page that re-reads its data (or remounts a tile) therefore never replays a count-up or a draw-in. */
export function claimPlay(view: string, key: string): boolean {
  if (view !== playedView) {
    played.clear();
    playedView = view;
  }
  if (played.has(key)) return false;
  played.add(key);
  return true;
}
/** Test helper: forget what has played. */
export function resetPlayed(): void {
  played.clear();
  playedView = '';
}

/** Pull to refresh: pull this far (px, after resistance) and let go to refresh; the pull never shows more than `maxPx`. */
export const PULL = { thresholdPx: 64, maxPx: 110, resist: 0.5, startSlackPx: 8 } as const;
export type PullState = 'idle' | 'pulling' | 'ready';

/** How far the page is shown pulled for a finger moved `dy` px down: half the finger distance, capped. Up or zero stays 0. */
export function pullDistance(dy: number): number {
  if (!(dy > 0)) return 0;
  return Math.min(PULL.maxPx, dy * PULL.resist);
}
/** Where the pull is: nothing, still short of the threshold, or far enough to refresh on release. */
export function pullState(shown: number): PullState {
  if (!(shown > 0)) return 'idle';
  return shown >= PULL.thresholdPx ? 'ready' : 'pulling';
}
/** What lifting the finger does. */
export function pullRelease(shown: number): 'refresh' | 'cancel' {
  return pullState(shown) === 'ready' ? 'refresh' : 'cancel';
}
/** A pull may start only with the page at the very top, a finger (touch), nothing else busy, and not while a refresh runs. */
export function pullMayStart(scrollY: number, busy: boolean): boolean {
  return !busy && scrollY <= 0;
}
/** The first move decides: downward and mostly vertical = a pull; anything else hands the gesture back to the page. */
export function pullIsVertical(dx: number, dy: number): boolean {
  return dy > PULL.startSlackPx && dy > Math.abs(dx);
}

/** A skeleton shows only after this long (ms): a load faster than that never flashes grey blocks. CSS uses the same number as a delay. */
export const SKELETON_DELAY_MS = 150;

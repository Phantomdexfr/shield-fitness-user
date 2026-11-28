// Guided walkthrough (Phase 116): the step list and the state rules as pure code. No DOM, no store, no clock (time is a parameter).
// The overlay (src/ui/components/Tour.tsx) reads the real screen; this file only decides WHAT comes next and WHO sees it.
// Rules (owner brief): never a hard gate (Next, Back, Skip tour on every step; a `required` step still has "Skip this step"),
// steps are stored by id (an app kill resumes at the same step), existing users never get it automatically, a manual start ignores "done".

import type { StringKey } from '../i18n';

export interface TourStep {
  /** Stable id. Stored on the device instead of an index, so reordering later never resumes at the wrong step. */
  id: string;
  /** Page this step lives on. A trailing `/*` means "any page under it" (the session page has an id in its address). null = stay where you are. */
  route: string | null;
  /** `data-tour="<target>"` on a real element. null = a centred card with no spotlight. */
  target: string | null;
  titleKey: StringKey;
  bodyKey: StringKey;
  /** Only makes sense after a real tap. The card then shows "Skip this step" instead of Next (never a dead end). */
  required?: boolean;
  placement?: 'above' | 'below' | 'auto';
  /** Tapping the highlighted element does its real action AND moves on. Default true; false for containers and risky buttons (the spotlight then blocks taps). */
  tapAdvances?: boolean;
  /** How long to wait for the target to appear before the step is skipped silently. Default WAIT_MS. */
  waitMs?: number;
  /** Skip at once when this earlier step was skipped because its target was missing (nothing to wait for). */
  needs?: string;
}

export const WAIT_MS = 1500;

/** The tour, in order. `required` is used twice at most (Start, Add exercise). Text lives in src/i18n/en.ts under `tour.*`. */
export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome', route: '/', target: null, titleKey: 'tour.welcome.title', bodyKey: 'tour.welcome.body' },
  { id: 'today', route: '/', target: 'today-card', titleKey: 'tour.today.title', bodyKey: 'tour.today.body', tapAdvances: false, placement: 'below' },
  { id: 'train-tab', route: '/', target: 'tab-train', titleKey: 'tour.trainTab.title', bodyKey: 'tour.trainTab.body', placement: 'above' },
  { id: 'train-more', route: '/train', target: 'train-ways', titleKey: 'tour.ways.title', bodyKey: 'tour.ways.body', tapAdvances: false },
  { id: 'train-start', route: '/train', target: 'train-start', titleKey: 'tour.start.title', bodyKey: 'tour.start.body', required: true },
  { id: 'add-exercise', route: '/session/*', target: 'session-add', titleKey: 'tour.add.title', bodyKey: 'tour.add.body', required: true, waitMs: 3000, needs: 'train-start', placement: 'below' },
  { id: 'logger', route: '/session/*', target: 'logger-entry', titleKey: 'tour.logger.title', bodyKey: 'tour.logger.body', tapAdvances: false, needs: 'add-exercise', placement: 'above' },
  { id: 'finish', route: '/session/*', target: 'session-finish', titleKey: 'tour.finish.title', bodyKey: 'tour.finish.body', tapAdvances: false, needs: 'add-exercise', placement: 'below' },
  { id: 'library', route: '/library', target: 'library-search', titleKey: 'tour.library.title', bodyKey: 'tour.library.body', tapAdvances: false, placement: 'below' },
  { id: 'body', route: '/body', target: 'body-title', titleKey: 'tour.body.title', bodyKey: 'tour.body.body', tapAdvances: false, placement: 'below' },
  { id: 'replay', route: '/settings/appearance', target: 'tour-row', titleKey: 'tour.replay.title', bodyKey: 'tour.replay.body', tapAdvances: false },
  { id: 'done', route: null, target: null, titleKey: 'tour.done.title', bodyKey: 'tour.done.body' },
];

export const stepIds = (steps: readonly TourStep[] = TOUR_STEPS): string[] => steps.map((s) => s.id);
export const stepById = (id: string | null | undefined, steps: readonly TourStep[] = TOUR_STEPS): TourStep | undefined => steps.find((s) => s.id === id);
export const stepIndex = (id: string, steps: readonly TourStep[] = TOUR_STEPS): number => steps.findIndex((s) => s.id === id);

/** The next step, or null after the last one (= the tour is over). An unknown id counts as "before the start". */
export function nextStep(id: string, steps: readonly TourStep[] = TOUR_STEPS): TourStep | null {
  const i = stepIndex(id, steps);
  return steps[i + 1] ?? null;
}

/** The step before this one, or null on the first (Back is not offered there). */
export function prevStep(id: string, steps: readonly TourStep[] = TOUR_STEPS): TourStep | null {
  const i = stepIndex(id, steps);
  return i > 0 ? (steps[i - 1] ?? null) : null;
}

/** "Step n of N" for the card (1-based). */
export function progressOf(id: string, steps: readonly TourStep[] = TOUR_STEPS): { n: number; total: number } {
  return { n: Math.max(stepIndex(id, steps), 0) + 1, total: steps.length };
}

// ---------- the stored record ----------

/** One device row `tour`. `auto` = this install may start the tour by itself (false for an install that existed before the feature). */
export interface TourRecord {
  v: 1;
  done: boolean;
  skipped: boolean;
  /** The step to resume at while the tour is running; null when done. */
  stepId: string | null;
  auto: boolean;
}

export function parseTour(raw: unknown): TourRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.done !== 'boolean') return null;
  const stepId = typeof o.stepId === 'string' && stepById(o.stepId) ? o.stepId : null;
  return { v: 1, done: o.done, skipped: o.skipped === true, stepId, auto: o.auto === true };
}

/** First launch of the updated app on an install that already finished onboarding: never start by itself. */
export const existingUserRecord = (): TourRecord => ({ v: 1, done: true, skipped: false, stepId: null, auto: false });

export const isDone = (rec: TourRecord | null): boolean => rec !== null && rec.done;

/** The record while the tour runs at `stepId`. `auto` is kept as it was (a manual start never turns automatic behaviour on). */
export const runningRecord = (rec: TourRecord | null, stepId: string, auto: boolean): TourRecord => ({ v: 1, done: false, skipped: false, stepId, auto: rec ? rec.auto : auto });
export const finishedRecord = (rec: TourRecord | null): TourRecord => ({ v: 1, done: true, skipped: false, stepId: null, auto: rec ? rec.auto : false });
export const skippedRecord = (rec: TourRecord | null): TourRecord => ({ v: 1, done: true, skipped: true, stepId: null, auto: rec ? rec.auto : false });

/** Where a running tour resumes: the stored step, else the first. */
export function resumeStep(rec: TourRecord | null, steps: readonly TourStep[] = TOUR_STEPS): TourStep {
  return stepById(rec?.stepId, steps) ?? steps[0]!;
}

// ---------- who sees it, and when ----------

/** Pages where a tour may open by itself: never the welcome flow, the gym connect pages or the dev preview. (A workout page is allowed only for RESUME, see below.) */
export function isNormalPage(path: string): boolean {
  if (path === '/welcome' || path.startsWith('/welcome/')) return false;
  if (path.startsWith('/session/')) return false;
  if (path === '/connect' || path.startsWith('/dev/')) return false;
  return true;
}

export interface LaunchInput {
  rec: TourRecord | null;
  /** Onboarding was already finished when the app opened (before this launch's flow). */
  onboardingFinishedAtBoot: boolean;
  /** Onboarding is finished right now (it may have finished during this launch). */
  onboardingFinishedNow: boolean;
  path: string;
  running: boolean;
}

export type LaunchDecision = 'start' | 'resume' | 'mark-existing' | 'none';

/**
 * What the app does about the tour on opening or on a page change.
 * - No record + onboarding already finished at boot = an existing user: write the "done, never auto" record, show nothing.
 * - No record + onboarding finished during this launch = a brand-new install: start.
 * - A record that is not done and has a step = the tour was closed mid-way: resume.
 * - Anything else (done, running, on the welcome flow): nothing.
 */
export function launchDecision(i: LaunchInput): LaunchDecision {
  if (i.running) return 'none';
  if (i.rec === null) {
    if (i.onboardingFinishedAtBoot) return 'mark-existing';
    if (i.onboardingFinishedNow && isNormalPage(i.path)) return 'start';
    return 'none';
  }
  if (i.rec.done || i.rec.stepId === null) return 'none';
  if (blocksResume(i.path)) return 'none';
  return 'resume';
}

const blocksResume = (path: string): boolean => path === '/welcome' || path.startsWith('/welcome/') || path === '/connect' || path.startsWith('/dev/');

/** Kept for readability at call sites: `shouldAutoStart` is the 'start' outcome only. */
export const shouldAutoStart = (i: LaunchInput): boolean => launchDecision(i) === 'start';

/** The manual "Start walkthrough" row: allowed unless a workout is open (it must not start on top of the logger). `done` is ignored on purpose. */
export function manualStartAllowed(openWorkout: boolean): boolean {
  return !openWorkout;
}

// ---------- routes ----------

/** A step route against the current path. `/session/*` matches any page below `/session/`. */
export function routeMatches(pattern: string | null, path: string): boolean {
  if (pattern === null) return true;
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}

/** Where to navigate to reach the step's page, or null when the page has no fixed address (it must already be open). */
export function navTarget(step: TourStep): string | null {
  return step.route === null || step.route.endsWith('/*') ? null : step.route;
}

/** The step to try after `id` is skipped because its target never appeared: forward when moving on, backward when going Back. */
export function afterMissing(id: string, dir: 1 | -1, steps: readonly TourStep[] = TOUR_STEPS): TourStep | null {
  return dir === 1 ? nextStep(id, steps) : prevStep(id, steps);
}

/** True when the step can be skipped right away because the step it `needs` was itself skipped for a missing target. */
export const skipAtOnce = (step: TourStep, missed: ReadonlySet<string>): boolean => step.needs !== undefined && missed.has(step.needs);

// ---------- card placement (pure geometry) ----------

export interface Rect { top: number; left: number; width: number; height: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Placement { top: number; left: number; side: 'above' | 'below' | 'center' }

/**
 * Where the tip card goes. With a target: above or below it (never over it when there is room), horizontally centred on it and kept inside
 * the viewport and the safe areas. Without one: centred. `pref` is honoured when that side has room; otherwise the side with more room wins.
 * Rects are in viewport pixels. `pad` is the spotlight padding already included in `rect`.
 */
export function placeCard(i: { rect: Rect | null; vw: number; vh: number; card: { w: number; h: number }; inset: Insets; pref?: 'above' | 'below' | 'auto'; gap?: number; margin?: number }): Placement {
  const gap = i.gap ?? 12;
  const margin = i.margin ?? 16;
  const minTop = i.inset.top + margin;
  const maxBottom = i.vh - i.inset.bottom - margin;
  const minLeft = i.inset.left + margin;
  const maxLeft = Math.max(minLeft, i.vw - i.inset.right - margin - i.card.w);
  const clampLeft = (l: number) => Math.min(Math.max(l, minLeft), maxLeft);
  if (!i.rect) {
    return { side: 'center', left: clampLeft((i.vw - i.card.w) / 2), top: Math.max(minTop, (i.vh - i.card.h) / 2) };
  }
  const r = i.rect;
  const roomAbove = r.top - gap - minTop;
  const roomBelow = maxBottom - (r.top + r.height + gap);
  const fitsAbove = roomAbove >= i.card.h;
  const fitsBelow = roomBelow >= i.card.h;
  let side: 'above' | 'below';
  if (i.pref === 'above' && fitsAbove) side = 'above';
  else if (i.pref === 'below' && fitsBelow) side = 'below';
  else if (fitsBelow && !fitsAbove) side = 'below';
  else if (fitsAbove && !fitsBelow) side = 'above';
  else if (fitsAbove && fitsBelow) side = roomBelow >= roomAbove ? 'below' : 'above';
  else side = roomBelow >= roomAbove ? 'below' : 'above';
  const left = clampLeft(r.left + r.width / 2 - i.card.w / 2);
  const rawTop = side === 'above' ? r.top - gap - i.card.h : r.top + r.height + gap;
  const top = Math.min(Math.max(rawTop, minTop), Math.max(minTop, maxBottom - i.card.h));
  return { side, left, top };
}

/** Grow a rect by `pad` on every side (the spotlight sits a little outside the real element). */
export const padRect = (r: Rect, pad: number): Rect => ({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });

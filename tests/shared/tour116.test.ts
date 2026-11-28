import { describe, expect, test } from 'vitest';
import {
  TOUR_STEPS, afterMissing, existingUserRecord, finishedRecord, isDone, isNormalPage, launchDecision, manualStartAllowed, navTarget,
  nextStep, padRect, parseTour, placeCard, prevStep, progressOf, resumeStep, routeMatches, runningRecord, shouldAutoStart, skipAtOnce, skippedRecord,
  stepById, stepIds, type TourRecord,
} from '../../src/shared/tour';
import { en } from '../../src/i18n/en';

const ids = stepIds();
const base = { onboardingFinishedAtBoot: false, onboardingFinishedNow: false, path: '/', running: false };

describe('step list', () => {
  test('ids are unique, 8 to 12 steps, first and last are target-less cards', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids.length).toBeLessThanOrEqual(12);
    expect(TOUR_STEPS[0]!.target).toBeNull();
    expect(TOUR_STEPS[ids.length - 1]!.target).toBeNull();
  });
  test('required is used at most twice', () => {
    expect(TOUR_STEPS.filter((s) => s.required).length).toBeLessThanOrEqual(2);
  });
  test('every title and body key exists in en.ts and every body is at most two short sentences', () => {
    for (const s of TOUR_STEPS) {
      expect(s.titleKey in en, s.titleKey).toBe(true);
      expect(s.bodyKey in en, s.bodyKey).toBe(true);
      const body = (en as Record<string, string>)[s.bodyKey]!;
      expect(body.split(/[.!?]\s/).length, s.bodyKey).toBeLessThanOrEqual(2);
    }
  });
  test('"needs" points at an earlier step', () => {
    for (const s of TOUR_STEPS) if (s.needs) expect(ids.indexOf(s.needs)).toBeGreaterThanOrEqual(0), expect(ids.indexOf(s.needs)).toBeLessThan(ids.indexOf(s.id));
  });
});

describe('navigation', () => {
  test('next / prev walk the list; null at the ends', () => {
    expect(nextStep('welcome')!.id).toBe(ids[1]);
    expect(prevStep('welcome')).toBeNull();
    expect(nextStep(ids[ids.length - 1]!)).toBeNull();
    expect(prevStep(ids[1]!)!.id).toBe('welcome');
  });
  test('progress is 1-based', () => {
    expect(progressOf('welcome')).toEqual({ n: 1, total: ids.length });
    expect(progressOf('done').n).toBe(ids.length);
  });
  test('a missing target moves forward going on and backward going Back', () => {
    expect(afterMissing('today', 1)!.id).toBe(ids[2]);
    expect(afterMissing('today', -1)!.id).toBe('welcome');
    expect(afterMissing('done', 1)).toBeNull();
  });
  test('skipAtOnce only when the needed step was skipped', () => {
    const logger = stepById('logger')!;
    expect(skipAtOnce(logger, new Set())).toBe(false);
    expect(skipAtOnce(logger, new Set(['add-exercise']))).toBe(true);
    expect(skipAtOnce(stepById('today')!, new Set(['add-exercise']))).toBe(false);
  });
  test('routes: exact, session wildcard, null', () => {
    expect(routeMatches('/train', '/train')).toBe(true);
    expect(routeMatches('/train', '/train/x')).toBe(false);
    expect(routeMatches('/session/*', '/session/abc')).toBe(true);
    expect(routeMatches('/session/*', '/train')).toBe(false);
    expect(routeMatches(null, '/anything')).toBe(true);
    expect(navTarget(stepById('train-more')!)).toBe('/train');
    expect(navTarget(stepById('logger')!)).toBeNull();
    expect(navTarget(stepById('done')!)).toBeNull();
  });
});

describe('record', () => {
  test('parse: garbage is null, unknown step id becomes null, flags are booleans', () => {
    expect(parseTour(null)).toBeNull();
    expect(parseTour('x')).toBeNull();
    expect(parseTour({ done: 'yes' })).toBeNull();
    expect(parseTour({ done: false, stepId: 'nope' })).toEqual({ v: 1, done: false, skipped: false, stepId: null, auto: false });
    expect(parseTour({ done: false, stepId: 'logger', auto: true })).toMatchObject({ stepId: 'logger', auto: true });
  });
  test('resume uses the stored id, not an index; unknown falls back to the first', () => {
    expect(resumeStep({ v: 1, done: false, skipped: false, stepId: 'library', auto: true }).id).toBe('library');
    expect(resumeStep(null).id).toBe('welcome');
    expect(resumeStep({ v: 1, done: false, skipped: false, stepId: null, auto: true }).id).toBe('welcome');
  });
  test('finishing and skipping both store done, and keep `auto` as it was', () => {
    const rec: TourRecord = { v: 1, done: false, skipped: false, stepId: 'logger', auto: true };
    expect(finishedRecord(rec)).toEqual({ v: 1, done: true, skipped: false, stepId: null, auto: true });
    expect(skippedRecord(rec)).toEqual({ v: 1, done: true, skipped: true, stepId: null, auto: true });
    expect(isDone(skippedRecord(rec))).toBe(true);
    expect(isDone(null)).toBe(false);
  });
});

describe('who sees it automatically', () => {
  test('existing user (onboarding finished before this launch, no record): marked done with auto false, no start', () => {
    const d = launchDecision({ ...base, onboardingFinishedAtBoot: true, onboardingFinishedNow: true, rec: null });
    expect(d).toBe('mark-existing');
    expect(shouldAutoStart({ ...base, onboardingFinishedAtBoot: true, onboardingFinishedNow: true, rec: null })).toBe(false);
    expect(existingUserRecord()).toMatchObject({ done: true, auto: false });
  });
  test('brand-new install: no start during onboarding, start once onboarding finishes on a normal page', () => {
    expect(launchDecision({ ...base, path: '/welcome', rec: null })).toBe('none');
    expect(launchDecision({ ...base, onboardingFinishedNow: true, path: '/welcome', rec: null })).toBe('none');
    expect(launchDecision({ ...base, onboardingFinishedNow: true, path: '/', rec: null })).toBe('start');
  });
  test('never on top of a workout page, never while running, never once done', () => {
    expect(launchDecision({ ...base, onboardingFinishedNow: true, path: '/session/abc', rec: null })).toBe('none');
    expect(launchDecision({ ...base, onboardingFinishedNow: true, running: true, rec: null })).toBe('none');
    expect(launchDecision({ ...base, onboardingFinishedNow: true, rec: finishedRecord(null) })).toBe('none');
    expect(launchDecision({ ...base, onboardingFinishedNow: true, rec: skippedRecord(null) })).toBe('none');
  });
  test('closed mid-tour: resumes (also an existing user who started it by hand); not on the welcome flow', () => {
    const mid = runningRecord(null, 'logger', true);
    expect(launchDecision({ ...base, onboardingFinishedAtBoot: true, rec: mid })).toBe('resume');
    expect(launchDecision({ ...base, onboardingFinishedAtBoot: true, rec: runningRecord(existingUserRecord(), 'body', true) })).toBe('resume');
    expect(launchDecision({ ...base, path: '/welcome', rec: mid })).toBe('none');
  });
  test('a manual run keeps auto false for an existing user, and finishing it leaves nothing automatic', () => {
    const run = runningRecord(existingUserRecord(), 'welcome', true);
    expect(run.auto).toBe(false);
    const end = finishedRecord(run);
    expect(end).toMatchObject({ done: true, auto: false });
    expect(launchDecision({ ...base, onboardingFinishedAtBoot: true, rec: end })).toBe('none');
  });
  test('manual start ignores done but not an open workout', () => {
    expect(manualStartAllowed(false)).toBe(true);
    expect(manualStartAllowed(true)).toBe(false);
  });
  test('normal pages', () => {
    for (const p of ['/', '/train', '/library', '/body', '/me', '/settings/appearance']) expect(isNormalPage(p), p).toBe(true);
    for (const p of ['/welcome', '/session/x', '/connect', '/dev/design-preview']) expect(isNormalPage(p), p).toBe(false);
  });
});

describe('card placement', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const card = { w: 300, h: 160 };
  test('no target: centred', () => {
    const p = placeCard({ rect: null, vw: 360, vh: 800, card, inset });
    expect(p.side).toBe('center');
    expect(p.left).toBe(30);
    expect(p.top).toBe(320);
  });
  test('below a target near the top, above a target near the bottom, never over it', () => {
    const top = placeCard({ rect: { top: 80, left: 20, width: 320, height: 100 }, vw: 360, vh: 800, card, inset });
    expect(top.side).toBe('below');
    expect(top.top).toBeGreaterThanOrEqual(80 + 100);
    const bottom = placeCard({ rect: { top: 700, left: 20, width: 60, height: 60 }, vw: 360, vh: 800, card, inset });
    expect(bottom.side).toBe('above');
    expect(bottom.top + card.h).toBeLessThanOrEqual(700);
  });
  test('the preference is honoured when it fits, and ignored when it does not', () => {
    const r = { top: 300, left: 20, width: 100, height: 60 };
    expect(placeCard({ rect: r, vw: 360, vh: 800, card, inset, pref: 'above' }).side).toBe('above');
    expect(placeCard({ rect: r, vw: 360, vh: 800, card, inset, pref: 'below' }).side).toBe('below');
    expect(placeCard({ rect: { top: 20, left: 20, width: 100, height: 60 }, vw: 360, vh: 800, card, inset, pref: 'above' }).side).toBe('below');
  });
  test('stays inside the viewport and the safe areas', () => {
    const ins = { top: 47, right: 10, bottom: 34, left: 10 };
    const p = placeCard({ rect: { top: 400, left: 330, width: 30, height: 30 }, vw: 360, vh: 800, card, inset: ins });
    expect(p.left).toBeGreaterThanOrEqual(10 + 16);
    expect(p.left + card.w).toBeLessThanOrEqual(360 - 10 - 16);
    expect(p.top).toBeGreaterThanOrEqual(47 + 16);
    expect(p.top + card.h).toBeLessThanOrEqual(800 - 34 - 16);
  });
  test('padRect grows on every side', () => {
    expect(padRect({ top: 10, left: 10, width: 20, height: 20 }, 6)).toEqual({ top: 4, left: 4, width: 32, height: 32 });
  });
});

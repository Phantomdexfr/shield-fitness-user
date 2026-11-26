// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { SWIPE_EDGE_PX, SWIPE_MIN_PX, motionAllowed, navDirection, swipeBackRelease, swipeBackStarts } from '../../src/ui/components/motion';
import { consumePageDir, pageMotionOn, sharedNavigate, viewTransitionsSupported } from '../../src/app/pageMotion';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

afterEach(() => { document.documentElement.removeAttribute('data-motion'); delete (document as unknown as Record<string, unknown>).startViewTransition; });

describe('direction rule', () => {
  test('deeper = push, shallower = pop, same = none', () => {
    expect(navDirection(0, 1)).toBe('push');
    expect(navDirection(3, 2)).toBe('pop');
    expect(navDirection(2, 2)).toBe('none');
  });
  test('the one-shot flags: a swipe or a view transition suppresses the page animation once', () => {
    expect(consumePageDir(1, 2)).toBe('push');
    expect(consumePageDir(2, 1)).toBe('pop');
    expect(consumePageDir(1, 1)).toBe('none');
  });
});

describe('back swipe rule', () => {
  test('starts only at the left edge and only with a page behind', () => {
    expect(swipeBackStarts(SWIPE_EDGE_PX, true)).toBe(true);
    expect(swipeBackStarts(SWIPE_EDGE_PX + 1, true)).toBe(false);
    expect(swipeBackStarts(5, false)).toBe(false);
  });
  test('short pull cancels, 40% or a flick goes back, a tiny flick does not', () => {
    expect(swipeBackRelease(SWIPE_MIN_PX - 1, 2, 360)).toBe('cancel');
    expect(swipeBackRelease(100, 0, 360)).toBe('cancel');
    expect(swipeBackRelease(144, 0, 360)).toBe('back');
    expect(swipeBackRelease(60, 0.6, 360)).toBe('back');
    expect(swipeBackRelease(20, 0.9, 360)).toBe('cancel');
    expect(swipeBackRelease(100, 0, 0)).toBe('cancel');
  });
});

describe('reduced motion and the fallback path', () => {
  test('either setting means no motion', () => {
    expect(motionAllowed('full')).toBe(true);
    expect(motionAllowed(null)).toBe(true);
    expect(motionAllowed('reduced')).toBe(false);
  });
  test('pageMotionOn follows the style switch and the Motion setting', () => {
    applyUx(DEFAULT_SWITCHES);
    expect(pageMotionOn()).toBe(true);
    document.documentElement.setAttribute('data-motion', 'reduced');
    expect(pageMotionOn()).toBe(false);
    document.documentElement.removeAttribute('data-motion');
    applyUx(allSwitches(false));
    expect(pageMotionOn()).toBe(false);
    applyUx(DEFAULT_SWITCHES);
  });
  test('no View Transitions support: sharedNavigate does nothing and the normal link runs', () => {
    applyUx(DEFAULT_SWITCHES);
    expect(viewTransitionsSupported()).toBe(false);
    const row = document.createElement('li');
    row.innerHTML = '<span class="sf-lib__name">Squat</span>';
    let went = 0;
    expect(sharedNavigate(row, () => { went += 1; })).toBe(false);
    expect(went).toBe(0);
  });
  test('with support but Reduced motion, it still does nothing', () => {
    applyUx(DEFAULT_SWITCHES);
    (document as unknown as Record<string, unknown>).startViewTransition = () => ({ finished: Promise.resolve() });
    document.documentElement.setAttribute('data-motion', 'reduced');
    const row = document.createElement('li');
    row.innerHTML = '<span class="sf-lib__name">Squat</span>';
    expect(sharedNavigate(row, () => {})).toBe(false);
  });
  test('with support and full motion it starts a transition, names the row title, and clears the name after', async () => {
    applyUx(DEFAULT_SWITCHES);
    let ran: (() => Promise<void> | void) | undefined;
    (document as unknown as Record<string, unknown>).startViewTransition = (cb: () => Promise<void> | void) => { ran = cb; return { finished: Promise.resolve() }; };
    const row = document.createElement('li');
    row.innerHTML = '<span class="sf-lib__name">Squat</span>';
    let went = 0;
    expect(sharedNavigate(row, () => { went += 1; })).toBe(true);
    expect(row.querySelector<HTMLElement>('.sf-lib__name')!.style.viewTransitionName).toBe('sf-ex-title');
    expect(ran).toBeTypeOf('function');
    await Promise.resolve(); await Promise.resolve();
    expect(row.querySelector<HTMLElement>('.sf-lib__name')!.style.viewTransitionName).toBe('');
    expect(went).toBe(0);
  });
});

describe('motion.css', () => {
  const css = readFileSync(join(__dirname, '../../src/ui/styles/premium/motion.css'), 'utf8');
  test('push and pop keyframes, reduced-motion rules, shared element, imported by the premium index', () => {
    for (const k of ['sf-nav-push', 'sf-nav-pop', "[data-dir='push']", "[data-dir='pop']", 'prefers-reduced-motion', "[data-motion='reduced']", 'view-transition-group(sf-ex-title)']) expect(css).toContain(k);
    expect(readFileSync(join(__dirname, '../../src/ui/styles/premium/index.css'), 'utf8')).toContain("./motion.css");
  });
});

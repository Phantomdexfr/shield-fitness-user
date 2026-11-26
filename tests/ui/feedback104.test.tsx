// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PrMark, PullToRefresh, SetCheck } from '../../src/ui/components';
import { Ring, StatTile } from '../../src/ui/charts';
import { PULL, claimPlay, fxPlays, pullDistance, pullIsVertical, pullMayStart, pullRelease, pullState, resetPlayed } from '../../src/ui/components/motion';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

const host = document.createElement('div');
document.body.appendChild(host);
const root = document.documentElement;
afterEach(() => {
  render(null, host);
  root.removeAttribute('data-motion');
  resetPlayed();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});
const premium = () => applyUx(DEFAULT_SWITCHES);
const classic = () => applyUx(allSwitches(false));
const mount = async (v: preact.VNode) => { await act(async () => { render(null, host); render(v, host); }); };
const q = (s: string) => host.querySelector(s) as HTMLElement | null;
const touch = async (type: string, y: number, x = 100) => {
  await act(async () => {
    const e = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
    document.dispatchEvent(e);
  });
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('the rules (pure)', () => {
  test('fxPlays: premium also obeys the in-app Motion setting, classic keeps the phone setting only', () => {
    expect(fxPlays('premium', 'full')).toBe(true);
    expect(fxPlays('premium', 'reduced')).toBe(false);
    expect(fxPlays('classic', 'reduced')).toBe(true);
  });
  test('claimPlay: once per (view, key); a new view starts fresh', () => {
    expect(claimPlay('/progress', 'ring:week')).toBe(true);
    expect(claimPlay('/progress', 'ring:week')).toBe(false);
    expect(claimPlay('/progress', 'bar:volume')).toBe(true);
    expect(claimPlay('/today', 'ring:week')).toBe(true);
    expect(claimPlay('/progress', 'ring:week')).toBe(true);
  });
  test('pull: resisted, capped, threshold, release, start rules', () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(10000)).toBe(PULL.maxPx);
    expect(pullState(0)).toBe('idle');
    expect(pullState(PULL.thresholdPx - 1)).toBe('pulling');
    expect(pullState(PULL.thresholdPx)).toBe('ready');
    expect(pullRelease(PULL.thresholdPx - 1)).toBe('cancel');
    expect(pullRelease(PULL.thresholdPx)).toBe('refresh');
    expect(pullMayStart(0, false)).toBe(true);
    expect(pullMayStart(20, false)).toBe(false);
    expect(pullMayStart(0, true)).toBe(false);
    expect(pullIsVertical(2, 30)).toBe(true);
    expect(pullIsVertical(40, 30)).toBe(false);
    expect(pullIsVertical(0, -30)).toBe(false);
  });
});

describe('count-up and draw-in', () => {
  test('Premium counts up from 0 to the exact value; once per view, a later change shows at once', async () => {
    premium();
    await mount(<StatTile label="Streak" value={7} />);
    expect(q('.sf-ch-stat-num')?.textContent).toBe('0');
    await act(async () => { await sleep(900); });
    expect(q('.sf-ch-stat-num')?.textContent).toBe('7');
    await mount(<StatTile label="Streak" value={7} />);
    await act(async () => { render(<StatTile label="Streak" value={9} />, host); });
    expect(q('.sf-ch-stat-num')?.textContent).toBe('9');
  });
  test('a remount in the same view does not count again', async () => {
    premium();
    await mount(<StatTile label="Volume" value={50} />);
    await act(async () => { await sleep(900); });
    await mount(<StatTile label="Volume" value={50} />);
    expect(q('.sf-ch-stat-num')?.textContent).toBe('50');
  });
  test('Motion Reduced: no count-up, the number is final at once', async () => {
    premium();
    root.setAttribute('data-motion', 'reduced');
    await mount(<StatTile label="Streak" value={7} />);
    expect(q('.sf-ch-stat-num')?.textContent).toBe('7');
  });
  test('Ring draws in once in Premium, never under Motion Reduced, again in a new view', async () => {
    premium();
    await mount(<Ring title="Week" value={3} max={5} />);
    expect(host.querySelector('.sf-ch-sweep')).not.toBeNull();
    await mount(<Ring title="Week" value={3} max={5} />);
    expect(host.querySelector('.sf-ch-sweep')).toBeNull();
    expect(host.querySelector('.sf-ch-still')).not.toBeNull();
    history.pushState({}, '', '/other');
    await mount(<Ring title="Week" value={3} max={5} />);
    expect(host.querySelector('.sf-ch-sweep')).not.toBeNull();
    history.pushState({}, '', '/');
    resetPlayed();
    root.setAttribute('data-motion', 'reduced');
    await mount(<Ring title="Week" value={3} max={5} />);
    expect(host.querySelector('.sf-ch-sweep')).toBeNull();
  });
  test('Classic keeps its old behaviour (draws on every mount)', async () => {
    classic();
    await mount(<Ring title="Week" value={3} max={5} />);
    await mount(<Ring title="Week" value={3} max={5} />);
    expect(host.querySelector('.sf-ch-sweep')).not.toBeNull();
  });
});

describe('set check and PR mark', () => {
  test('SetCheck: Premium draws it, Classic and Reduced draw nothing', async () => {
    premium();
    await mount(<SetCheck />);
    expect(q('.sf-fx-check path')).not.toBeNull();
    root.setAttribute('data-motion', 'reduced');
    await mount(<SetCheck />);
    expect(q('.sf-fx-check')).toBeNull();
    root.removeAttribute('data-motion');
    classic();
    await mount(<SetCheck />);
    expect(q('.sf-fx-check')).toBeNull();
  });
  test('PrMark: gold mark with one glow in Premium, no glow when reduced, nothing in Classic', async () => {
    premium();
    await mount(<PrMark />);
    expect(q('.sf-fx-pr')?.textContent).toBe('PR');
    expect(q('.sf-fx-pr--glow')).not.toBeNull();
    root.setAttribute('data-motion', 'reduced');
    await mount(<PrMark />);
    expect(q('.sf-fx-pr')).not.toBeNull();
    expect(q('.sf-fx-pr--glow')).toBeNull();
    root.removeAttribute('data-motion');
    classic();
    await mount(<PrMark />);
    expect(q('.sf-fx-pr')).toBeNull();
  });
});

describe('pull to refresh', () => {
  test('a short pull cancels, a long pull refreshes once and shows the pill states', async () => {
    premium();
    const onRefresh = vi.fn(() => new Promise<void>((r) => setTimeout(r, 30)));
    await mount(<PullToRefresh onRefresh={onRefresh}><p id="x">page</p></PullToRefresh>);
    await touch('touchstart', 100);
    await touch('touchmove', 150);
    expect(q('.sf-ptr')?.getAttribute('data-state')).toBe('pulling');
    await touch('touchend', 150);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(q('.sf-ptr')?.getAttribute('data-state')).toBe('idle');
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    expect(q('.sf-ptr')?.getAttribute('data-state')).toBe('ready');
    await touch('touchend', 300);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(q('.sf-ptr')?.getAttribute('data-state')).toBe('busy');
    await act(async () => { await sleep(80); });
    expect(q('.sf-ptr')?.getAttribute('data-state')).toBe('done');
    expect(q('.sf-ptr__pill')?.textContent).toContain('Up to date');
  });
  test('does not start away from the top, on a sideways move, or while a refresh runs', async () => {
    premium();
    const onRefresh = vi.fn(() => new Promise<void>((r) => setTimeout(r, 50)));
    await mount(<PullToRefresh onRefresh={onRefresh}><p>page</p></PullToRefresh>);
    Object.defineProperty(window, 'scrollY', { value: 30, configurable: true });
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    await touch('touchend', 300);
    expect(onRefresh).not.toHaveBeenCalled();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    await touch('touchstart', 100, 100);
    await touch('touchmove', 110, 220);
    await touch('touchend', 110, 220);
    expect(onRefresh).not.toHaveBeenCalled();
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    await touch('touchend', 300);
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    await touch('touchend', 300);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { await sleep(1100); });
  });
  test('Classic and Motion Reduced render the children as they are (no wrapper, no listener)', async () => {
    const onRefresh = vi.fn(async () => undefined);
    classic();
    await mount(<PullToRefresh onRefresh={onRefresh}><p id="x">page</p></PullToRefresh>);
    expect(q('.sf-ptr')).toBeNull();
    expect(q('#x')).not.toBeNull();
    premium();
    root.setAttribute('data-motion', 'reduced');
    await mount(<PullToRefresh onRefresh={onRefresh}><p id="x">page</p></PullToRefresh>);
    expect(q('.sf-ptr')).toBeNull();
    await touch('touchstart', 100);
    await touch('touchmove', 300);
    await touch('touchend', 300);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('the CSS', () => {
  const css = readFileSync(join(process.cwd(), 'src/ui/styles/premium/motion.css'), 'utf8');
  test('keyframes, the 150 ms skeleton wait and the reduced-motion switches exist', () => {
    for (const k of ['sf-fx-pop', 'sf-fx-out', 'sf-fx-flash', 'sf-fx-glow', 'sf-fx-show']) expect(css).toContain(`@keyframes ${k}`);
    expect(css).toMatch(/\.sf-skeleton \{[^}]*sf-fx-show 1ms linear 150ms backwards/);
    expect(css).toContain("[data-motion='reduced'] .sf-skeleton");
    expect(css).toContain("[data-motion='reduced'] .sf-press[data-pressed='true']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
  test('press: a link row answers with :active too; nothing here loops but the skeleton and the refresh spinner', () => {
    expect(css).toContain('a.sf-press:active');
    const loops = [...css.matchAll(/^.*infinite.*$/gm)].map((m) => m[0]);
    expect(loops.length).toBe(2);
  });
});

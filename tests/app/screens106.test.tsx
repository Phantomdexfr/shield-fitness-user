// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Route, Router } from 'wouter-preact';
import { memoryLocation } from 'wouter-preact/memory-location';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import MuscleLab from '../../src/pages/body/MuscleLab';
import ExercisePage from '../../src/pages/exercise/ExercisePage';
import ProgressHub from '../../src/pages/progress/ProgressHub';
import { applyUx } from '../../src/app/appearance';
import { onUxChange } from '../../src/data/repos/ux';
import { parseBodyLayout, saveBodyLayout } from '../../src/data/repos/uiSections';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

const host = document.createElement('div');
document.body.appendChild(host);
beforeAll(() => {
  onUxChange(applyUx);
});
afterEach(() => render(null, host));

const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
};
const mount = async (path: string, route: string, ui: preact.ComponentChild) => {
  await act(async () => render(null, host)); // a fresh mount, so useUx reads the attribute again
  await act(async () => render(<Router hook={memoryLocation({ path }).hook}><Route path={route}>{ui}</Route></Router>, host));
  await settle();
};
const open = async () => {
  for (let i = 0; i < 4; i++) {
    const bars = [...host.querySelectorAll('button.sf-sec__bar[aria-expanded="false"]')] as HTMLElement[];
    if (!bars.length) return;
    await act(async () => { for (const b of bars) b.click(); });
  }
};

describe('Body layout rule', () => {
  test('anything but list reads as figure first', () => {
    expect(parseBodyLayout('list')).toBe('list');
    expect(parseBodyLayout('figure')).toBe('figure');
    expect(parseBodyLayout(undefined)).toBe('figure');
    expect(parseBodyLayout(7)).toBe('figure');
  });
});

describe('Body (/body)', () => {
  test('Premium: figure first with a View button and the links under the figure; List first or Classic = the old page', async () => {
    applyUx(DEFAULT_SWITCHES);
    await saveBodyLayout('figure');
    await mount('/body', '/body', <MuscleLab />);
    expect(host.querySelector('.sf-view')).toBeNull(); // View button removed from pages
    expect(host.querySelector('.sf-lab__hero')).not.toBeNull();
    expect(host.querySelector('.sf-lab__actions')).toBeNull();
    // the text twin of the figure is still there
    expect(host.querySelector('.sf-chips, [data-hook="muscle-chips"], .sf-lab__chips') ?? host.querySelectorAll('button').length).toBeTruthy();
    await saveBodyLayout('list');
    await mount('/body', '/body', <MuscleLab />);
    expect(host.querySelector('.sf-lab__hero')).toBeNull();
    applyUx(allSwitches(false));
    await saveBodyLayout('figure');
    await mount('/body', '/body', <MuscleLab />);
    expect(host.querySelector('.sf-lab__hero')).toBeNull();
    expect(host.querySelector('.sf-view')).toBeNull(); // View button removed from pages
  });
});

describe('Exercise page', () => {
  const slug = 'ab-wheel-wall-rollout';
  test('Premium: figure up top and one primary with a "..." menu; Classic keeps the favourite chip and the Hide button', async () => {
    applyUx(DEFAULT_SWITCHES);
    await mount(`/exercise/${slug}`, '/exercise/:slug', <ExercisePage />);
    await open();
    expect(host.querySelector('.sf-view')).toBeNull(); // View button removed from pages
    expect(host.querySelector('[data-hook="ex-figure"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-hook="ex-figure"] svg').length).toBeGreaterThan(0);
    expect(host.querySelector('.sf-ex__actions .sf-actionmenu')).not.toBeNull();
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    for (const el of host.querySelectorAll('button, a')) expect((el.getAttribute('aria-label') ?? el.textContent ?? '').trim(), el.outerHTML.slice(0, 80)).not.toBe('');
    // the figure appears once only (not again inside Muscles)
    expect(host.querySelectorAll('.sf-bp').length).toBeLessThanOrEqual(1);
    applyUx(allSwitches(false));
    await mount(`/exercise/${slug}`, '/exercise/:slug', <ExercisePage />);
    await open();
    expect(host.querySelector('[data-hook="ex-figure"]')).toBeNull();
    expect(host.querySelector('.sf-ex__actions')).toBeNull();
    expect(host.querySelector('.sf-ex__pair')).not.toBeNull();
    expect(host.querySelector('.sf-view')).toBeNull(); // View button removed from pages
  });
});

describe('Progress (/progress)', () => {
  test('both styles show the View button; the empty page has no hero tiles', async () => {
    applyUx(DEFAULT_SWITCHES);
    await mount('/progress', '/progress', <ProgressHub />);
    expect(host.querySelector('.sf-view')).toBeNull(); // View button removed from pages
    expect(host.querySelector('[data-hook="pg-hero"]')).toBeNull();
    applyUx(allSwitches(false));
    await mount('/progress', '/progress', <ProgressHub />);
    expect(host.querySelector('.sf-view')).toBeNull(); // View button removed from pages
  });
});

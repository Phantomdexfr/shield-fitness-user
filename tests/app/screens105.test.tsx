// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { Router } from 'wouter-preact';
import { memoryLocation } from 'wouter-preact/memory-location';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import MePage, { ME_LINKS, splitMeGroups } from '../../src/pages/MePage';
import SettingsHub from '../../src/pages/settings/SettingsHub';
import SettingsGroupPage, { rowsFor, runsOf } from '../../src/pages/settings/SettingsGroupPage';
import TrainPage from '../../src/pages/session/TrainPage';
import { ViewSheet } from '../../src/ui/components';
import { applyUx } from '../../src/app/appearance';
import { onUxChange } from '../../src/data/repos/ux';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';
import { GROUPS, MORE_GROUPS } from '../../src/shared/settings';

const host = document.createElement('div');
document.body.appendChild(host);
beforeAll(() => {
  onUxChange(applyUx);
});
afterEach(() => render(null, host));

const at = (path: string, ui: preact.ComponentChild) => <Router hook={memoryLocation({ path }).hook}>{ui}</Router>;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const root = () => document.documentElement.getAttribute('data-ux-layout');

describe('pure grouping rules', () => {
  test('Me is cut into groups where Goals and Gym start, order kept, nothing lost', () => {
    const groups = splitMeGroups(ME_LINKS);
    expect(groups.length).toBe(3);
    expect(groups.flat().map((l) => l.to)).toEqual(ME_LINKS.map((l) => l.to));
    expect(groups[1]![0]!.to).toBe('/goals');
    expect(groups[2]![0]!.to).toBe('/gym');
  });
  test('a Me list without Goals or Gym stays one group; an empty list is no group', () => {
    expect(splitMeGroups(ME_LINKS.filter((l) => l.to !== '/goals' && l.to !== '/gym')).length).toBe(1);
    expect(splitMeGroups([])).toEqual([]);
  });
  test('Settings rows: runs of setting rows stack, notes and links break the run', () => {
    const runs = runsOf([
      { kind: 'toggle', pref: 'flow.suggestions', label: 'a' },
      { kind: 'toggle', pref: 'flow.warmups', label: 'b' },
      { kind: 'note', text: 'n' },
      { kind: 'toggle', pref: 'flow.autoFill', label: 'c' },
    ]);
    expect(runs.map((r) => [r.stack, r.rows.length])).toEqual([[true, 2], [false, 1], [true, 1]]);
  });
});

describe('Me', () => {
  test('premium: grouped lists with a tile on every row', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(at('/me', <MePage />), host); });
    expect(host.querySelectorAll('.sf-groups > ul.sf-st__list').length).toBeGreaterThanOrEqual(1);
    const rows = host.querySelectorAll('a.sf-st__group');
    expect(rows.length).toBeGreaterThan(3);
    expect(host.querySelectorAll('.sf-tile').length).toBe(rows.length);
  });
  test('classic: the old single list, no groups wrapper, no tiles', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(at('/me', <MePage />), host); });
    expect(host.querySelector('.sf-groups')).toBeNull();
    expect(host.querySelectorAll('ul.sf-st__list').length).toBe(1);
    expect(host.querySelector('.sf-tile')).toBeNull();
    expect(host.querySelectorAll('a.sf-st__group').length).toBeGreaterThan(3);
  });
  test('both styles show the same rows', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(at('/me', <MePage />), host); });
    const a = [...host.querySelectorAll('a.sf-st__group')].map((n) => n.getAttribute('href'));
    applyUx(allSwitches(false));
    await act(async () => { render(null, host); render(at('/me', <MePage />), host); });
    const b = [...host.querySelectorAll('a.sf-st__group')].map((n) => n.getAttribute('href'));
    expect(a).toEqual(b);
  });
});

describe('Settings hub', () => {
  test('premium: two grouped lists, all twelve groups, tiles', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(at('/settings', <SettingsHub />), host); });
    expect(host.querySelectorAll('.sf-groups > ul.sf-st__list').length).toBe(2);
    expect(host.querySelectorAll('a.sf-st__group').length).toBe(GROUPS.length + MORE_GROUPS.length);
    expect(host.querySelectorAll('.sf-tile').length).toBe(GROUPS.length + MORE_GROUPS.length);
  });
  test('classic: one list of the same rows, no tiles', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(at('/settings', <SettingsHub />), host); });
    expect(host.querySelectorAll('ul.sf-st__list').length).toBe(1);
    expect(host.querySelectorAll('a.sf-st__group').length).toBe(GROUPS.length + MORE_GROUPS.length);
    expect(host.querySelector('.sf-tile')).toBeNull();
  });
});

describe('Settings group page', () => {
  test('premium: setting rows share one container', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(at('/settings/workout-flow', <SettingsGroupPage />), host); });
    await flush();
    const stack = host.querySelector('.sf-st__stack');
    expect(stack).not.toBeNull();
    expect(stack!.querySelectorAll('.sf-toggle').length).toBe(rowsFor('workout-flow').filter((r) => r.kind === 'toggle').length);
  });
  test('classic: no container, the same toggles', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(at('/settings/workout-flow', <SettingsGroupPage />), host); });
    await flush();
    expect(host.querySelector('.sf-st__stack')).toBeNull();
    expect(host.querySelectorAll('.sf-toggle').length).toBe(rowsFor('workout-flow').filter((r) => r.kind === 'toggle').length);
  });
  test('a 4-option setting is still a value row (not a 4-way segmented control)', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(at('/settings/training', <SettingsGroupPage />), host); });
    await flush();
    expect(host.querySelectorAll('.sf-seg').length).toBeLessThanOrEqual(2);
    expect(host.querySelector('.sf-row[aria-label*="Intensity"], .sf-row')).not.toBeNull();
  });
});

describe('View sheet', () => {
  test('the component (no longer placed on pages; the switches live in Settings -> Appearance) still flips the layout both ways', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(<ViewSheet />, host); });
    expect(host.querySelector('.sf-view button')).not.toBeNull();
    await act(async () => { (host.querySelector('.sf-view button') as HTMLElement).click(); });
    const sw = () => [...document.querySelectorAll<HTMLElement>('.sf-view__body [role=switch]')];
    expect(sw().length).toBe(2);
    const layout = sw()[0]!;
    expect(layout.getAttribute('aria-checked')).toBe('true');
    await act(async () => { layout.click(); });
    await flush();
    expect(root()).toBe('classic');
    expect(sw()[0]!.getAttribute('aria-checked')).toBe('false');
    await act(async () => { sw()[0]!.click(); });
    await flush();
    expect(root()).toBe('premium');
  });
  test('shows in Classic too (it is the way back to Premium)', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(<ViewSheet />, host); });
    expect(host.querySelector('.sf-view button')).not.toBeNull();
  });
});

describe('Train', () => {
  test('premium with no routine: the page is not blank, one hero card with a free-session button', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(at('/train', <TrainPage />), host); });
    await flush();
    expect(host.querySelector('.sf-tr__hero')).not.toBeNull();
    expect(host.querySelectorAll('.sf-tr__hero button').length).toBeGreaterThanOrEqual(1);
    expect(host.querySelector('.sf-view')).toBeNull(); // no View button on pages (owner, Phase 110 follow-up)
    expect(host.querySelectorAll('.sf-rowgroup .sf-row').length).toBeGreaterThanOrEqual(3);
  });
  test('classic: the old page, no hero card, the Other ways section', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(at('/train', <TrainPage />), host); });
    await flush();
    expect(host.querySelector('.sf-tr__hero')).toBeNull();
    expect(host.textContent).toContain('Other ways to train');
    expect(host.querySelectorAll('.sf-rowgroup .sf-row').length).toBe(3);
  });
});

// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { ICONS } from '../../src/ui/icons/generated';
import { PREMIUM_ICON } from '../../src/ui/icons/premiumMap';
import { PageIcon } from '../../src/ui/components';
import { ME_LINKS } from '../../src/pages/MePage';
import { GROUPS, MORE_GROUPS } from '../../src/shared/settings';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

const firstD = (svg: string) => /\sd="([^"]+)"/.exec(svg)?.[1];

// The classic mapping exactly as it was before Phase 98 (frozen copy). Changing a classic icon fails this test on purpose.
const CLASSIC_ME = {
  'me.history': 'check', 'me.progress': 'barbell', 'me.records': 'plus-square', 'me.recap': 'image', 'me.photos': 'image',
  'me.goals': 'check', 'me.intake': 'plus', 'me.badges': 'user-circle', 'me.gym': 'user-circle', 'me.settings': 'info',
};
const CLASSIC_SETTINGS = {
  account: 'user-circle', training: 'barbell', 'workout-flow': 'check', body: 'info', appearance: 'image', mode: 'magnifying-glass',
  data: 'download-simple', privacy: 'info', reminders: 'check', gym: 'device-mobile', about: 'info', credits: 'books',
};
const CLASSIC_21 = ['barbell', 'caret-left', 'caret-right', 'check', 'image', 'info', 'magnifying-glass', 'minus', 'plus', 'warning', 'x', 'house', 'person-simple', 'books', 'user-circle', 'export', 'plus-square', 'dots-three-vertical', 'copy', 'device-mobile', 'download-simple'];

describe('classic mapping is the old one', () => {
  test('Me rows and Settings groups keep their classic icons', () => {
    expect(Object.fromEntries(ME_LINKS.map((l) => [l.key, l.icon]))).toEqual(CLASSIC_ME);
    expect(Object.fromEntries([...GROUPS, ...MORE_GROUPS].map((g) => [g.slug, g.icon]))).toEqual(CLASSIC_SETTINGS);
  });
  test('the first 21 inlined icons are the classic set, in order', () => {
    expect(Object.keys(ICONS).slice(0, 21)).toEqual(CLASSIC_21);
  });
});

describe('premium mapping', () => {
  test('every mapped name exists in the icon set, with regular and fill', () => {
    for (const [id, name] of Object.entries(PREMIUM_ICON)) {
      expect(ICONS[name], `${id} -> ${name}`).toBeDefined();
      expect(ICONS[name].regular.length).toBeGreaterThan(10);
      expect(ICONS[name].fill.length).toBeGreaterThan(10);
    }
  });
  test('about 80 icons are inlined', () => {
    expect(Object.keys(ICONS).length).toBeGreaterThanOrEqual(75);
    expect(Object.keys(ICONS).length).toBeLessThanOrEqual(100);
  });
  test('no two different pages share one premium icon', () => {
    const seen = new Map<string, string>();
    for (const [id, name] of Object.entries(PREMIUM_ICON)) {
      expect(seen.get(name), `${id} and ${seen.get(name)} both use ${name}`).toBeUndefined();
      seen.set(name, id);
    }
  });
  test('every Me row and Settings group has a premium icon, and it differs from the wrong classic ones', () => {
    for (const l of ME_LINKS) expect(PREMIUM_ICON[l.key], l.key).toBeDefined();
    for (const g of [...GROUPS, ...MORE_GROUPS]) expect(PREMIUM_ICON[`settings.${g.slug}`], g.slug).toBeDefined();
    const wrong = ['check', 'plus-square', 'image', 'info', 'plus', 'magnifying-glass'];
    for (const id of ['me.history', 'me.goals', 'me.records', 'me.recap', 'me.settings', 'me.intake', 'settings.reminders', 'settings.mode']) {
      expect(wrong).not.toContain(PREMIUM_ICON[id]);
    }
    expect(PREMIUM_ICON['me.badges']).not.toBe(PREMIUM_ICON['me.gym']);
  });
});

describe('PageIcon', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  afterEach(() => render(null, host));
  test('classic: bare classic icon, no tile', async () => {
    applyUx(allSwitches(false));
    await act(async () => { render(<PageIcon id="me.history" classic="check" />, host); });
    const el = host.firstElementChild as HTMLElement;
    expect(el.className).toBe('sf-st__icon');
    expect(el.querySelector('path')?.getAttribute('d')).toBe(firstD(ICONS.check.regular));
  });
  test('premium: tile with the matched icon', async () => {
    applyUx(DEFAULT_SWITCHES);
    await act(async () => { render(<PageIcon id="me.history" classic="check" />, host); });
    const el = host.firstElementChild as HTMLElement;
    expect(el.className).toContain('sf-tile');
    expect(el.querySelector('path')?.getAttribute('d')).toBe(firstD(ICONS['clock-counter-clockwise'].regular));
  });
});

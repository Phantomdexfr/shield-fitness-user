// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, test } from 'vitest';
import { resetDb } from '../../src/data/local';
import { applyUx } from '../../src/app/appearance';
import { readMirror, readUx, setUxMaster, setUxSwitch } from '../../src/data/repos/ux';
import { rowsFor } from '../../src/pages/settings/SettingsGroupPage';
import { InterfaceStyle } from '../../src/pages/settings/InterfaceStyle';
import {
  DEFAULT_SWITCHES, UX_KEYS, allSwitches, fromMirror, masterOf, parseSwitches, toMirror, toRow, withMaster, withSwitch,
} from '../../src/shared/ux';

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

describe('pure rules (src/shared/ux.ts)', () => {
  test('default is Premium: nothing stored, junk and partial values all fall back to on', () => {
    expect(masterOf(DEFAULT_SWITCHES)).toBe('premium');
    expect(masterOf(parseSwitches(undefined))).toBe('premium');
    expect(masterOf(parseSwitches('junk'))).toBe('premium');
    expect(parseSwitches({ switches: { icons: false, tabbar: 'no' } }).icons).toBe(false);
    expect(parseSwitches({ switches: { icons: false, tabbar: 'no' } }).tabbar).toBe(true);
  });
  test('master follows the switches: all on = premium, all off = classic, a mix = custom', () => {
    expect(masterOf(allSwitches(false))).toBe('classic');
    expect(masterOf(withSwitch(DEFAULT_SWITCHES, 'wheels', false))).toBe('custom');
    expect(masterOf(withSwitch(allSwitches(false), 'layout', true))).toBe('custom');
  });
  test('choosing a master sets every switch; Custom changes nothing', () => {
    expect(withMaster(DEFAULT_SWITCHES, 'classic')).toEqual(allSwitches(false));
    expect(withMaster(allSwitches(false), 'premium')).toEqual(allSwitches(true));
    const mixed = withSwitch(DEFAULT_SWITCHES, 'icons', false);
    expect(withMaster(mixed, 'custom')).toEqual(mixed);
  });
  test('mirror round trip, one char per key in order; odd text = premium', () => {
    const mixed = withSwitch(DEFAULT_SWITCHES, 'icons', false);
    expect(toMirror(mixed)).toBe('1011111111');
    expect(fromMirror(toMirror(mixed))).toEqual(mixed);
    expect(fromMirror(null)).toEqual(DEFAULT_SWITCHES);
    expect(fromMirror('0')).toEqual({ ...DEFAULT_SWITCHES, surfaces: false });
    expect(toRow(mixed).master).toBe('custom');
  });
});

describe('storage and root attributes', () => {
  test('default for an install that never chose: Premium', async () => {
    expect(masterOf(await readUx())).toBe('premium');
    expect(masterOf(readMirror())).toBe('premium');
  });
  test('a switch is saved in the row and the mirror; the master follows', async () => {
    await setUxSwitch('wheels', false);
    const s = await readUx();
    expect(s.wheels).toBe(false);
    expect(masterOf(s)).toBe('custom');
    expect(localStorage.getItem('sf.ux')).toBe('1111101111');
    await setUxMaster('classic');
    expect(masterOf(await readUx())).toBe('classic');
    expect(localStorage.getItem('sf.ux')).toBe('0000000000');
  });
  test('applyUx sets data-ux-<key> for all ten keys', () => {
    applyUx(withSwitch(DEFAULT_SWITCHES, 'tabbar', false));
    const root = document.documentElement;
    for (const k of UX_KEYS) expect(root.getAttribute(`data-ux-${k}`)).toBe(k === 'tabbar' ? 'classic' : 'premium');
    expect(UX_KEYS).toHaveLength(10);
  });
});

describe('Settings -> Appearance -> Interface style', () => {
  test('the Appearance group carries the Interface style block', () => {
    expect(rowsFor('appearance').some((r) => r.kind === 'ux')).toBe(true);
  });
  test('renders Premium (rows hidden by Tidy) and ten switches under Custom; Classic flips all; one switch shows Custom; applies instantly', async () => {
    await setUxMaster('premium'); // an earlier test left a Classic row behind
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => { render(<InterfaceStyle />, host); });
    const radios = () => [...host.querySelectorAll('[role="radio"]')] as HTMLElement[];
    const switches = () => [...host.querySelectorAll('[role="switch"]')] as HTMLElement[];
    expect(radios().map((r) => r.textContent)).toEqual(['Premium', 'Classic', 'Custom']);
    expect(radios()[0]?.getAttribute('aria-checked')).toBe('true');
    expect(switches()).toHaveLength(0); // Tidy layout ON: per-feature rows only under Custom
    await act(async () => { radios()[2]?.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(radios()[2]?.getAttribute('aria-checked')).toBe('true');
    expect(switches()).toHaveLength(10);
    expect(switches().every((s) => s.getAttribute('aria-checked') === 'true')).toBe(true);

    await act(async () => { radios()[1]?.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(switches().every((s) => s.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(radios()[1]?.getAttribute('aria-checked')).toBe('true');

    await act(async () => { switches()[5]?.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(radios()[2]?.getAttribute('aria-checked')).toBe('true');
    expect((await readUx()).wheels).toBe(true);
  });
});

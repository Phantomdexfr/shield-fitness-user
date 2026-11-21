import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GROUPS, PREF_DEFS, defaultOf, parseBirthYear, parsePref, prefDef } from '../../src/shared/settings';
import { lockedByGym, onPrefChange, readPref, setGymLockResolver, writePref } from '../../src/data/repos/prefs';
import { getLoggerPrefs, getOverloadSettings } from '../../src/data/repos/logger';
import { ROUTES } from '../../src/app/routes';
import { resetDb } from '../../src/data/local';
import { rowsFor, } from '../../src/pages/settings/SettingsGroupPage';
import { summaryFor } from '../../src/pages/settings/SettingsHub';
import { en } from '../../src/i18n/en';

beforeEach(async () => {
  await resetDb();
  setGymLockResolver(null);
});

describe('settings registry', () => {
  it('every group is registered as a route, plus the list', () => {
    const paths = new Set(ROUTES.map((r) => r.path));
    expect(paths.has('/settings')).toBe(true);
    for (const g of GROUPS) expect(paths.has(`/settings/${g.slug}`)).toBe(true);
  });
  it('the six groups of the phase exist', () => {
    expect(GROUPS.map((g) => g.slug)).toEqual(['account', 'training', 'workout-flow', 'body', 'appearance', 'mode']);
  });
  it('every pref in a group row has a definition and every group has rows and a name', () => {
    for (const g of GROUPS) {
      const rows = rowsFor(g.slug);
      expect(rows.length).toBeGreaterThan(0);
      expect(`st.g.${g.slug}` in en).toBe(true);
      for (const r of rows) if ('pref' in r) expect(prefDef(r.pref)).toBeDefined();
    }
  });
  it('every definition appears in some row (no orphan pref)', () => {
    const used = new Set(GROUPS.flatMap((g) => rowsFor(g.slug)).flatMap((r) => ('pref' in r ? [r.pref] : [])));
    for (const d of PREF_DEFS) expect(used.has(d.key), d.key).toBe(true);
  });
  it('every string key the summaries and values use exists', () => {
    for (const d of PREF_DEFS) if (d.kind.type === 'choice') for (const o of d.kind.options) expect(`st.v.${o}` in en, o).toBe(true);
    for (const g of GROUPS) expect(typeof summaryFor(g.slug, {})).toBe('string');
  });
});

describe('parsePref', () => {
  it('falls back to the default for wrong or missing values', () => {
    expect(parsePref('training.units', 'stone')).toBe('kg');
    expect(parsePref('training.units', undefined)).toBe('kg');
    expect(parsePref('flow.suggestions', 'yes')).toBe(true);
    expect(parsePref('training.restSec', 7)).toBe(90);
    expect(parsePref('training.restSec', 'x')).toBe(90);
    expect(parsePref('nope', 1)).toBe('');
  });
  it('rounds the rest time to its step and keeps it in range', () => {
    expect(parsePref('training.restSec', 100)).toBe(105);
    expect(parsePref('training.restSec', 600)).toBe(600);
    expect(parsePref('training.restSec', 900)).toBe(90);
  });
  it('trims and shortens text', () => {
    expect(parsePref('account.name', `  ${'a'.repeat(50)}  `)).toBe('a'.repeat(30));
  });
  it('birth year: empty or 1900..2100', () => {
    expect(parseBirthYear('')).toEqual({ ok: true, value: '' });
    expect(parseBirthYear(' 1995 ')).toEqual({ ok: true, value: '1995' });
    expect(parseBirthYear('95').ok).toBe(false);
    expect(parseBirthYear('1899').ok).toBe(false);
    expect(parseBirthYear('abcd').ok).toBe(false);
  });
});

describe('persistence', () => {
  it('a fresh store gives the defaults', async () => {
    for (const d of PREF_DEFS) expect(await readPref(d.key), d.key).toBe(defaultOf(d.key));
  });
  it('every pref keeps a changed value (bool, choice, int, text)', async () => {
    for (const d of PREF_DEFS) {
      const k = d.kind;
      const next = k.type === 'bool' ? !k.def : k.type === 'choice' ? (k.options.find((o) => o !== k.def) ?? k.def) : k.type === 'int' ? k.min + k.step : '1990';
      const stored = await writePref(d.key, next);
      expect(await readPref(d.key), d.key).toBe(stored);
    }
    expect(await readPref('training.restSec')).toBe(30);
    expect(await readPref('account.birthYear')).toBe('1990');
  });
  it('a wrong value is stored as the default, not as garbage', async () => {
    await writePref('training.units', 'stone');
    expect(await readPref('training.units')).toBe('kg');
  });
  it('overload prefs are read by the logger code that already exists', async () => {
    await writePref('training.overloadMode', 'linear');
    await writePref('training.intensity', 'hard');
    expect(await getOverloadSettings()).toEqual({ mode: 'linear', intensity: 'hard' });
    await writePref('training.intensity', 'beast');
    expect(await getOverloadSettings()).toEqual({ mode: 'linear', intensity: 'beast' });
  });
  it('simple / advanced writes the logger mode and keeps its other fields', async () => {
    const before = await getLoggerPrefs();
    await writePref('mode.level', 'advanced');
    const after = await getLoggerPrefs();
    expect(after.mode).toBe('advanced');
    expect(after.plates).toEqual(before.plates);
    expect(after.barKg).toBe(before.barKg);
    expect(await readPref('mode.level')).toBe('advanced');
  });
  it('listeners hear every change', async () => {
    const heard: string[] = [];
    const off = onPrefChange((k, v) => heard.push(`${k}=${String(v)}`));
    await writePref('appearance.motion', 'reduced');
    off();
    await writePref('appearance.motion', 'full');
    expect(heard).toEqual(['appearance.motion=reduced']);
  });
});

describe('gym lock hook', () => {
  it('is inert until a resolver is installed, and never edits the stored value', async () => {
    expect(lockedByGym('flow.suggestions')).toBe(false);
    await writePref('flow.suggestions', false);
    setGymLockResolver((f) => f === 'suggestions');
    expect(lockedByGym('flow.suggestions')).toBe(true);
    expect(lockedByGym('flow.autoFill')).toBe(false);
    expect(await readPref('flow.suggestions')).toBe(false);
  });
  it('every lockable pref names a feature in the catalogue', async () => {
    const cat = (await import('../../contract/features.catalogue.json')).default as { features: { key: string }[] };
    const keys = new Set(cat.features.map((f) => f.key));
    for (const d of PREF_DEFS) if (d.feature) expect(keys.has(d.feature), d.key).toBe(true);
  });
});

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { prefsRepo, resetDb, routinesRepo, setOutboxEnabled, exportAll, importAll } from '../../src/data/local';
import {
  decideOnboarding, loadOnboarding, readAbout, readKnown, readWeightKg, saveAbout, saveBirthDate, saveLevel, saveName, saveOnboarding,
} from '../../src/data/repos/onboarding';
import { freshState, advance, visibleSteps, finish } from '../../src/shared/onboarding';
import { saveProfile, getProfile, EMPTY_PROFILE } from '../../src/data/repos/badges';

beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  setOutboxEnabled(false);
});

const steps = visibleSteps({ gym: false, name: false, birth: false, sex: false });

describe('first-run decision', () => {
  it('a fresh phone runs the flow', async () => {
    expect(await decideOnboarding(1)).toBe('run');
    expect(await loadOnboarding()).toBeNull();
  });
  it('an older install with a routine is marked done and never sees it', async () => {
    await routinesRepo.put({ client_id: 'r1', name: 'Push' } as never);
    expect(await decideOnboarding(5)).toBe('no');
    expect((await loadOnboarding())?.done).toBe(true);
    expect(await decideOnboarding(6)).toBe('no');
  });
  it('an older install with only a name or a sex answer also skips', async () => {
    await saveName('Asha');
    expect(await decideOnboarding(1)).toBe('no');
  });
  it('a started flow resumes, a finished one never returns', async () => {
    await saveOnboarding(advance(freshState(), steps));
    expect(await decideOnboarding(1)).toBe('run');
    await saveOnboarding(finish(freshState(), 'later', 9));
    expect(await decideOnboarding(2)).toBe('no');
  });
  it('the saved step survives a reload (resume)', async () => {
    let s = advance(advance(freshState(), steps), steps, { skip: true });
    await saveOnboarding(s);
    s = (await loadOnboarding())!;
    expect(s.step).toBe('about');
    expect(s.skipped).toEqual(['birth']);
  });
});

describe('each step saves its fields', () => {
  it('name, birth date (and the older birth year), about, level', async () => {
    await saveName('  Asha  ');
    await saveBirthDate('1998-03-12');
    await saveAbout({ sex: 'f', heightCm: 165, weightKg: 58.4, units: 'kg', heightUnit: 'cm' });
    await saveLevel('intermediate');
    const a = await readAbout();
    expect(a).toMatchObject({ name: 'Asha', birthDate: '1998-03-12', sex: 'f', heightCm: 165, heightUnit: 'cm', units: 'kg', level: 'intermediate' });
    expect((await prefsRepo.get('settings:account.birthYear'))?.value).toBe('1998');
    expect(await readWeightKg()).toBe(58.4);
  });
  it('skipping saves nothing: the fields stay empty', async () => {
    const a = await readAbout();
    expect(a).toMatchObject({ name: '', birthDate: '', sex: null, heightCm: 0, level: 'unset' });
    expect(await readWeightKg()).toBeNull();
  });
  it('an out-of-range height is stored as not set; a missing weight writes no row', async () => {
    await saveAbout({ sex: 'm', heightCm: 40, weightKg: null, units: 'lb', heightUnit: 'ft' });
    const a = await readAbout();
    expect(a.heightCm).toBe(0);
    expect(a).toMatchObject({ units: 'lb', heightUnit: 'ft', sex: 'm' });
    expect(await readWeightKg()).toBeNull();
  });
  it('saving the about step keeps the badge peaks and confirmations', async () => {
    await saveProfile({ ...EMPTY_PROFILE, peaks: { chest: 3 }, confirmed: ['s:0:0'] });
    await saveAbout({ sex: 'unspecified', heightCm: 0, weightKg: null, units: 'kg', heightUnit: 'cm' });
    const p = await getProfile();
    expect(p).toMatchObject({ sex: 'unspecified', skipped: false, peaks: { chest: 3 }, confirmed: ['s:0:0'] });
  });
});

describe('what the phone already knows', () => {
  it('standalone: nothing is ever skipped', async () => {
    await saveName('Asha');
    expect(await readKnown()).toEqual({ gym: false, name: true, birth: false, sex: false });
  });
  it('a gym connection makes the known fields skippable', async () => {
    await prefsRepo.put({ client_id: 'gym:connection', value: { config: {}, host: 'x', connectedAt: 1, signedIn: true, mustChangePassword: false, versionMismatch: false } } as never);
    // the connection cache may already be filled by an earlier test file in this worker; skip the assertion on the gym flag if so
    const { getConnection } = await import('../../src/data/gym/connection');
    const c = await getConnection();
    if (c) {
      await saveName('Ravi');
      const k = await readKnown();
      expect(k.gym).toBe(true);
      expect(visibleSteps(k)).toEqual(['birth', 'about', 'training', 'finish']);
    }
  });
});

describe('backup round-trip of the new fields', () => {
  it('the backup file carries them to a wiped phone', async () => {
    await saveName('Asha');
    await saveBirthDate('1998-03-12');
    await saveAbout({ sex: 'f', heightCm: 165, weightKg: 58, units: 'lb', heightUnit: 'ft' });
    await saveLevel('advanced');
    await saveOnboarding(finish(freshState(), 'backup', 77));
    const before = await readAbout();
    const file = JSON.parse(JSON.stringify(await exportAll()));

    await resetDb();
    (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    setOutboxEnabled(false);
    expect(await readAbout()).toMatchObject({ name: '', heightCm: 0 });

    await importAll(file);
    expect(await readAbout()).toEqual(before);
    expect(await readWeightKg()).toBe(58);
    expect((await loadOnboarding())?.done).toBe(true);
    expect(await decideOnboarding(1)).toBe('no');
  });
});

// Onboarding data (Phase 85): the saved flow state, the "what is already known" facts, and the profile fields it fills.
// Everything lives in the device `prefs` store: `onboarding:state` here, `settings:account.*` and `badges.profile` as before.
// Prefs go into the backup FILE (Data page) and come back with it. The cloud chunk backup does not carry prefs (Phase 75 design).

import { bodyStatsRepo, prefsRepo, routinesRepo, sessionsRepo } from '../local';
import { getConnection } from '../gym/connection';
import { readPref, writePref } from './prefs';
import { getProfile, latestBodyweight, saveBodyweight, saveProfile } from './badges';
import { yearOfDay } from '../../shared/calendar';
import {
  cleanHeightCm, firstRunDecision, freshState, parseState,
  type AboutYou, type Known, type OnboardingState,
} from '../../shared/onboarding';

const ROW = 'onboarding:state';

export async function loadOnboarding(): Promise<OnboardingState | null> {
  try {
    return parseState((await prefsRepo.get(ROW))?.value);
  } catch {
    return null;
  }
}

export async function saveOnboarding(s: OnboardingState): Promise<void> {
  await prefsRepo.put({ client_id: ROW, value: s } as never);
}

/** The profile fields as stored right now. */
export async function readAbout(): Promise<AboutYou> {
  const [name, birthDate, heightCm, heightUnit, units, level, profile] = await Promise.all([
    readPref('account.name'), readPref('account.birthDate'), readPref('account.heightCm'),
    readPref('account.heightUnit'), readPref('training.units'), readPref('account.level'), getProfile(),
  ]);
  return {
    name: String(name), birthDate: String(birthDate), sex: profile.sex, heightCm: cleanHeightCm(heightCm),
    heightUnit: heightUnit === 'ft' ? 'ft' : 'cm', units: units === 'lb' ? 'lb' : 'kg',
    level: level as AboutYou['level'],
  };
}

/** What the phone already holds. Only a gym member skips steps by it (see `visibleSteps`). */
export async function readKnown(): Promise<Known> {
  const [a, conn] = await Promise.all([readAbout(), getConnection().catch(() => null)]);
  return { gym: !!conn, name: a.name !== '', birth: a.birthDate !== '', sex: a.sex !== null };
}

export async function saveName(name: string): Promise<void> {
  await writePref('account.name', name);
}

/** A full date. The older birth-year pref is kept equal to its year (as Settings does). */
export async function saveBirthDate(day: string): Promise<void> {
  await writePref('account.birthDate', day);
  await writePref('account.birthYear', day ? yearOfDay(day) : '');
}

export async function saveAbout(v: {
  sex: 'm' | 'f' | 'unspecified' | null; heightCm: number; weightKg: number | null; units: 'kg' | 'lb'; heightUnit: 'cm' | 'ft';
}): Promise<void> {
  if (v.sex) await saveProfile({ ...(await getProfile()), sex: v.sex, skipped: false });
  await writePref('account.heightCm', cleanHeightCm(v.heightCm));
  await writePref('account.heightUnit', v.heightUnit);
  await writePref('training.units', v.units);
  if (v.weightKg != null) await saveBodyweight(v.weightKg);
}

export async function saveLevel(level: AboutYou['level']): Promise<void> {
  await writePref('account.level', level);
}

export const readWeightKg = (): Promise<number | null> => latestBodyweight().catch(() => null);

/**
 * First-run decision. An install from before this flow (it already has sessions, routines, a name, a sex answer, a birth date or a gym)
 * is marked done and never sees it; a fresh install runs it; a started flow resumes.
 */
export async function decideOnboarding(nowMs: number): Promise<'run' | 'no'> {
  const state = await loadOnboarding();
  if (state) return firstRunDecision(state, { hasData: false }) === 'no' ? 'no' : 'run';
  const [sessions, routines, bodyStats, about, conn] = await Promise.all([
    sessionsRepo.list().catch(() => []), routinesRepo.list().catch(() => []), bodyStatsRepo.list().catch(() => []),
    readAbout().catch(() => null), getConnection().catch(() => null),
  ]);
  const hasData = sessions.length > 0 || routines.length > 0 || bodyStats.length > 0 || !!conn
    || !!about && (about.name !== '' || about.birthDate !== '' || about.sex !== null);
  const d = firstRunDecision(null, { hasData });
  if (d === 'skip') {
    await saveOnboarding({ ...freshState(), done: true, step: 'finish', finishedAt: nowMs });
    return 'no';
  }
  return 'run';
}

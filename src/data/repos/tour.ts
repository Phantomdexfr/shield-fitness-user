// Phase 116: guided walkthrough storage. One device row `tour` = { v, done, skipped, stepId, auto } (see src/shared/tour.ts).
// Same pattern as `ui:sections` / `ui:body-layout`: the UI reads and writes through this repo only; a failed read or write never breaks the app
// (a failed read counts as "no record", which for an installed app means the tour simply does not start by itself twice: see `reconcile`).
import { prefsRepo } from '../local';
import { openSession } from '../../shared/session';
import { existingUserRecord, parseTour, type TourRecord } from '../../shared/tour';

const ROW = 'tour';

export async function loadTour(): Promise<TourRecord | null> {
  try {
    return parseTour((await prefsRepo.get(ROW))?.value);
  } catch {
    return null;
  }
}

export async function saveTour(rec: TourRecord): Promise<void> {
  try {
    await prefsRepo.put({ client_id: ROW, value: rec } as never);
  } catch {
    /* the tour may start again next launch; nothing else depends on it */
  }
}

let atBoot: Promise<boolean> | null = null;

/**
 * Was onboarding already finished when the app opened? Asked once per page load, BEFORE the person can finish it in this launch.
 * `decideOnboarding` also marks an older install (one that already has data) as finished, so those count as existing users too.
 */
export function onboardingFinishedAtBoot(): Promise<boolean> {
  atBoot ??= (async () => {
    try {
      const m = await import('./onboarding');
      await m.decideOnboarding(Date.now());
      return (await m.loadOnboarding())?.done === true;
    } catch {
      return false;
    }
  })();
  return atBoot;
}

/** Onboarding finished right now (it may have ended during this launch). */
export async function onboardingFinishedNow(): Promise<boolean> {
  try {
    const m = await import('./onboarding');
    return (await m.loadOnboarding())?.done === true;
  } catch {
    return false;
  }
}

/** Write the "existing user" record: done, never automatic. */
export const markExisting = (): Promise<void> => saveTour(existingUserRecord());

/** Is a workout open right now? The manual start must not open on top of the logger. */
export async function hasOpenWorkout(): Promise<boolean> {
  try {
    const { listSessions } = await import('./sessions');
    return openSession(await listSessions()) !== undefined;
  } catch {
    return false;
  }
}

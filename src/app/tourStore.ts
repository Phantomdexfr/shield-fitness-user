// Phase 116: the running state of the walkthrough, shared by the overlay (Shell) and the Settings row. Tiny on purpose: no DOM, no storage here.
// `run` is null while no tour is open. `dir` is the way the person last moved (1 on, -1 back); a step whose target never shows is skipped that way.
import { hasOpenWorkout, loadTour, saveTour } from '../data/repos/tour';
import { TOUR_STEPS, manualStartAllowed, runningRecord } from '../shared/tour';

export interface TourRun {
  stepId: string;
  dir: 1 | -1;
  /** This step was reached by tapping the real element of the one before (a page may still be opening: wait longer for the target). */
  viaTap?: boolean;
}

let run: TourRun | null = null;
const listeners = new Set<(r: TourRun | null) => void>();

export const getRun = (): TourRun | null => run;

export function onRun(fn: (r: TourRun | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setRun(next: TourRun | null): void {
  run = next;
  for (const fn of listeners) fn(run);
}

/** Open the tour at a step (the first by default) and store it. `auto` only matters when no record exists yet. */
export async function beginRun(stepId: string = TOUR_STEPS[0]!.id, auto = false): Promise<void> {
  if (run) return;
  setRun({ stepId, dir: 1 });
  await saveTour(runningRecord(await loadTour(), stepId, auto));
}

/** The Settings row. Starts from step 1 wherever the person is and whatever "done" says, unless a workout is open. */
export async function requestStart(): Promise<'started' | 'busy' | 'running'> {
  if (run) return 'running';
  if (!manualStartAllowed(await hasOpenWorkout())) return 'busy';
  await beginRun(TOUR_STEPS[0]!.id, false);
  return 'started';
}

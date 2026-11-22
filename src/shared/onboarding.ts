// Onboarding (Phase 85): the first-run "/welcome" flow as pure state. No DOM, no store, no clock (time is a parameter).
// Steps: name, birth, about (sex, height, weight, units), training (level), finish (backup choice, optional gym).
// Rules (docs/UX_REDESIGN_PLAN.md section 3): one question group per screen, Back always works, every optional step can be
// skipped, resume where left off, runs once, can be run again from Settings. A gym member skips what the phone already knows.

export const STEP_IDS = ['name', 'birth', 'about', 'training', 'finish'] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Steps that may be skipped. The last one ends the flow, so it has its own two exits (see `FinishChoice`). */
export const SKIPPABLE: readonly StepId[] = ['name', 'birth', 'about', 'training'];

export type FinishChoice = 'backup' | 'later';

export interface OnboardingState {
  v: 1;
  /** Set once the flow ended (finished or skipped to the end): it never starts by itself again. */
  done: boolean;
  /** The step the person is on (saved on every move, so an app kill resumes here). */
  step: StepId;
  /** Steps the person skipped (kept so Settings can show what is still unset). */
  skipped: StepId[];
  /** What they chose on the last step; null until then. */
  backup: FinishChoice | null;
  /** Epoch ms when the flow ended. */
  finishedAt: number | null;
}

export function freshState(): OnboardingState {
  return { v: 1, done: false, step: 'name', skipped: [], backup: null, finishedAt: null };
}

const isStep = (x: unknown): x is StepId => typeof x === 'string' && (STEP_IDS as readonly string[]).includes(x);

/** Read a stored value; anything wrong gives null (= "never started"). */
export function parseState(raw: unknown): OnboardingState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.done !== 'boolean' || !isStep(o.step)) return null;
  const skipped = Array.isArray(o.skipped) ? o.skipped.filter(isStep).filter((s, i, a) => a.indexOf(s) === i) : [];
  const backup = o.backup === 'backup' || o.backup === 'later' ? o.backup : null;
  const finishedAt = typeof o.finishedAt === 'number' && Number.isFinite(o.finishedAt) ? o.finishedAt : null;
  return { v: 1, done: o.done, step: o.step, skipped, backup, finishedAt };
}

/** What the phone already knows. `gym` = connected to a gym. */
export interface Known {
  gym: boolean;
  name: boolean;
  birth: boolean;
  sex: boolean;
}

/**
 * The steps this person sees, in order. A gym member does not see a step whose data the phone already holds
 * (name, birth, and "about" when the sex is known) and has no backup choice (the gym backs them up), so the finish screen is a plain "all set".
 * A re-run from Settings (`rerun`) shows everything, filled in with what is stored.
 */
export function visibleSteps(known: Known, rerun = false): StepId[] {
  if (rerun || !known.gym) return [...STEP_IDS];
  return STEP_IDS.filter((s) => !((s === 'name' && known.name) || (s === 'birth' && known.birth) || (s === 'about' && known.sex)));
}

/** Where to be, given a saved step: that step if it is still shown, else the next shown one after it, else the last. */
export function resumeStep(state: OnboardingState, steps: readonly StepId[]): StepId {
  if (steps.includes(state.step)) return state.step;
  const from = STEP_IDS.indexOf(state.step);
  return steps.find((s) => STEP_IDS.indexOf(s) > from) ?? steps[steps.length - 1]!;
}

export const isLastStep = (step: StepId, steps: readonly StepId[]): boolean => steps[steps.length - 1] === step;

/** Position for the progress bar: 1-based `index` of `total`. A hidden step counts as the nearest shown one. */
export function progressOf(step: StepId, steps: readonly StepId[]): { index: number; total: number } {
  const i = steps.indexOf(step);
  return { index: (i < 0 ? steps.length - 1 : i) + 1, total: steps.length };
}

/** Continue (or Skip when `skip`) from `step`. On the last step this does nothing: use `finish`. */
export function advance(state: OnboardingState, steps: readonly StepId[], opts: { skip?: boolean } = {}): OnboardingState {
  const cur = resumeStep(state, steps);
  const i = steps.indexOf(cur);
  if (i < 0 || i >= steps.length - 1) return state;
  const skipped = opts.skip && SKIPPABLE.includes(cur)
    ? (state.skipped.includes(cur) ? state.skipped : [...state.skipped, cur])
    : state.skipped.filter((s) => s !== cur);
  return { ...state, step: steps[i + 1]!, skipped };
}

/** Back always works; on the first step it stays there (the screen then shows no Back, or leaves a re-run). */
export function back(state: OnboardingState, steps: readonly StepId[]): OnboardingState {
  const i = steps.indexOf(resumeStep(state, steps));
  return i <= 0 ? state : { ...state, step: steps[i - 1]! };
}

/** End the flow. Never turns backup on by itself: `choice` is what the person tapped. */
export function finish(state: OnboardingState, choice: FinishChoice, nowMs: number): OnboardingState {
  return { ...state, done: true, backup: choice, finishedAt: nowMs };
}

// ---------------------------------------------------------------- first run

export interface RunFacts {
  /** The device already holds sessions, routines, a name, a sex answer, a birth date or a gym connection (an install from before this flow). */
  hasData: boolean;
}

/** `run` = open /welcome; `skip` = an older install: mark it done without showing anything; `no` = already done. */
export function firstRunDecision(state: OnboardingState | null, facts: RunFacts): 'run' | 'skip' | 'no' {
  if (state?.done) return 'no';
  if (state) return 'run'; // started, not finished: resume
  return facts.hasData ? 'skip' : 'run';
}

/** Paths where the first-run redirect must not pull the person away (the flow itself, and links that open on purpose). */
export function redirectExempt(path: string): boolean {
  return ['/welcome', '/connect', '/share', '/settings/gym', '/settings/backup'].some((p) => path === p || path.startsWith(`${p}/`));
}

// ---------------------------------------------------------------- the three numbers

export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;
export const HEIGHT_DEFAULT_CM = 170;
export const WEIGHT_MIN_KG = 25;
export const WEIGHT_MAX_KG = 300;
export const WEIGHT_DEFAULT_KG = 70;

/** 0 = not set. Anything else must be a whole number in range. */
export function cleanHeightCm(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && Math.round(n) >= HEIGHT_MIN_CM && Math.round(n) <= HEIGHT_MAX_CM ? Math.round(n) : 0;
}

/** 170 cm -> { ft: 5, inch: 7 } (inches rounded, 12 carries into the next foot). */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const total = Math.round(cm / 2.54);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

export const heightLabel = (cm: number, unit: 'cm' | 'ft'): string => {
  if (!cm) return '';
  if (unit === 'cm') return `${cm} cm`;
  const { ft, inch } = cmToFtIn(cm);
  return `${ft}′ ${inch}″`;
};

/** The profile fields a finished flow leaves behind, for the backup round-trip (one plain object). */
export interface AboutYou {
  name: string;
  birthDate: string;
  sex: 'm' | 'f' | 'unspecified' | null;
  heightCm: number;
  heightUnit: 'cm' | 'ft';
  units: 'kg' | 'lb';
  level: 'unset' | 'beginner' | 'intermediate' | 'advanced';
}

/** Where the birth-date calendar opens when nothing is chosen: 1 Jan, 25 years before today (people can still scroll the year list). */
export function birthStartDay(today: string): string {
  return `${Number(today.slice(0, 4)) - 25}-01-01`;
}

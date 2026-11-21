// Exercise page + machine page repo (Phase 21). Pages ask here; they never touch the dataset loader or the local
// store directly. Device-only prefs (chosen variation, dismissed form cue card) live in the `prefs` store.

import { prefsRepo } from '../local';
import { getExerciseIndex, getMachines, getSetupOptions, getSubstitutions, getVariationShift, type ExerciseDetail, type ExerciseRow, type ImageUrl, type MapRow, type Machine } from '../../dataset/loader';
import { exercisesRepo, listCustomExercises } from './exercises';
import { easierHarder } from '../../pages/exercise/exerciseModel';
import { cleanSetup, parseSetupData, type SetupData, type SetupOffer } from '../../pages/exercise/setupModel';
import { parseSetup, type Setup } from '../../shared/setup';
import { hiddenSlugs, withoutHidden, EMPTY_PERSONAL, type Personal } from '../../shared/personal';
import { loadPersonal } from './personal';

const VAR_ID = (slug: string) => `exercise-variation:${slug}`;
const CUE_ID = (slug: string) => `form-cue-dismissed:${slug}`;
const SETUP_ID = (slug: string) => `exercise-setup:${slug}`;
const SEPARATE_PR_ID = 'separate-pr-by-grip';

export interface ExercisePageData {
  row: ExerciseRow;
  detail: ExerciseDetail;
  muscles: MapRow[];
  machine?: Machine;
  photos?: ImageUrl[];
  shift: Record<string, Array<[string, string]>>;
  substitutes: ExerciseRow[];
  easier?: ExerciseRow;
  harder?: ExerciseRow;
  /** The user's own YouTube link (custom exercises). */
  customYoutube?: string;
  /** The movement pattern a custom exercise was given in the creator (Phase 27). */
  customPattern?: { patternId: string; param: string };
  variation?: string;
  cueDismissed: boolean;
  /** Setup data (null when the file is missing). */
  setupData: SetupData | null;
  /** What this exercise offers (empty for custom exercises for now). */
  setupOffer?: SetupOffer;
  /** Last setup used on this exercise, cleaned against what it offers. `{}` = the default. */
  setup: Setup;
  /** The user's favourite / hidden / note for this exercise (Phase 26). */
  personal: Personal;
}

/** Gym policy YouTube override hook (connected mode, a later phase). Until one is set, none exists. */
export type YoutubePolicyResolver = (slug: string) => string | undefined;
let policyYoutube: YoutubePolicyResolver | null = null;
export function setYoutubePolicyResolver(fn: YoutubePolicyResolver | null): void {
  policyYoutube = fn;
}
export const policyYoutubeFor = (slug: string): string | undefined => policyYoutube?.(slug);

export async function getChosenVariation(slug: string): Promise<string | undefined> {
  const v = (await prefsRepo.get(VAR_ID(slug)))?.value;
  return typeof v === 'string' && v ? v : undefined;
}

/** Store the variation "I'm doing" for logging; `undefined` clears it. */
export async function setChosenVariation(slug: string, variation: string | undefined): Promise<void> {
  await prefsRepo.put({ client_id: VAR_ID(slug), value: variation ?? '' });
}

/** Last setup used on an exercise (device pref). Anything not a valid setup reads as the default. */
export async function getChosenSetup(slug: string): Promise<Setup> {
  const v = (await prefsRepo.get(SETUP_ID(slug)))?.value;
  const r = parseSetup(v ?? {});
  return r.ok ? r.value : {};
}

/** Remember the setup for next time; `{}` stores the default. */
export async function setChosenSetup(slug: string, setup: Setup): Promise<void> {
  await prefsRepo.put({ client_id: SETUP_ID(slug), value: setup });
}

/** Settings "separate PRs per grip" (default off). The Settings screen comes in a later phase; the pref lives here. */
export async function getSeparatePrPerGrip(): Promise<boolean> {
  return (await prefsRepo.get(SEPARATE_PR_ID))?.value === true;
}

export async function setSeparatePrPerGrip(on: boolean): Promise<void> {
  await prefsRepo.put({ client_id: SEPARATE_PR_ID, value: on });
}

export async function isCueDismissed(slug: string): Promise<boolean> {
  return (await prefsRepo.get(CUE_ID(slug)))?.value === true;
}

export async function dismissCue(slug: string): Promise<void> {
  await prefsRepo.put({ client_id: CUE_ID(slug), value: true });
}

/** Everything `/exercise/<slug>` shows. Undefined for an unknown slug. */
export async function loadExercisePage(slug: string): Promise<ExercisePageData | undefined> {
  const full = await exercisesRepo.get(slug);
  if (!full) return undefined;
  const { row } = full;
  const [index, subs, shiftAll, machine, photo, variation, cueDismissed, custom, rawSetup, remembered, personalAll] = await Promise.all([
    getExerciseIndex(),
    getSubstitutions(),
    getVariationShift(),
    row.machine ? exercisesRepo.getMachine(row.machine) : Promise.resolve(undefined),
    row.machine ? exercisesRepo.imageUrls(row.machine) : Promise.resolve(undefined),
    getChosenVariation(slug),
    isCueDismissed(slug),
    row.custom ? listCustomExercises() : Promise.resolve([]),
    getSetupOptions(),
    getChosenSetup(slug),
    loadPersonal(),
  ]);
  const hidden = hiddenSlugs(personalAll);
  const setupData = parseSetupData(rawSetup);
  const setupOffer = row.custom ? undefined : setupData?.exercises[slug];
  const bySlug = index.bySlug;
  const substitutes = withoutHidden((subs[slug] ?? []).map((s) => bySlug.get(s)).filter((x): x is ExerciseRow => !!x), hidden);
  const fam = row.custom ? {} : easierHarder(row, index.rows, hidden);
  const data: ExercisePageData = {
    row,
    detail: full.detail,
    muscles: full.muscles,
    shift: shiftAll[slug] ?? {},
    substitutes,
    cueDismissed,
    setupData,
    setup: cleanSetup(remembered, setupOffer),
    personal: personalAll.get(slug) ?? { ...EMPTY_PERSONAL },
  };
  if (setupOffer) data.setupOffer = setupOffer;
  if (machine) data.machine = machine;
  if (photo) data.photos = photo;
  if (fam.easier) data.easier = bySlug.get(fam.easier.slug);
  if (fam.harder) data.harder = bySlug.get(fam.harder.slug);
  if (variation) data.variation = variation;
  const own = custom.find((c) => c.slug === slug) as (typeof custom[number] & { patternId?: string; param?: string }) | undefined;
  if (own?.youtubeUrl) data.customYoutube = own.youtubeUrl;
  if (own?.patternId) data.customPattern = { patternId: own.patternId, param: own.param ?? '' };
  return data;
}

export interface MachinePageData {
  machine: Machine;
  photos: ImageUrl[];
  exercises: ExerciseRow[];
}

/** Everything `/machine/<slug>` shows. Undefined for an unknown slug. */
export async function loadMachinePage(slug: string): Promise<MachinePageData | undefined> {
  const machine = (await getMachines()).list.find((m) => m.slug === slug);
  if (!machine) return undefined;
  const [photos, exercises] = await Promise.all([exercisesRepo.imageUrls(slug), exercisesRepo.byMachine(slug)]);
  return { machine, photos, exercises };
}

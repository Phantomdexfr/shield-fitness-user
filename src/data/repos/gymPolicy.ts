// Gym policy repo (Phase 66): the cached policy on the device and the hooks that make it count.
// Standalone has no policy, so nothing here changes anything until Phase 67 stores one. Reads are local only (no network).

import { prefsRepo } from '../local';
import { featureDef, notifyFlagsChanged, setPolicyResolver } from '../../app/flags';
import { setGymLockResolver } from './prefs';
import { setYoutubePolicyResolver } from './exercisePage';
import { chooseCurrent, hiddenSet, machineStateOf, resolveFeatureValue, youtubeOverride, type MachineState, type Policy, type PolicyLibrary } from '../../shared/policy';

const ROW = 'gym:policy';
let current: Policy | null = null;

export const getPolicy = (): Policy | null => current;
export const getLibraryOverrides = (): PolicyLibrary | null => current?.library ?? null;
/** Slugs the gym hides from search, suggestions and the builders (never the member's own `my-` exercises). */
export const gymHiddenSlugs = (): Set<string> => hiddenSet(current?.library);
export const machineStatusFor = (slug: string, base: string): { status: MachineState; note?: string } => machineStateOf(slug, base, current?.library);

function install(): void {
  setPolicyResolver((key, base) => {
    if (!current) return undefined;
    const d = featureDef(key);
    return d ? resolveFeatureValue(key, d, current).on : base;
  });
  setGymLockResolver((key) => (current ? resolveFeatureValue(key, featureDef(key), current).locked : false));
  setYoutubePolicyResolver((slug) => youtubeOverride(slug, current?.library));
  notifyFlagsChanged();
}

/** Boot: read the cached policy once. A damaged cache is ignored (standalone behaviour). */
export async function initGymPolicy(): Promise<void> {
  try {
    const row = await prefsRepo.get(ROW);
    const r = chooseCurrent(null, row?.value);
    current = r.policy;
  } catch {
    current = null;
  }
  if (current) install();
}

/**
 * A fetched policy arrives here (Phase 67 calls this). Invalid or older-than-cached: ignored, the last good one stays.
 * Returns what happened so the Gym screen can say so.
 */
export async function acceptPolicy(raw: unknown): Promise<'ok' | 'invalid' | 'stale'> {
  const r = chooseCurrent(current, raw);
  if (!r.accepted || !r.policy) return r.reason;
  current = r.policy;
  await prefsRepo.put({ client_id: ROW, value: r.policy } as never);
  install();
  return 'ok';
}

/** Disconnect (Phase 67): forget the policy, back to standalone. */
export async function clearPolicy(): Promise<void> {
  current = null;
  await prefsRepo.remove(ROW).catch(() => undefined);
  setPolicyResolver(null);
  setGymLockResolver(null);
  setYoutubePolicyResolver(null);
}

/** Tests only: set the policy in memory without touching the store. */
export function __setPolicyForTest(p: Policy | null): void {
  current = p;
  if (p) install();
  else {
    setPolicyResolver(null);
    setGymLockResolver(null);
    setYoutubePolicyResolver(null);
  }
}

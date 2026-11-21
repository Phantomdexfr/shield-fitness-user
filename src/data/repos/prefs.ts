// Prefs repo (Phase 62): read and write the settings in the device `prefs` store. UI never touches the store directly.
// A pref lives in its own row `settings:<key>`, except those that another screen already reads (overload, simple/advanced):
// those are a field of that row, so both sides agree. Gym locks never write here (read-time only, Phase 66).

import { prefsRepo } from '../local';
import { defaultOf, parsePref, prefDef, type PrefValue } from '../../shared/settings';

const rowId = (key: string) => `settings:${key}`;

export async function readPref(key: string): Promise<PrefValue> {
  const d = prefDef(key);
  if (!d) return '';
  try {
    if (d.store) {
      const v = (await prefsRepo.get(d.store.id))?.value as Record<string, unknown> | undefined;
      return parsePref(key, v?.[d.store.field]);
    }
    return parsePref(key, (await prefsRepo.get(rowId(key)))?.value);
  } catch {
    return defaultOf(key);
  }
}

const listeners = new Set<(key: string, value: PrefValue) => void>();

/** Listen for changes made through `writePref` (used by `usePref` so two rows on one page stay in step). */
export function onPrefChange(fn: (key: string, value: PrefValue) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Save a pref (the value is made valid first) and tell listeners. Returns the value that was stored. */
export async function writePref(key: string, raw: unknown): Promise<PrefValue> {
  const d = prefDef(key);
  if (!d) return '';
  const value = parsePref(key, raw);
  if (d.store) {
    // Keep the other fields of the shared row as they are.
    const old = ((await prefsRepo.get(d.store.id))?.value ?? {}) as Record<string, unknown>;
    await prefsRepo.put({ client_id: d.store.id, value: { ...old, [d.store.field]: value } } as never);
  } else {
    await prefsRepo.put({ client_id: rowId(key), value } as never);
  }
  listeners.forEach((l) => l(key, value));
  return value;
}

// ---------- gym locks (inert until Phase 66) ----------

/** Phase 66 installs this: returns true when the gym locks the feature. Until then nothing is locked. */
export type GymLockResolver = (feature: string) => boolean;
let lockResolver: GymLockResolver | null = null;

export function setGymLockResolver(fn: GymLockResolver | null): void {
  lockResolver = fn;
}

export function lockedByGym(key: string): boolean {
  const f = prefDef(key)?.feature;
  return !!f && !!lockResolver && lockResolver(f);
}

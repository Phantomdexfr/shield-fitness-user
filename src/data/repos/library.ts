// Library repo (Phase 19): machines for the machines tab, plus the two device-only preferences the library keeps
// (equipment preset, recent searches) in the local `prefs` store. Prefs never go to the outbox.

import { prefsRepo } from '../local';
import { getMachines, type Machine } from '../../dataset/loader';
import { DEFAULT_PRESET, isPreset, type EquipmentPreset } from '../../shared/equipment';
import { addRecent, removeRecent } from '../../pages/library/libraryState';

const PRESET_ID = 'equipment-preset';
const RECENTS_ID = 'library-recents';

export async function listMachines(): Promise<Machine[]> {
  return (await getMachines()).list;
}

/** Stored preset, or the default (`gym` = everything) when none or an unknown value is stored. */
export async function getEquipmentPreset(): Promise<EquipmentPreset> {
  const row = await prefsRepo.get(PRESET_ID);
  return isPreset(row?.value) ? row.value : DEFAULT_PRESET;
}

export async function setEquipmentPreset(preset: EquipmentPreset): Promise<void> {
  await prefsRepo.put({ client_id: PRESET_ID, value: preset });
}

export async function getRecentSearches(): Promise<string[]> {
  const row = await prefsRepo.get(RECENTS_ID);
  const list = row?.list;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

export async function rememberSearch(q: string): Promise<string[]> {
  const next = addRecent(await getRecentSearches(), q);
  await prefsRepo.put({ client_id: RECENTS_ID, list: next });
  return next;
}

export async function forgetSearch(q: string): Promise<string[]> {
  const next = removeRecent(await getRecentSearches(), q);
  await prefsRepo.put({ client_id: RECENTS_ID, list: next });
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await prefsRepo.put({ client_id: RECENTS_ID, list: [] });
}

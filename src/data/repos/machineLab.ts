// Machine Lab repo (Phase 23). Pages ask here; they never touch the dataset loader directly. Read-only.
// Dataset exercises only: custom exercises are not part of the compiled reach table (they have no machine reach data).

import { buildTaxonomy, type Taxonomy } from '../../shared/muscles';
import { getExerciseIndex, getMachineReach, getMachines, getMuscleMap, getMuscles, getSetupOptions, imageUrls, type ImageUrl, type Machine, type MapRow } from '../../dataset/loader';
import { parseReach, parseSetupFile, type LabInputs, type ReachEntry, type ReachFile, type SetupFile } from '../../pages/machines/machineLabModel';

export interface MachineIndexData {
  file: ReachFile;
  machines: Machine[];
  tax: Taxonomy;
}

export interface MachineLabData extends MachineIndexData {
  machine: Machine;
  entry: ReachEntry;
  inputs: LabInputs;
  /** Exercise names by slug (only the ones on this machine). */
  names: Record<string, string>;
  photo?: ImageUrl;
}

export async function loadMachineIndex(): Promise<MachineIndexData | null> {
  const [reach, { list }, { muscles }] = await Promise.all([getMachineReach(), getMachines(), getMuscles()]);
  const file = parseReach(reach);
  return file ? { file, machines: list, tax: buildTaxonomy(muscles) } : null;
}

/** `null` = the reach file is missing; `undefined` = no such machine. */
export async function loadMachineLab(slug: string): Promise<MachineLabData | null | undefined> {
  const [base, { rows }, map, setupRaw] = await Promise.all([loadMachineIndex(), getExerciseIndex(), getMuscleMap(), getSetupOptions()]);
  if (!base) return null;
  const machine = base.machines.find((m) => m.slug === slug);
  const entry = base.file.machines[slug];
  if (!machine || !entry) return undefined;
  const setup: SetupFile = parseSetupFile(setupRaw) ?? { patterns: {}, exercises: {}, shift: {} };
  const onMachine = rows.filter((r) => r.machine === slug && !r.custom);
  const slice: Record<string, MapRow[]> = {};
  const names: Record<string, string> = {};
  for (const r of onMachine) {
    slice[r.slug] = map[r.slug] ?? [];
    names[r.slug] = r.name;
  }
  const photos = await imageUrls(slug).catch(() => [] as ImageUrl[]);
  return { ...base, machine, entry, inputs: { slugs: onMachine.map((r) => r.slug).sort(), map: slice, setup }, names, photo: photos[0] };
}

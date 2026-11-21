// Equipment mode (engines.md section 22). Pure: a preset only FILTERS, it never deletes data.
// [A-P19.2] `contract/dataset/equipment_presets.csv` does not exist yet (Phase 24 authors it), so the preset ->
// machine table lives here as a small constant. Phase 24 may replace it with the CSV.

export type EquipmentPreset = 'gym' | 'bodyweight' | 'dumbbells' | 'bands' | 'home';

export const EQUIPMENT_PRESETS: readonly EquipmentPreset[] = ['gym', 'bodyweight', 'dumbbells', 'bands', 'home'];
export const DEFAULT_PRESET: EquipmentPreset = 'gym';

const MAT = ['yoga-mat'];
const DUMBBELLS = ['dumbbells-and-rack'];
const BANDS = ['resistance-tubes'];
const BENCHES = ['adjustable-bench', 'flat-bench', 'utility-bench', 'flat-incline-combo-bench'];

/** Machine slugs each preset allows. `null` = every machine. Exercises with no machine are always allowed. */
const ALLOWED: Record<EquipmentPreset, readonly string[] | null> = {
  gym: null,
  bodyweight: MAT,
  dumbbells: [...DUMBBELLS, ...MAT],
  bands: [...BANDS, ...MAT],
  home: [...DUMBBELLS, ...BANDS, ...BENCHES, ...MAT],
};

export function isPreset(v: unknown): v is EquipmentPreset {
  return typeof v === 'string' && (EQUIPMENT_PRESETS as readonly string[]).includes(v);
}

/** Is an exercise on this machine (or on none: `''`) available under the preset? */
export function allowsMachine(preset: EquipmentPreset, machineSlug: string): boolean {
  const list = ALLOWED[preset];
  if (list === null || machineSlug === '') return true;
  return list.includes(machineSlug);
}

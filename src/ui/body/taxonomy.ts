// Static copy of the 34-muscle taxonomy (contract/dataset/detailed_muscles/muscle_taxonomy_detailed.csv:
// id, parent_group, group). Names come from t('muscle.<id>'). Pure data + helpers, no DOM.
import { REGIONS } from './regions';
import type { View } from './figures/types';

export type MuscleId = string;
export type GroupKey = 'upper' | 'arms' | 'core' | 'lower' | 'other';
export const GROUP_ORDER: GroupKey[] = ['upper', 'arms', 'core', 'lower', 'other'];

const ROWS: Array<[string, string, string]> = [
  ['chest', 'chest', 'upper'],
  ['back', 'back', 'upper'],
  ['lats', 'lats', 'upper'],
  ['shoulders', 'shoulders', 'upper'],
  ['biceps', 'biceps', 'arms'],
  ['triceps', 'triceps', 'arms'],
  ['forearms', 'forearms', 'arms'],
  ['abs', 'abs', 'core'],
  ['obliques', 'obliques', 'core'],
  ['glutes', 'glutes', 'lower'],
  ['quads', 'quads', 'lower'],
  ['hamstrings', 'hamstrings', 'lower'],
  ['calves', 'calves', 'lower'],
  ['lower_back', 'lower_back', 'core'],
  ['traps', 'traps', 'upper'],
  ['full_body', 'full_body', 'other'],
  ['cardio', 'cardio', 'other'],
  ['upper_chest', 'chest', 'upper'],
  ['lower_chest', 'chest', 'upper'],
  ['front_delts', 'shoulders', 'upper'],
  ['side_delts', 'shoulders', 'upper'],
  ['rear_delts', 'shoulders', 'upper'],
  ['adductors', 'quads', 'lower'],
  ['abductors', 'glutes', 'lower'],
  ['hip_flexors', 'abs', 'core'],
  ['neck', 'neck', 'upper'],
  ['upper_traps', 'traps', 'upper'],
  ['mid_lower_traps', 'traps', 'upper'],
  ['rhomboids_teres', 'back', 'upper'],
  ['quads_lower', 'quads', 'lower'],
  ['serratus_anterior', 'back', 'upper'],
  ['rotator_cuff', 'shoulders', 'upper'],
  ['soleus', 'calves', 'lower'],
  ['tibialis_anterior', 'calves', 'lower'],
];

export const MUSCLE_IDS: MuscleId[] = ROWS.map((r) => r[0]);
const PARENT = new Map(ROWS.map((r) => [r[0], r[1]]));
const GROUP = new Map(ROWS.map((r) => [r[0], r[2] as GroupKey]));

export const isMuscle = (id: string): boolean => PARENT.has(id);
export const groupOf = (id: MuscleId): GroupKey => GROUP.get(id) ?? 'other';
/** Parent id ('chest' for upper_chest). A muscle with no children is its own parent. */
export const parentOf = (id: MuscleId): MuscleId => PARENT.get(id) ?? id;
/** Whole-body categories: not a single muscle, no region. */
export const isSystem = (id: MuscleId): boolean => id === 'full_body' || id === 'cardio';

/** An id plus every muscle whose parent is that id (chest -> chest, upper_chest, lower_chest). Unknown ids give []. */
export function expand(id: MuscleId): MuscleId[] {
  if (!PARENT.has(id)) return [];
  return ROWS.filter((r) => r[1] === id || r[0] === id).map((r) => r[0]);
}

/** Deep or hidden muscles shown softly at a neighbouring surface region (docs/BODY_PICKER.md P16.2, assumption A). */
export const FALLBACK: Record<MuscleId, MuscleId[]> = {
  hip_flexors: ['quads'],
  serratus_anterior: ['obliques'],
  rotator_cuff: ['front_delts', 'side_delts', 'rear_delts'],
  soleus: ['calves'],
  tibialis_anterior: ['calves'],
};

export type RegionTier = 'clear' | 'approx' | 'list' | 'sys';
/** Tier of a muscle id. A parent counts as clear when any child is drawn. */
export function tierOf(id: MuscleId): RegionTier {
  if (isSystem(id)) return 'sys';
  const ids = expand(id);
  const own = ids.map((i) => REGIONS[i]).filter((r): r is NonNullable<typeof r> => !!r);
  if (!own.length) return 'list';
  if (ids.length > 1) return 'clear';
  return own.every((r) => r.tier === 'approx') ? 'approx' : 'clear';
}

/** Views (front/back) on which an id has a drawn region. */
export function viewsOf(id: MuscleId): View[] {
  const set = new Set<View>();
  for (const i of expand(id)) for (const v of REGIONS[i]?.views ?? []) set.add(v);
  return [...set].sort() as View[];
}

/** Value for a muscle from a record keyed by detailed or parent id: own id first, then its parent. */
export function lookup<T>(rec: Record<MuscleId, T> | undefined, id: MuscleId): T | undefined {
  if (!rec) return undefined;
  if (Object.prototype.hasOwnProperty.call(rec, id)) return rec[id];
  const p = parentOf(id);
  return p !== id && Object.prototype.hasOwnProperty.call(rec, p) ? rec[p] : undefined;
}

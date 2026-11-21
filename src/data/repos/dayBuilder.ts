// Day builder data (Phase 33): the candidate pool, marks, equipment mode and superset pairs for the builders. The UI
// never reads the dataset or the store directly; it asks here and passes the result to `src/shared/dayBuilder.ts`.

import { getExerciseIndex, getSupersets } from '../../dataset/loader';
import { istDayKey } from '../../shared/dates';
import type { BuildCandidate, BuildEntry, Partner, PairRow } from '../../shared/dayBuilder';
import { supersetPartners } from '../../shared/dayBuilder';
import type { EquipmentPreset } from '../../shared/equipment';
import type { Taxonomy } from '../../shared/muscles';
import type { ItemRef } from '../../shared/routineEdit';
import type { ScoreContext } from '../../shared/suggest';
import { loadLabData, type LabData } from './lab';
import { getEquipmentPreset } from './library';
import { listCustomExercises } from './exercises';

export interface BuilderData {
  pool: BuildCandidate[];
  tax: Taxonomy;
  person: LabData['person'];
  machineStatus: Record<string, string>;
  preset: EquipmentPreset;
  pairs: PairRow[];
}

export async function loadBuilderData(): Promise<BuilderData> {
  const [lab, index, preset, pairs] = await Promise.all([loadLabData(), getExerciseIndex(), getEquipmentPreset(), getSupersets().catch(() => [])]);
  const pool: BuildCandidate[] = lab.candidates.map((c) => {
    const r = index.bySlug.get(c.slug);
    return r ? { ...c, subCategory: r.subCategory, warmup: r.warmup } : c;
  });
  return { pool, tax: lab.tax, person: lab.person, machineStatus: lab.machineStatus, preset, pairs: pairs.map((p) => ({ a: p.a, b: p.b, type: p.type, muscles: p.muscles })) };
}

export interface BuilderPrefs {
  /** `muscle_gain`, `strength`, `fat_loss` ... or undefined for any. */
  track?: string;
  /** `beginner` or undefined. */
  level?: string;
}

/** The score context for the builders: marks, hidden, favourites, machine status and the day key (IST). */
export function builderCtx(d: BuilderData, prefs: BuilderPrefs = {}, now: number = Date.now()): ScoreContext {
  return {
    tax: d.tax,
    dayKey: istDayKey(now),
    track: prefs.track,
    level: prefs.level,
    favourites: d.person.favourites,
    hidden: d.person.hidden,
    avoid: d.person.avoid,
    sore: d.person.sore,
    machineStatus: d.machineStatus,
  };
}

/** Item refs for built entries: a library slug, or the custom exercise's id. */
export async function refsFor(entries: readonly BuildEntry[]): Promise<Map<string, ItemRef>> {
  const custom = entries.some((e) => e.custom) ? await listCustomExercises() : [];
  const out = new Map<string, ItemRef>();
  for (const e of entries) {
    const c = e.custom ? custom.find((x) => x.slug === e.slug) : undefined;
    out.set(e.slug, c?.id ? { kind: 'custom', id: c.id } : { kind: 'lib', slug: e.slug });
  }
  return out;
}

/** Superset partners for one library exercise (superset swipe). */
export async function loadPartners(slug: string): Promise<Partner[]> {
  const d = await loadBuilderData();
  return supersetPartners(slug, d.pairs, d.pool, builderCtx(d), d.preset);
}

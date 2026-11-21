// Muscle Lab repo (Phase 18): loads everything the lab screens need in one call, so pages never touch the dataset
// loader or the local store directly. Read-only.

import { buildTaxonomy, type Taxonomy } from '../../shared/muscles';
import { routinesRepo } from '../local';
import { loadMarks } from './marks';
import { marksToSets } from '../../shared/avoid';
import { favouriteSlugs, hiddenSlugs } from '../../shared/personal';
import { loadPersonal } from './personal';
import { getExerciseIndex, getMachineReach, getMachines, getMuscleMap, getMuscles, imageUrls, type ImageUrl, type Machine, type MapRow } from '../../dataset/loader';
import { toCandidate, type LabPerson } from '../../pages/body/labData';
import type { Candidate } from '../../shared/suggest';
import { listCustomExercises } from './exercises';
import { gymHiddenSlugs, machineStatusFor } from './gymPolicy';

export interface LabData {
  candidates: Candidate[];
  /** Muscle map rows by slug (dataset and custom). */
  map: Record<string, MapRow[]>;
  tax: Taxonomy;
  machines: Machine[];
  reach: unknown;
  person: LabPerson;
  machineStatus: Record<string, string>;
}

const ROLE: Record<string, string> = { primary: 'p', secondary: 's', stabiliser: 't' };
const EMPH: Record<string, string> = { high: 'h', medium: 'm', low: 'l' };

/** Row shapes: marks `{muscle, kind}` and routines per API_CONTRACTS P18.1; favourites / hidden / notes per Phase 26 (`src/shared/personal.ts`). */
export async function loadLabData(): Promise<LabData> {
  const [{ rows }, dsMap, { muscles }, { list: machines }, reach, custom, routines, favs, marks] = await Promise.all([
    getExerciseIndex(),
    getMuscleMap(),
    getMuscles(),
    getMachines(),
    getMachineReach(),
    listCustomExercises(),
    routinesRepo.list(),
    loadPersonal(),
    loadMarks().catch(() => []),
  ]);
  const taken = new Set(rows.map((r) => r.slug));
  const map: Record<string, MapRow[]> = { ...dsMap };
  const candidates = rows.map((r) => toCandidate(r, dsMap[r.slug] ?? []));
  const customSlugs = new Set<string>();
  for (const c of custom) {
    if (!c.slug || taken.has(c.slug) || customSlugs.has(c.slug)) continue;
    customSlugs.add(c.slug);
    const m: MapRow[] = (c.muscles ?? []).map((x) => [x.id, ROLE[x.role] ?? 'p', EMPH[x.emphasis] ?? 'm', 0]);
    map[c.slug] = m;
    candidates.push(
      toCandidate(
        { slug: c.slug, name: c.name, category: 'custom', kind: c.kind, machine: c.machineSlug ?? '', difficulty: 2, unilateral: false, beginner: false, tracks: 0, custom: true },
        m,
      ),
    );
  }
  const slugsOf = (rs: typeof routines): Set<string> => {
    const out = new Set<string>();
    for (const r of rs) {
      const days = (r.days as Array<{ items?: Array<{ ref?: { kind?: string; slug?: string } }> }> | undefined) ?? [];
      for (const d of days) for (const it of d.items ?? []) if (it.ref?.kind === 'lib' && it.ref.slug) out.add(it.ref.slug);
    }
    return out;
  };
  const active = routines.filter((r) => r.active === true);
  // One reading of the marks for every caller (Muscle Lab, day builder, swaps): `src/shared/avoid.ts`, Phase 49.
  const { avoid, sore } = marksToSets(marks);
  const person: LabPerson = {
    favourites: favouriteSlugs(favs),
    hidden: new Set([...hiddenSlugs(favs), ...gymHiddenSlugs()]),
    customSlugs,
    routineSlugs: slugsOf(active.length ? active : routines),
    avoid,
    sore,
  };
  const machineStatus: Record<string, string> = {};
  for (const m of machines) machineStatus[m.slug] = machineStatusFor(m.slug, m.status).status;
  return { candidates, map, tax: buildTaxonomy(muscles), machines, reach, person, machineStatus };
}

export function machinePhotos(slug: string): Promise<ImageUrl[]> {
  return imageUrls(slug);
}

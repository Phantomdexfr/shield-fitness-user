// Routine editing data (Phase 31): exercise names, machines and muscle maps for the items of a routine, and the
// "Good for <muscle>" suggestions. The UI never reads the dataset or the store directly.

import { exercisesRepo, listCustomExercises } from './exercises';
import type { MapRow } from '../../dataset/loader';
import { refKey, type ItemRef, type MuscleLookup } from '../../shared/routineEdit';

export interface ExInfo {
  name: string;
  /** Machine slug or ''. */
  machine: string;
  muscles: MapRow[];
}

/** Name, machine and muscle map for each distinct exercise. A missing exercise gets its slug as name and no muscles (never throws). */
export async function loadExInfo(refs: readonly ItemRef[]): Promise<Map<string, ExInfo>> {
  const custom = await listCustomExercises();
  const unique = new Map<string, ItemRef>();
  for (const r of refs) unique.set(refKey(r), r);
  const out = new Map<string, ExInfo>();
  await Promise.all(
    [...unique].map(async ([key, ref]) => {
      const slug = ref.kind === 'lib' ? ref.slug : custom.find((c) => c.id === ref.id)?.slug;
      const full = slug ? await exercisesRepo.get(slug).catch(() => undefined) : undefined;
      out.set(key, full ? { name: full.row.name, machine: full.row.machine, muscles: full.muscles } : { name: slug ?? (ref.kind === 'lib' ? ref.slug : 'Custom'), machine: '', muscles: [] });
    }),
  );
  return out;
}

/** Sync muscle lookup over a loaded info map. */
export const lookupFrom = (info: ReadonlyMap<string, ExInfo>): MuscleLookup => (ref) => info.get(refKey(ref))?.muscles ?? [];

export interface Pick {
  slug: string;
  name: string;
  custom: boolean;
}

/** Search for the add sheet. Empty text gives nothing (the sheet shows suggestions instead). */
export async function searchPicks(q: string): Promise<Pick[]> {
  if (q.trim() === '') return [];
  const r = await exercisesRepo.fuzzy(q);
  return r.hits.slice(0, 40).map((h) => ({ slug: h.row.slug, name: h.row.name, custom: h.row.custom }));
}

/** "Good for <muscle>": the strongest exercises for the day's target muscles, a few per muscle, no repeats. */
export async function goodFor(muscles: readonly string[], perMuscle = 4, maxMuscles = 3): Promise<Array<{ muscle: string; picks: Pick[] }>> {
  const seen = new Set<string>();
  const out: Array<{ muscle: string; picks: Pick[] }> = [];
  for (const m of muscles.slice(0, maxMuscles)) {
    const hits = await exercisesRepo.byMuscle(m).catch(() => []);
    const picks: Pick[] = [];
    for (const h of hits) {
      if (picks.length >= perMuscle) break;
      if (seen.has(h.row.slug)) continue;
      seen.add(h.row.slug);
      picks.push({ slug: h.row.slug, name: h.row.name, custom: h.row.custom });
    }
    if (picks.length) out.push({ muscle: m, picks });
  }
  return out;
}

/** Turns a pick into an item ref: a library slug, or the custom exercise's id. */
export async function refFor(p: Pick): Promise<ItemRef> {
  if (!p.custom) return { kind: 'lib', slug: p.slug };
  const c = (await listCustomExercises()).find((x) => x.slug === p.slug);
  return c?.id ? { kind: 'custom', id: c.id } : { kind: 'lib', slug: p.slug };
}

export function machineThumb(slug: string): Promise<string | undefined> {
  return exercisesRepo.imageUrls(slug).then(
    (l) => (l.find((x) => x.variant === 'thumb' && x.primary) ?? l.find((x) => x.variant === 'thumb') ?? l[0])?.url,
    () => undefined,
  );
}

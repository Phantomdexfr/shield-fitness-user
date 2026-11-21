// Recap data (Phase 61): reads finished sessions and the exercise muscle maps, then asks the pure recap maths. Read-only. Screens ask here only.

import { listSessions } from './sessions';
import { getSeparatePrPerGrip } from './exercisePage';
import { exercisesRepo, listCustomExercises } from './exercises';
import { computeRecap, type RecapRange, type RecapStats } from '../../shared/recap';
import { dayOfSession, finishedSessions, type MapRowLike } from '../../shared/history';
import { refId } from '../../shared/session';

export interface RecapData {
  stats: RecapStats;
  /** Exercise name by slug (a name that cannot be found shows the slug). */
  names: Record<string, string>;
  /** Earliest and latest IST day with a finished session; null when there are none (for the "All time" range). */
  firstDay: string | null;
}

export async function loadRecap(range: RecapRange): Promise<RecapData> {
  const [sessions, custom, byGrip] = await Promise.all([listSessions(), listCustomExercises().catch(() => []), getSeparatePrPerGrip().catch(() => false)]);
  const slugOfCustom = (id: string) => custom.find((c) => c.id === id)?.slug;
  const slugOf = (ref: { kind: 'lib'; slug: string } | { kind: 'custom'; id: string }) => (ref.kind === 'lib' ? ref.slug : slugOfCustom(ref.id) ?? refId(ref));
  const done = finishedSessions(sessions);
  const slugs = new Set<string>();
  for (const s of done) for (const it of s.items) slugs.add(slugOf(it.ref as never));
  const muscles = new Map<string, readonly MapRowLike[]>();
  const names: Record<string, string> = {};
  await Promise.all(
    [...slugs].map(async (slug) => {
      const full = await exercisesRepo.get(slug).catch(() => undefined);
      muscles.set(slug, (full?.muscles as unknown as MapRowLike[] | undefined) ?? []);
      names[slug] = full?.row.name ?? custom.find((c) => c.slug === slug)?.name ?? slug;
    }),
  );
  const stats = computeRecap(sessions, range, { slugOf: slugOf as never, musclesOf: (slug) => muscles.get(slug) ?? [], customSlug: slugOfCustom }, byGrip);
  const days = done.map(dayOfSession).sort();
  return { stats, names, firstDay: days[0] ?? null };
}

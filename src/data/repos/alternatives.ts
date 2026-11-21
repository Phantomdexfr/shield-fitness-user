// Alternatives data (Phase 35): turns a skipped session item into the input of `alternativesFor` (src/shared/alternatives.ts).
// The screen asks here; it never reads the dataset or the store directly. Read-only.

import { getExerciseIndex, getSubstitutions } from '../../dataset/loader';
import { getExercise, variationsOf } from '../../dataset/query';
import { alternativesFor, primaryIds, type AltCandidate, type AlternativesResult } from '../../shared/alternatives';
import { istDayKey } from '../../shared/dates';
import type { Session, SessionItem, SkipReason } from '../../shared/session';
import type { Candidate, ScoreContext } from '../../shared/suggest';
import { listCustomExercises } from './exercises';
import { loadLabData } from './lab';

export interface AlternativeRequest {
  session: Session;
  item: SessionItem;
  reason: SkipReason;
  /** Pain only: muscle ids picked on the body. */
  area?: readonly string[];
  now?: number;
}

/** Library exercises get their `pattern` from the detail chunk; custom ones have none. Only the few that the pools need are looked up. */
async function withPattern(c: Candidate, primary: readonly string[]): Promise<AltCandidate> {
  if (c.custom) return { ...c, primary, pattern: '' };
  const full = await getExercise(c.slug).catch(() => undefined);
  return { ...c, primary, pattern: full?.detail.pattern ?? '' };
}

/** Up to 5 alternatives for one skipped item. Rejects only when the dataset cannot be read; the screen then shows its empty state. */
export async function loadAlternatives(req: AlternativeRequest): Promise<AlternativesResult> {
  const { item, reason } = req;
  if (item.ref.kind !== 'lib' && item.ref.kind !== 'custom') return { alternatives: [], area: [] };
  const [lab, index, subs] = await Promise.all([loadLabData(), getExerciseIndex(), getSubstitutions().catch(() => ({} as Record<string, string[]>))]);

  // A custom ref carries the row id, the candidates carry the slug: the custom exercise row maps one to the other.
  const refId = item.ref.kind === 'custom' ? item.ref.id : undefined;
  const skippedSlug = item.ref.kind === 'lib' ? item.ref.slug : (await listCustomExercises()).find((c) => c.id === refId)?.slug;
  const base = skippedSlug ? lab.candidates.find((c) => c.slug === skippedSlug) : undefined;
  if (!base) return { alternatives: [], area: [] };

  const primaryOf = (c: Candidate): readonly string[] => index.bySlug.get(c.slug)?.primary ?? primaryIds(c.rows);
  const key = primaryOf(base)[0];
  const substitutes = subs[base.slug] ?? [];
  const wanted = new Set<string>([base.slug, ...substitutes]);
  const near = lab.candidates.filter((c) => wanted.has(c.slug) || (key !== undefined && primaryOf(c)[0] === key));

  const [skipped, pool, variations] = await Promise.all([
    withPattern(base, primaryOf(base)),
    Promise.all(near.map((c) => withPattern(c, primaryOf(c)))),
    base.custom ? Promise.resolve([] as string[]) : variationsOf(base.slug).catch(() => [] as string[]),
  ]);

  const ctx: ScoreContext = {
    tax: lab.tax,
    dayKey: istDayKey(req.now ?? Date.now()),
    favourites: lab.person.favourites,
    hidden: lab.person.hidden,
    avoid: lab.person.avoid,
    sore: lab.person.sore,
    machineStatus: lab.machineStatus,
  };
  return alternativesFor({
    skipped,
    variation: item.variation,
    reason,
    area: req.area,
    pool,
    variations,
    substitutes,
    ctx,
    busyMachines: new Set(req.session.busyMachines ?? []),
  });
}

/** The machine slug of a session item's exercise ('' when none), for "Mark busy". */
export async function machineOf(item: SessionItem): Promise<string> {
  if (item.ref.kind !== 'lib') return '';
  const row = (await getExerciseIndex()).bySlug.get(item.ref.slug);
  return row?.machine ?? '';
}

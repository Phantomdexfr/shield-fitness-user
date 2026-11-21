// AI review data (Phase 40): finished sessions with names, machines, muscle weights and the person's own notes, plus the
// saved options. Read-only except the saved options. Screens ask here only; nothing leaves the device.

import { prefsRepo } from '../local';
import { listSessions } from './sessions';
import { exercisesRepo, listCustomExercises } from './exercises';
import { loadPersonal } from './personal';
import { finishedSessions } from '../../shared/history';
import { refId } from '../../shared/session';
import { rowsToWeights, type MapRowTuple } from '../../shared/weights';
import { DEFAULT_INCLUDE, DEFAULT_INTRO, type AiHistory, type AiInclude, type AiUnit } from '../../shared/aiReview';

/** What is remembered between uses. The three personal options (name, bodyweight, body stats) are never remembered: off every time. */
export interface AiPrefs {
  intro: string | null;
  units: AiUnit;
  include: Pick<AiInclude, 'notes' | 'rpe' | 'setups' | 'prs' | 'muscles'>;
}

export const DEFAULT_PREFS: AiPrefs = {
  intro: DEFAULT_INTRO,
  units: 'kg',
  include: { notes: DEFAULT_INCLUDE.notes, rpe: DEFAULT_INCLUDE.rpe, setups: DEFAULT_INCLUDE.setups, prs: DEFAULT_INCLUDE.prs, muscles: DEFAULT_INCLUDE.muscles },
};

const PREFS_ID = 'aireview:prefs';
const FLAGS = ['notes', 'rpe', 'setups', 'prs', 'muscles'] as const;

/** Anything that does not look right reads as the default. */
export function parsePrefs(v: unknown): AiPrefs {
  if (!v || typeof v !== 'object') return structuredClone(DEFAULT_PREFS);
  const o = v as Record<string, unknown>;
  const include = { ...DEFAULT_PREFS.include };
  const inc = (o.include && typeof o.include === 'object' ? o.include : {}) as Record<string, unknown>;
  for (const k of FLAGS) if (typeof inc[k] === 'boolean') include[k] = inc[k] as boolean;
  return {
    intro: o.intro === null ? null : typeof o.intro === 'string' ? o.intro : DEFAULT_PREFS.intro,
    units: o.units === 'lb' ? 'lb' : 'kg',
    include,
  };
}

export async function getAiPrefs(): Promise<AiPrefs> {
  return parsePrefs((await prefsRepo.get(PREFS_ID))?.value);
}

export async function setAiPrefs(p: AiPrefs): Promise<void> {
  await prefsRepo.put({ client_id: PREFS_ID, value: p });
}

/** Finished sessions and the lookups the text needs. `labelOf` turns a muscle id into its name (the screen owns the strings). */
export async function loadAiHistory(labelOf: (muscleId: string) => string): Promise<AiHistory> {
  const [all, custom, personal] = await Promise.all([listSessions(), listCustomExercises().catch(() => []), loadPersonal().catch(() => new Map())]);
  const sessions = finishedSessions(all);
  const customSlugs: Record<string, string> = {};
  for (const c of custom) if (c.id && c.slug) customSlugs[c.id] = c.slug;

  const names: Record<string, string> = {};
  const machines: Record<string, string> = {};
  const weights: Record<string, Record<string, number>> = {};
  const notes: Record<string, string> = {};
  const muscleNames: Record<string, string> = {};
  const seen = new Set<string>();
  const slugOf = (it: { ref: { kind: string; slug?: string; id?: string } }): string | undefined => (it.ref.kind === 'lib' ? it.ref.slug : customSlugs[it.ref.id ?? '']);

  const todo: Array<{ key: string; slug: string | undefined }> = [];
  for (const s of sessions)
    for (const it of s.items) {
      const key = refId(it.ref);
      if (seen.has(key)) continue;
      seen.add(key);
      todo.push({ key, slug: slugOf(it as never) });
    }
  await Promise.all(
    todo.map(async ({ key, slug }) => {
      if (!slug) return;
      const full = await exercisesRepo.get(slug).catch(() => undefined);
      if (full) {
        names[key] = full.row.name;
        if (full.row.machine) machines[key] = (await exercisesRepo.getMachine(full.row.machine).catch(() => undefined))?.name ?? full.row.machine;
        const w = rowsToWeights(full.muscles as unknown as MapRowTuple[]);
        weights[key] = w;
        for (const id of Object.keys(w)) muscleNames[id] ??= labelOf(id);
      }
      const note = personal.get(slug)?.note;
      if (note && note.trim()) notes[key] = note;
    }),
  );
  return { sessions, names, machines, weights, muscleNames, notes, customSlugs };
}

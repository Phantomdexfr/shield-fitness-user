// Heatmap data (Phase 44): turns every logged session into heat entries (variation and setup applied, custom exercises
// read from the person's own picks), and builds the weak-spot suggestions. Read-only except `addToRoutine`.

import { listSessions } from './sessions';
import { exercisesRepo, listCustomExercises } from './exercises';
import { marksRepo } from '../local';
import { listRoutines, putRoutine } from './routines';
import { loadLabData } from './lab';
import { getMuscles, getSetupOptions, getVariationShift } from '../../dataset/loader';
import { buildTaxonomy, type Taxonomy } from '../../shared/muscles';
import { rowsToWeights, type MapRowTuple } from '../../shared/weights';
import { entryFromSets, inPeriod, lastDays } from '../../shared/heat';
import type { RecoveryEntry } from '../../shared/recovery';
import { dayOfSession } from '../../shared/history';
import { istDayKey, type DayKey } from '../../shared/dates';
import { addItem } from '../../shared/routineEdit';
import { pickDay, weakSpots, WEAK_SUGGESTIONS, type WeakResult } from '../../shared/weakSpots';
import { weakGroups, type LoggedEntry } from '../../pages/heatmap/heatmapModel';
import { parseSetupData, setupWeights } from '../../pages/exercise/setupModel';
import { labList } from '../../pages/body/labData';
import type { Routine } from '../../shared/routine';
import type { Setup } from '../../shared/setup';

const ROLE: Record<string, string> = { primary: 'p', secondary: 's', stabiliser: 't' };
const EMPH: Record<string, string> = { high: 'h', medium: 'm', low: 'l' };

export interface HeatData {
  entries: LoggedEntry[];
  tax: Taxonomy;
  /** Every muscle id in the dataset taxonomy. */
  muscleIds: string[];
  /** Finished sessions by their IST start day (for the weak-spot session count). */
  finishedDays: DayKey[];
  /** The same work as moments in time for the recovery clock (Phase 49): the latest working set of each item, else the session start. */
  recovery: RecoveryEntry[];
}

/** When an item was last worked: its latest non-warm-up set time, else the session start, else 0 ([A-P49.1]). */
function momentOf(sets: ReadonlyArray<{ tag?: string; doneAt?: string }>, startedAt: string | undefined): number {
  let at = -Infinity;
  for (const x of sets) {
    if (x.tag === 'warmup') continue;
    const ms = Date.parse(x.doneAt ?? '');
    if (Number.isFinite(ms) && ms > at) at = ms;
  }
  if (Number.isFinite(at)) return at;
  const st = Date.parse(startedAt ?? '');
  return Number.isFinite(st) ? st : 0;
}

/** All logged work. A session still open counts (its sets are real work); items with no working set are left out. */
export async function loadHeatData(): Promise<HeatData> {
  const [sessions, custom, shiftAll, rawSetup, { muscles }] = await Promise.all([
    listSessions(),
    listCustomExercises().catch(() => []),
    getVariationShift().catch(() => ({})),
    getSetupOptions().catch(() => null),
    getMuscles(),
  ]);
  const setupData = parseSetupData(rawSetup);
  const tax = buildTaxonomy(muscles);
  const cache = new Map<string, { name: string; rows: MapRowTuple[]; custom: boolean } | null>();
  const info = async (slug: string) => {
    if (cache.has(slug)) return cache.get(slug)!;
    const c = custom.find((x) => x.slug === slug);
    let v: { name: string; rows: MapRowTuple[]; custom: boolean } | null = null;
    if (c) v = { name: c.name, custom: true, rows: (c.muscles ?? []).map((m): MapRowTuple => [m.id, ROLE[m.role] ?? 'p', EMPH[m.emphasis] ?? 'm', 0]) };
    else {
      const full = await exercisesRepo.get(slug).catch(() => undefined);
      if (full) v = { name: full.row.name, custom: false, rows: full.muscles as unknown as MapRowTuple[] };
    }
    cache.set(slug, v);
    return v;
  };
  const entries: LoggedEntry[] = [];
  const finishedDays: DayKey[] = [];
  const recovery: RecoveryEntry[] = [];
  for (const s of sessions) {
    const day = dayOfSession(s);
    if (s.endedAt) finishedDays.push(day);
    for (const it of s.items) {
      if (it.sets.length === 0) continue;
      const slug = it.ref.kind === 'lib' ? it.ref.slug : custom.find((c) => c.id === (it.ref as { id: string }).id)?.slug;
      if (!slug) continue;
      const ex = await info(slug);
      if (!ex) continue;
      const weights = ex.custom
        ? rowsToWeights(ex.rows)
        : setupWeights(ex.rows, it.variation, (shiftAll as Record<string, Record<string, Array<[string, string]>>>)[slug] ?? {}, setupData, slug, it.setup as Setup | undefined);
      const e = entryFromSets(day, it.sets, weights);
      if (e) {
        entries.push({ ...e, slug, name: ex.name, ...(it.variation ? { variation: it.variation } : {}) });
        recovery.push({ at: momentOf(it.sets, s.startedAt), weights: e.weights });
      }
    }
  }
  return { entries, tax, muscleIds: tax.ids, finishedDays, recovery };
}

export interface WeakCard {
  group: string;
  value: number;
  ratio: number;
  /** Up to 3 exercises from the suggestion engine for this group. */
  picks: Array<{ slug: string; name: string }>;
}

export interface WeakSpotsData {
  result: WeakResult;
  cards: WeakCard[];
  /** The routine a pick would be added to, or null (no routine yet). */
  routineName: string | null;
}

export async function loadWeakSpots(data: HeatData, today: DayKey): Promise<WeakSpotsData> {
  const window = lastDays(28, today);
  const sessions = data.finishedDays.filter((d) => inPeriod(window, d)).length;
  const marks = await marksRepo.list().catch(() => []);
  const marked = marks.map((m) => m.muscle).filter((x): x is string => typeof x === 'string');
  const result = weakSpots({ entries: data.entries, today, sessions, groups: weakGroups(data.muscleIds, data.tax), tax: data.tax, marked });
  const routine = await activeRoutine();
  if (result.weak.length === 0) return { result, cards: [], routineName: routine?.name ?? null };
  const lab = await loadLabData();
  const cards: WeakCard[] = result.weak.map((w) => {
    const list = labList(lab.candidates, w.group, lab.tax, today, lab.person, {}, lab.machineStatus);
    const picks = list.suggested.slice(0, WEAK_SUGGESTIONS).map((r) => ({ slug: r.slug, name: lab.candidates.find((c) => c.slug === r.slug)?.name ?? r.slug }));
    return { ...w, picks };
  });
  return { result, cards, routineName: routine?.name ?? null };
}

async function activeRoutine(): Promise<Routine | undefined> {
  const all = (await listRoutines()).filter((r) => !r.archived);
  return all.find((r) => r.active) ?? all[0];
}

export type AddResult = { ok: true; routine: string; day: string } | { ok: false; reason: 'no_routine' | 'already' };

/** One tap: add the exercise to the active routine's best day (a day that targets the group, else the lightest day). */
export async function addToRoutine(slug: string, group: string, tax: Taxonomy): Promise<AddResult> {
  const r = await activeRoutine();
  if (!r || r.days.length === 0) return { ok: false, reason: 'no_routine' };
  const id = pickDay(r.days.map((d) => ({ id: d.id, targetMuscles: d.targetMuscles, items: d.items.length })), group, tax);
  const day = r.days.find((d) => d.id === id);
  if (!day) return { ok: false, reason: 'no_routine' };
  if (day.items.some((i) => i.ref.kind === 'lib' && i.ref.slug === slug)) return { ok: false, reason: 'already' };
  const next: Routine = { ...r, days: r.days.map((d) => (d.id === day.id ? { ...d, items: addItem(d.items, { kind: 'lib', slug }) } : d)) };
  await putRoutine(next);
  return { ok: true, routine: r.name, day: day.name };
}

export const todayKey = (): DayKey => istDayKey(Date.now());

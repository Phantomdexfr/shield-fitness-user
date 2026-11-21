// Progress repo (Phase 53): reads finished sessions and the active routine, and hands the pages ready-made series. Screens ask here only.

import { prefsRepo } from '../local';
import { listSessions } from './sessions';
import { exercisesRepo, listCustomExercises } from './exercises';
import { activeRoutine } from './schedule';
import { istDayKey, type DayKey } from '../../shared/dates';
import {
  consistency,
  exerciseList,
  exercisePoints,
  exerciseSummary,
  gridCells,
  gridRange,
  plateauHint,
  topWeekIndex,
  weeklyTarget,
  weeklyVolume,
  type Consistency,
  type ExerciseListEntry,
  type ExercisePoint,
  type ExerciseSummary,
  type GridRange,
  type WeekVolume,
} from '../../shared/progressSeries';
import { effectiveSchedule } from '../../shared/schedule';

const TARGET_ID = 'streak-target';

/** The person's own weekly target (1 to 7), or null = follow the routine. Device-only pref. */
export async function readOwnTarget(): Promise<number | null> {
  try {
    const v = (await prefsRepo.get(TARGET_ID))?.value;
    return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 7 ? Math.round(v) : null;
  } catch {
    return null;
  }
}

export async function writeOwnTarget(n: number | null): Promise<void> {
  await prefsRepo.put({ client_id: TARGET_ID, value: n });
}

export interface HubRow extends ExerciseListEntry {
  name: string;
  href: string;
}

export interface HubData {
  today: DayKey;
  consistency: Consistency;
  /** null = following the routine's schedule (or the default 3). */
  ownTarget: number | null;
  weeks: WeekVolume[];
  topWeek: number;
  range: GridRange;
  cells: { day: DayKey; value: number }[];
  rows: HubRow[];
  /** Finished sessions exist at all. */
  hasSessions: boolean;
}

/** Everything `/progress` shows. */
export async function loadHub(nowMs: number = Date.now()): Promise<HubData> {
  const [sessions, custom, own, routine] = await Promise.all([listSessions(), listCustomExercises().catch(() => []), readOwnTarget(), activeRoutine().catch(() => undefined)]);
  const customSlug = (id: string) => custom.find((c) => c.id === id)?.slug;
  const today = istDayKey(nowMs);
  const target = weeklyTarget(own, routine ? effectiveSchedule(routine) : undefined);
  const weeks = weeklyVolume(sessions, today, 12);
  const range = gridRange(today, 12);
  const list = exerciseList(sessions, customSlug);
  const rows = await Promise.all(
    list.map(async (e): Promise<HubRow> => {
      const full = await exercisesRepo.get(e.slug).catch(() => undefined);
      return { ...e, name: full?.row.name ?? e.slug, href: `/progress/exercise/${e.slug}` };
    }),
  );
  return {
    today,
    consistency: consistency(sessions, today, target),
    ownTarget: own,
    weeks,
    topWeek: topWeekIndex(weeks),
    range,
    cells: gridCells(sessions, range),
    rows,
    hasSessions: list.length > 0 || weeks.some((w) => w.sessions > 0),
  };
}

export interface ExerciseData {
  slug: string;
  /** undefined when the slug is not in the dataset or the custom list. */
  name?: string;
  points: ExercisePoint[];
  summary: ExerciseSummary;
  plateau: boolean;
}

/** Everything `/progress/exercise/<slug>` shows. */
export async function loadExercise(slug: string): Promise<ExerciseData> {
  const [sessions, custom, full] = await Promise.all([listSessions(), listCustomExercises().catch(() => []), exercisesRepo.get(slug).catch(() => undefined)]);
  const customSlug = (id: string) => custom.find((c) => c.id === id)?.slug;
  const points = exercisePoints(sessions, slug, customSlug);
  const name = full?.row.name ?? custom.find((c) => c.slug === slug)?.name;
  return { slug, ...(name ? { name } : {}), points, summary: exerciseSummary(points), plateau: plateauHint(sessions, slug, customSlug) };
}

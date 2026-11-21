// Body stats and goals repo (Phase 54). Body readings share the `bodyStats` rows the muscle badges read (client_id `bw:<day>`);
// goals live in the `goals` store. Height is a device-only pref. Screens ask here only.

import { bodyStatsRepo, goalsRepo, prefsRepo, newClientId } from '../local';
import { listSessions } from './sessions';
import { exercisesRepo, listCustomExercises } from './exercises';
import { istDayKey, type DayKey } from '../../shared/dates';
import { exercisePoints, exerciseSummary } from '../../shared/progressSeries';
import { finishedSessions, dayOfSession } from '../../shared/history';
import { RANGE, goalProgress, latestOf, mergeEntry, parseEntries, parseGoal, sessionsSince, type BodyEntry, type Goal, type GoalKind, type GoalProgress } from '../../shared/goals';

const HEIGHT_ID = 'body-height';

export async function readHeight(): Promise<number | null> {
  try {
    const v = (await prefsRepo.get(HEIGHT_ID))?.value;
    return typeof v === 'number' && v >= RANGE.height[0] && v <= RANGE.height[1] ? v : null;
  } catch {
    return null;
  }
}

export async function writeHeight(cm: number | null): Promise<void> {
  await prefsRepo.put({ client_id: HEIGHT_ID, value: cm });
}

export async function loadEntries(): Promise<BodyEntry[]> {
  return parseEntries(await bodyStatsRepo.list().catch(() => []));
}

export interface BodyData {
  entries: BodyEntry[];
  heightCm: number | null;
  today: DayKey;
}

export async function loadBody(nowMs: number = Date.now()): Promise<BodyData> {
  const [entries, heightCm] = await Promise.all([loadEntries(), readHeight()]);
  return { entries, heightCm, today: istDayKey(nowMs) };
}

/** Saves the typed fields onto the day's entry (same row id the badges use, so a weight typed here feeds them). */
export async function saveEntry(patch: Partial<Omit<BodyEntry, 'day'>> & { day: DayKey }): Promise<void> {
  const prev = (await loadEntries()).find((e) => e.day === patch.day);
  const next = mergeEntry(prev, patch);
  await bodyStatsRepo.put({ client_id: `bw:${next.day}`, day: next.day, kg: next.kg, fat: next.fat, cm: next.cm });
}

export async function deleteEntry(day: DayKey): Promise<void> {
  await bodyStatsRepo.remove(`bw:${day}`);
}

// ---------------------------------------------------------------- goals

export interface GoalRow {
  goal: Goal;
  progress: GoalProgress;
  /** Lift goals: the exercise name. */
  liftName?: string;
}

export interface GoalsData {
  today: DayKey;
  rows: GoalRow[];
  /** Latest readings, for a new goal's start value. */
  latestKg: number | null;
  latestFat: number | null;
  /** Exercises with logged sets (for the lift picker). */
  lifts: { slug: string; name: string; bestE1rm: number | null }[];
}

export async function loadGoals(nowMs: number = Date.now()): Promise<GoalsData> {
  const today = istDayKey(nowMs);
  const [rawGoals, entries, sessions, custom] = await Promise.all([goalsRepo.list().catch(() => []), loadEntries(), listSessions(), listCustomExercises().catch(() => [])]);
  const customSlug = (id: string) => custom.find((c) => c.id === id)?.slug;
  const goals = rawGoals.map((r) => parseGoal(r)).filter((g): g is Goal => g !== null);
  const days = finishedSessions(sessions).map(dayOfSession);
  const slugs = new Set<string>();
  for (const s of finishedSessions(sessions)) for (const it of s.items) {
    const slug = it.ref.kind === 'lib' ? it.ref.slug : customSlug(it.ref.id);
    if (slug) slugs.add(slug);
  }
  const lifts: GoalsData['lifts'] = [];
  for (const slug of slugs) {
    const best = exerciseSummary(exercisePoints(sessions, slug, customSlug)).bestE1rm;
    if (best === null) continue;
    const full = await exercisesRepo.get(slug).catch(() => undefined);
    lifts.push({ slug, name: full?.row.name ?? custom.find((c) => c.slug === slug)?.name ?? slug, bestE1rm: best });
  }
  lifts.sort((a, b) => a.name.localeCompare(b.name));
  const rows: GoalRow[] = goals
    .sort((a, b) => (a.startDay < b.startDay ? 1 : a.startDay > b.startDay ? -1 : 0))
    .map((goal) => {
      let current: number | null = null;
      if (goal.kind === 'weight') current = latestOf(entries, 'kg');
      else if (goal.kind === 'body_fat') current = latestOf(entries, 'fat');
      else if (goal.kind === 'lift') current = lifts.find((l) => l.slug === goal.slug)?.bestE1rm ?? null;
      else if (goal.kind === 'attendance') current = sessionsSince(days, goal.startDay);
      const row: GoalRow = { goal, progress: goalProgress(goal, current, today) };
      const lift = goal.kind === 'lift' ? lifts.find((l) => l.slug === goal.slug) : undefined;
      if (lift) row.liftName = lift.name;
      return row;
    });
  return { today, rows, latestKg: latestOf(entries, 'kg'), latestFat: latestOf(entries, 'fat'), lifts };
}

export interface NewGoal {
  kind: GoalKind;
  target: number;
  start: number;
  startDay: DayKey;
  deadline?: DayKey;
  slug?: string;
  title?: string;
}

export async function createGoal(g: NewGoal): Promise<void> {
  await goalsRepo.put({ client_id: newClientId(), ...g });
}

export async function deleteGoal(id: string): Promise<void> {
  await goalsRepo.remove(id);
}

/** Records the achievement moment so it is shown once. */
export async function markAchieved(id: string, day: DayKey): Promise<void> {
  const row = await goalsRepo.get(id);
  if (row) await goalsRepo.put({ ...row, achievedOn: day });
}

// Muscle Lab data helpers (Phase 18). Pure: no DOM, no store, no dataset imports (the repo in `src/data/repos/lab.ts`
// loads the data and passes it in). Builds suggestion Candidates, the three list sections, "muscles worked" emphasis
// and the machine finder. The ranking itself is the Phase 15 engine; nothing here re-scores.

import { muscleExerciseList, surpriseMe, type ListFilters, type MuscleList } from '../../shared/suggest';
import type { Candidate, ScoreContext } from '../../shared/suggest';
import type { ReasonSignals, Ranked } from '../../shared/suggest';
import type { MapRow } from '../../dataset/loader';
import type { Taxonomy } from '../../shared/muscles';
import { normRole, type MapRowTuple } from '../../shared/weights';

/** The slice of an index row the lab needs (a subset of the dataset `ExerciseRow`). */
export interface LabRow {
  slug: string;
  name: string;
  category: string;
  kind: string;
  machine: string;
  difficulty: number;
  unilateral: boolean;
  beginner: boolean;
  tracks: number;
  custom?: boolean;
}

export function toCandidate(row: LabRow, map: readonly MapRow[]): Candidate {
  const c: Candidate = {
    slug: row.slug,
    name: row.name,
    category: row.category,
    kind: row.kind,
    difficulty: row.difficulty,
    unilateral: row.unilateral,
    beginner: row.beginner,
    tracks: row.tracks,
    machine: row.machine,
    rows: map.map((m) => [m[0], m[1], m[2], m[3]] as MapRowTuple),
  };
  if (row.custom) c.custom = true;
  return c;
}

/** The filters the Muscle Lab shows. `undefined` / `false` = not filtering. `machine: ''` = "no machine". */
export interface LabFilters {
  machine?: string;
  category?: string;
  kind?: string;
  difficulty?: number;
  track?: string;
  unilateral?: boolean;
  beginnerFriendly?: boolean;
}

export function activeFilterCount(f: LabFilters): number {
  return (['machine', 'category', 'kind', 'difficulty', 'track'] as const).filter((k) => f[k] !== undefined).length + (f.unilateral ? 1 : 0) + (f.beginnerFriendly ? 1 : 0);
}

export function toListFilters(f: LabFilters, injurySafe = false): ListFilters {
  const out: ListFilters = {};
  if (f.machine !== undefined) out.machine = f.machine;
  if (f.category !== undefined) out.category = f.category;
  if (f.kind !== undefined) out.kind = f.kind;
  if (f.difficulty !== undefined) out.difficulty = f.difficulty;
  if (f.track !== undefined) out.track = f.track;
  if (f.unilateral) out.unilateral = true;
  if (f.beginnerFriendly) out.beginnerFriendly = true;
  if (injurySafe) out.injurySafe = true;
  return out;
}

/** What the person has (all optional; an empty person still gets a list). */
export interface LabPerson {
  favourites?: ReadonlySet<string>;
  /** Slugs of custom exercises the person created. */
  customSlugs?: ReadonlySet<string>;
  /** Slugs in the active routine's days (or all routines when none is active). */
  routineSlugs?: ReadonlySet<string>;
  avoid?: ReadonlySet<string>;
  sore?: ReadonlySet<string>;
  hidden?: ReadonlySet<string>;
  level?: string;
  track?: string;
}

/**
 * The three sections for one muscle (Suggested for you / Built for you / More). "Built for you" = custom exercises plus
 * exercises that are in the person's routines. Reasons (why chips) are filled from what is known without session history.
 */
export function labList(
  candidates: readonly Candidate[],
  target: string,
  tax: Taxonomy,
  dayKey: string,
  person: LabPerson = {},
  filters: LabFilters = {},
  machineStatus?: Readonly<Record<string, string>>,
): MuscleList {
  const built = new Set<string>([...(person.customSlugs ?? []), ...(person.routineSlugs ?? [])]);
  const ctx: ScoreContext = { tax, dayKey };
  if (person.level) ctx.level = person.level;
  if (person.track) ctx.track = person.track;
  if (person.favourites) ctx.favourites = person.favourites;
  if (person.hidden) ctx.hidden = person.hidden;
  if (person.avoid) ctx.avoid = person.avoid;
  if (person.sore) ctx.sore = person.sore;
  if (machineStatus) ctx.machineStatus = machineStatus;
  const signals: ReasonSignals = {};
  if (person.routineSlugs) signals.inRoutine = person.routineSlugs;
  if (person.customSlugs) signals.builtByYou = person.customSlugs;
  return muscleExerciseList(candidates, target, ctx, { builtSlugs: built, filters: toListFilters(filters, !!(person.avoid?.size || person.sore?.size)), signals });
}

export { surpriseMe };
export type { MuscleList, Ranked };

/** Exercises per muscle id (parents count everything under them). Mobility-only rows do not count (same rule as the list). */
export function countByMuscle(candidates: readonly Candidate[], muscleIds: readonly string[], tax: Taxonomy): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of muscleIds) {
    const want = new Set(tax.expand(id));
    let n = 0;
    for (const c of candidates) if (c.rows.some(([m, r]) => want.has(m) && normRole(r) !== null && normRole(r) !== 'm')) n++;
    out[id] = n;
  }
  return out;
}

/** Values the filter selects offer, taken from the pool so a filter never leads to an empty list by itself. */
export function filterChoices(candidates: readonly Candidate[], target: string, tax: Taxonomy) {
  const want = new Set(tax.expand(target));
  const pool = candidates.filter((c) => c.rows.some(([m, r]) => want.has(m) && normRole(r) !== null && normRole(r) !== 'm'));
  const uniq = <T,>(xs: T[]) => [...new Set(xs)].sort();
  return {
    machines: uniq(pool.map((c) => c.machine)),
    categories: uniq(pool.map((c) => c.category)),
    kinds: uniq(pool.map((c) => c.kind)),
    difficulties: uniq(pool.map((c) => c.difficulty)),
  };
}

// ---------- "muscles worked" ----------

export type Band = 'high' | 'medium' | 'low';
export interface WorkedRow {
  muscle: string;
  role: 'primary' | 'secondary' | 'stabiliser';
  band: Band;
}

const BAND: Record<string, Band> = { h: 'high', m: 'medium', l: 'low' };
const BAND_RANK: Record<Band, number> = { high: 3, medium: 2, low: 1 };

/** Primary and secondary rows of an exercise for the body (stabilisers listed, never drawn; mobility left out). Strongest first. */
export function workedRows(map: readonly MapRow[]): WorkedRow[] {
  const best = new Map<string, WorkedRow>();
  for (const [muscle, roleRaw, emph] of map) {
    const r = normRole(roleRaw);
    if (r === null || r === 'm') continue;
    const role = r === 'p' ? 'primary' : r === 's' ? 'secondary' : 'stabiliser';
    const band = BAND[emph] ?? 'low';
    const cur = best.get(muscle);
    const rank = (x: WorkedRow) => (x.role === 'primary' ? 30 : x.role === 'secondary' ? 20 : 10) + BAND_RANK[x.band];
    const next: WorkedRow = { muscle, role, band };
    if (!cur || rank(next) > rank(cur)) best.set(muscle, next);
  }
  return [...best.values()].sort((a, b) => (b.role === 'primary' ? 30 : b.role === 'secondary' ? 20 : 10) + BAND_RANK[b.band] - ((a.role === 'primary' ? 30 : a.role === 'secondary' ? 20 : 10) + BAND_RANK[a.band]) || (a.muscle < b.muscle ? -1 : 1));
}

/** Emphasis map for `<BodyPicker mode="view">`. */
export function emphasisOf(rows: readonly WorkedRow[]): Record<string, 'primary' | 'secondary'> {
  const out: Record<string, 'primary' | 'secondary'> = {};
  for (const r of rows) if (r.role !== 'stabiliser') out[r.muscle] = r.role;
  return out;
}

// ---------- machine finder ----------

export interface ReachFile {
  machines: Record<string, { n: number; all: Array<[string, number, number]> }>;
}
export interface FinderMachine {
  slug: string;
  name: string;
  /** 0.15 to 1: the strongest weight of the muscle on this machine. */
  weight: number;
  /** Exercises on this machine that train the muscle. */
  exercises: number;
}

export function isReachFile(x: unknown): x is ReachFile {
  return !!x && typeof x === 'object' && typeof (x as ReachFile).machines === 'object' && (x as ReachFile).machines !== null;
}

/** The best machines for one muscle (a core id counts its children): strongest weight, then more exercises, then name. */
export function machineFinder(
  reach: unknown,
  target: string,
  tax: Taxonomy,
  machines: ReadonlyArray<{ slug: string; name: string; status?: string }>,
  limit = 5,
): FinderMachine[] {
  if (!isReachFile(reach)) return [];
  const want = new Set(tax.expand(target));
  const out: FinderMachine[] = [];
  for (const m of machines) {
    if (m.status === 'maintenance' || m.status === 'out_of_order') continue;
    const entry = reach.machines[m.slug];
    if (!entry) continue;
    let weight = 0;
    let exercises = 0;
    for (const [id, w, n] of entry.all) {
      if (!want.has(id)) continue;
      if (w > weight) weight = w;
      if (n > exercises) exercises = n;
    }
    if (weight > 0) out.push({ slug: m.slug, name: m.name, weight, exercises });
  }
  return out.sort((a, b) => b.weight - a.weight || b.exercises - a.exercises || a.name.localeCompare(b.name, 'en') || (a.slug < b.slug ? -1 : 1)).slice(0, limit);
}

/** Machine -> body rows from the reach table (weight 1 = primary, anything lower = secondary). [A] */
export function machineWorkedRows(reach: unknown, machineSlug: string): WorkedRow[] {
  if (!isReachFile(reach)) return [];
  const entry = reach.machines[machineSlug];
  if (!entry) return [];
  return entry.all
    .map(([muscle, w]): WorkedRow => ({ muscle, role: w >= 1 ? 'primary' : 'secondary', band: w >= 1 ? 'high' : w >= 0.6 ? 'medium' : 'low' }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1) || BAND_RANK[b.band] - BAND_RANK[a.band] || (a.muscle < b.muscle ? -1 : 1));
}

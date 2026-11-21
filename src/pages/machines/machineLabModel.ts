// Machine Lab model (Phase 23). Pure: no DOM, no network. Mirrors engines.md section 15.
// The compiled table (`machine_reach`, Phase 10) answers "no chip" and "one chip". When two or more chips are on
// (for example bench + handle) the same rules run here at runtime, so a one-chip result is identical to the table.
// [A-P23.1] The runtime uses the compiler's simplified setup shift (A59), not the full `applySetup`, so the numbers match the table.

import type { MapRow } from '../../dataset/loader';

/** `[muscleId, reach 0-1 (2 dp), count of exercises reaching >= 0.3]`. */
export type ReachRow = [string, number, number];
export type CompanionAxis = 'bench' | 'handle' | 'position';
export const COMPANION_AXES: readonly CompanionAxis[] = ['bench', 'handle', 'position'];

export interface ReachEntry {
  n: number;
  all: ReachRow[];
  filters: Record<string, ReachRow[]>;
  bench: Array<[string, number]>;
  handle: Array<[string, number]>;
  modes: Array<[string, string | null, string, number | string]>;
}
export interface ReachFile {
  muscles: string[];
  machines: Record<string, ReachEntry>;
}

/** Chosen companion chips: at most one value per axis. */
export type Selection = Partial<Record<CompanionAxis, string>>;

export interface SetupFile {
  patterns: Record<string, string>;
  exercises: Record<string, Partial<Record<string, string[]>>>;
  shift: Record<string, Record<string, Record<string, Array<[string, string]>>>>;
}

/** Everything the runtime calculation needs. */
export interface LabInputs {
  /** Exercise slugs on the machine (dataset exercises only). */
  slugs: readonly string[];
  map: Readonly<Record<string, readonly MapRow[]>>;
  setup: SetupFile;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const ROLE_F: Record<string, number> = { p: 1, s: 1, t: 0.5, m: 0 };
const EMPH_F: Record<string, number> = { h: 1, m: 0.6, l: 0.3 };
export const REACHED = 0.3;

export function parseReach(raw: unknown): ReachFile | null {
  const r = raw as ReachFile | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.muscles) || !r.machines || typeof r.machines !== 'object') return null;
  return r;
}

export function parseSetupFile(raw: unknown): SetupFile | null {
  const r = raw as SetupFile | null;
  if (!r || typeof r !== 'object' || !r.patterns || !r.exercises || !r.shift) return null;
  return r;
}

/** Display bands (engines.md 4, on reach): 0 = none, then 0.2 steps up to 5. */
export function bandOf(reach: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!(reach > 0)) return 0;
  return Math.min(5, Math.max(1, Math.ceil(reach * 5 - 1e-9))) as 1 | 2 | 3 | 4 | 5;
}

export function heatFor(rows: readonly ReachRow[]): Record<string, 0 | 1 | 2 | 3 | 4 | 5> {
  const out: Record<string, 0 | 1 | 2 | 3 | 4 | 5> = {};
  for (const [id, reach] of rows) out[id] = bandOf(reach);
  return out;
}

export const selectionKeys = (s: Selection): string[] => COMPANION_AXES.filter((a) => s[a]).map((a) => `${a}:${s[a]}`);

/** Tapping a chip chooses it (replacing the other chip on its axis); tapping the chosen chip clears it. */
export function toggleChip(s: Selection, axis: CompanionAxis, value: string): Selection {
  const next: Selection = { ...s };
  if (next[axis] === value) delete next[axis];
  else next[axis] = value;
  return next;
}

export interface ChipGroup {
  axis: CompanionAxis;
  /** `data` = named in the dataset; false = inferred from standard gear (Phase 8). */
  values: Array<{ value: string; data: boolean }>;
}

/** Companion chips a machine offers (bench / handle from the companions file; position from the filters the compiler built). */
export function chipGroups(entry: ReachEntry): ChipGroup[] {
  const evid = (e: number | string) => e === 1 || e === 'data';
  const position = Object.keys(entry.filters)
    .filter((k) => k.startsWith('position:'))
    .map((k) => ({ value: k.slice('position:'.length), data: true }));
  return [
    { axis: 'bench' as const, values: entry.bench.map(([value, e]) => ({ value, data: evid(e) })) },
    { axis: 'handle' as const, values: entry.handle.map(([value, e]) => ({ value, data: evid(e) })) },
    { axis: 'position' as const, values: position },
  ].filter((g) => g.values.length > 0);
}

// ---------- the calculation ----------

function weightsOf(slug: string, sel: Selection, inp: LabInputs): Record<string, number> {
  const w: Record<string, number> = {};
  for (const row of inp.map[slug] ?? []) {
    const x = (ROLE_F[row[1]] ?? 0) * (EMPH_F[row[2]] ?? 0);
    if (x > 0) w[row[0]] = Math.max(w[row[0]] ?? 0, x);
  }
  const pattern = inp.setup.patterns[slug];
  for (const axis of COMPANION_AXES) {
    const value = sel[axis];
    if (!value) continue;
    const t = inp.setup.shift[axis]?.[value];
    const list = [...(t?.any ?? []), ...(pattern && t?.[pattern] ? t[pattern] : [])];
    for (const [m, dir] of list) {
      if (dir === 'm') w[m] = w[m] === undefined ? 0.3 : Math.min(1, w[m] * 1.25);
      else if (w[m] !== undefined) w[m] = w[m] * 0.75;
    }
  }
  return w;
}

/** Exercises that offer every chosen value (no chip = all of them). */
export function exercisesFor(sel: Selection, inp: LabInputs): string[] {
  return inp.slugs.filter((s) => COMPANION_AXES.every((a) => !sel[a] || inp.setup.exercises[s]?.[a]?.includes(sel[a] as string)));
}

/** Reach rows for a selection, computed. Same rounding and order as the compiler. */
export function computeRows(sel: Selection, inp: LabInputs): ReachRow[] {
  const best: Record<string, number> = {};
  const cnt: Record<string, number> = {};
  for (const s of exercisesFor(sel, inp)) {
    for (const [m, x] of Object.entries(weightsOf(s, sel, inp))) {
      if (x > (best[m] ?? 0)) best[m] = x;
      if (x >= REACHED) cnt[m] = (cnt[m] ?? 0) + 1;
    }
  }
  return Object.keys(best)
    .sort(cmp)
    .filter((m) => (best[m] ?? 0) > 0)
    .map((m): ReachRow => [m, Math.round(Math.min(1, best[m] ?? 0) * 100) / 100, cnt[m] ?? 0]);
}

/** The rows to show: the compiled table for no chip or one chip, computed for two or more. */
export function rowsFor(entry: ReachEntry, sel: Selection, inp?: LabInputs): { rows: ReachRow[]; source: 'table' | 'computed' } {
  const keys = selectionKeys(sel);
  if (keys.length === 0) return { rows: entry.all, source: 'table' };
  if (keys.length === 1 && entry.filters[keys[0] as string]) return { rows: entry.filters[keys[0] as string] as ReachRow[], source: 'table' };
  return { rows: inp ? computeRows(sel, inp) : [], source: 'computed' };
}

/** Mapped muscles the rows do not reach (reach below 0.3). Wording on screen: "not reachable with current data". */
export function notReachable(universe: readonly string[], rows: readonly ReachRow[]): string[] {
  const hit = new Set(rows.filter((r) => r[1] >= REACHED).map((r) => r[0]));
  return universe.filter((m) => !hit.has(m));
}

export const reachedCount = (rows: readonly ReachRow[]): number => rows.filter((r) => r[1] >= REACHED).length;

export type Strength = 'strong' | 'moderate' | 'light' | 'faint';
export const strengthOf = (reach: number): Strength => (reach >= 0.8 ? 'strong' : reach >= 0.5 ? 'moderate' : reach >= REACHED ? 'light' : 'faint');

export interface TwinRow {
  muscle: string;
  reach: number;
  strength: Strength;
  count: number;
}

/** The text twin of the heated body: every reached muscle, strongest first, then A to Z. */
export function textTwin(rows: readonly ReachRow[]): TwinRow[] {
  return rows
    .map(([muscle, reach, count]): TwinRow => ({ muscle, reach, strength: strengthOf(reach), count }))
    .sort((a, b) => b.reach - a.reach || b.count - a.count || cmp(a.muscle, b.muscle));
}

// ---------- exercises that reach a tapped muscle ----------

export interface MuscleExercise {
  slug: string;
  weight: number;
  /** The setup that does it: the chosen chips, or (no chip) the single option that raises the weight most; `{}` = as usual. */
  setup: Selection;
}

/** Exercises on this machine that reach `muscleIds` (a core id expands to its children), strongest first. */
export function exercisesReaching(muscleIds: readonly string[], sel: Selection, inp: LabInputs): MuscleExercise[] {
  const want = new Set(muscleIds);
  const top = (slug: string, s: Selection): number => {
    let best = 0;
    for (const [m, x] of Object.entries(weightsOf(slug, s, inp))) if (want.has(m) && x > best) best = x;
    return best;
  };
  const out: MuscleExercise[] = [];
  const chosen = selectionKeys(sel).length > 0;
  for (const slug of exercisesFor(sel, inp)) {
    let weight = top(slug, sel);
    let setup: Selection = chosen ? { ...sel } : {};
    if (!chosen) {
      for (const axis of COMPANION_AXES) {
        for (const value of inp.setup.exercises[slug]?.[axis] ?? []) {
          const w = top(slug, { [axis]: value });
          if (w > weight + 1e-9) {
            weight = w;
            setup = { [axis]: value };
          }
        }
      }
    }
    if (weight >= REACHED) out.push({ slug, weight: Math.round(Math.min(1, weight) * 100) / 100, setup });
  }
  return out.sort((a, b) => b.weight - a.weight || cmp(a.slug, b.slug));
}

// ---------- /machines index ----------

export type IndexSort = 'reach' | 'name' | 'zone';
export interface IndexMachine {
  slug: string;
  name: string;
  zone: string | null;
  status: string;
  category: string;
  reached: number;
  total: number;
}

export function indexRows(file: ReachFile, machines: ReadonlyArray<{ slug: string; name: string; zone: string | null; status: string; category: string }>): IndexMachine[] {
  return machines.map((m) => ({ ...m, reached: reachedCount(file.machines[m.slug]?.all ?? []), total: file.muscles.length }));
}

const byName = (a: IndexMachine, b: IndexMachine): number => a.name.localeCompare(b.name, 'en') || cmp(a.slug, b.slug);

export function sortIndex(rows: readonly IndexMachine[], sort: IndexSort, q = ''): IndexMachine[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (m: IndexMachine) => words.every((w) => `${m.name} ${m.category} ${m.zone ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).some((t) => t.startsWith(w)));
  const list = rows.filter(hit);
  if (sort === 'name') return list.sort(byName);
  if (sort === 'zone') return list.sort((a, b) => (a.zone === null ? 1 : 0) - (b.zone === null ? 1 : 0) || (a.zone ?? '').localeCompare(b.zone ?? '', 'en') || byName(a, b));
  return list.sort((a, b) => b.reached - a.reached || byName(a, b));
}

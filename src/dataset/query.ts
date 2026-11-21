// Query layer (Phase 11): what screens call. Async because chunks load lazily.
// Custom (user) exercises are passed in by the caller (src/data/repos/exercises.ts reads them from IndexedDB),
// so this folder never touches the local store. A custom exercise whose slug equals a dataset slug is ignored: the dataset wins.

import {
  getDetail,
  getExerciseIndex,
  getMachines,
  getMuscleMap,
  getMuscles,
  getSearchIndex,
  imageUrls as loaderImageUrls,
  type ExerciseDetail,
  type ExerciseRow,
  type ImageUrl,
  type MapRow,
  type Machine,
} from './loader';
import { buildSearchIndex, passesFilters, runSearch, tokenize, type SearchFilters, type SearchHit, type SearchIndex } from './search';
import { buildFuzzyIndex, fuzzySearch, parseRawIndex, type FuzzyDocInput, type FuzzyIndex, type RawSearchIndex, type SuggestedSetup } from './fuzzy';

/** The user's own exercise, as stored (engines.md `CustomExercise`; extra store fields such as client_id are ignored). */
export interface CustomExercise {
  id?: string;
  name: string;
  slug: string;
  kind: 'strength' | 'cardio' | 'bodyweight';
  machineSlug?: string | null;
  muscles: Array<{ id: string; role: 'primary' | 'secondary' | 'stabiliser'; emphasis: 'high' | 'medium' | 'low' }>;
  repMin: number;
  repMax: number;
  youtubeUrl?: string;
  notes?: string;
}

export interface QueryOptions {
  custom?: readonly CustomExercise[];
}

export interface ExerciseFull {
  row: ExerciseRow;
  detail: ExerciseDetail;
  /** Muscle map rows (custom exercises: built from the user's own roles). */
  muscles: MapRow[];
}

// ---------- custom exercises -> library shapes ----------

const ROLE: Record<string, string> = { primary: 'p', secondary: 's', stabiliser: 't' };
const EMPHASIS: Record<string, string> = { high: 'h', medium: 'm', low: 'l' };

function isUsable(c: CustomExercise | undefined): c is CustomExercise {
  return !!c && typeof c.slug === 'string' && c.slug !== '' && typeof c.name === 'string' && c.name.trim() !== '';
}

function customRow(c: CustomExercise): ExerciseRow {
  return {
    slug: c.slug,
    name: c.name,
    category: 'custom',
    subCategory: '',
    kind: c.kind,
    machine: c.machineSlug ?? '',
    primary: (c.muscles ?? []).filter((m) => m.role === 'primary').map((m) => m.id),
    difficulty: 2,
    unilateral: false,
    beginner: false,
    tracks: 0,
    warmup: false,
    chunk: -1,
    custom: true,
  };
}

function customMap(c: CustomExercise): MapRow[] {
  return (c.muscles ?? []).map((m) => [m.id, ROLE[m.role] ?? 'p', EMPHASIS[m.emphasis] ?? 'm', 0]);
}

function customDetail(c: CustomExercise): ExerciseDetail {
  return {
    cues: [],
    repMin: c.repMin ?? null,
    repMax: c.repMax ?? null,
    variations: [],
    hint: c.notes ?? '',
    cautions: '',
    tracks: [],
    pattern: '',
    notes: {},
  };
}

/** Custom exercises that can be shown: well formed and not shadowing a dataset slug. */
async function usableCustom(opts: QueryOptions): Promise<CustomExercise[]> {
  const list = (opts.custom ?? []).filter(isUsable);
  if (list.length === 0) return [];
  const { bySlug } = await getExerciseIndex();
  const seen = new Set<string>();
  const out: CustomExercise[] = [];
  for (const c of list) {
    if (bySlug.has(c.slug) || seen.has(c.slug)) continue;
    seen.add(c.slug);
    out.push(c);
  }
  return out;
}

// ---------- search index cache (dataset part is built once; the custom part is rebuilt only when it changes) ----------

let baseIndex: Promise<SearchIndex> | null = null;
let withCustom: { key: string; index: SearchIndex } | null = null;

/** Tests: drop the built search indexes (the loader cache is reset by `setDatasetSource`). */
export function resetQueryCache(): void {
  baseIndex = null;
  withCustom = null;
  fuzzyBase = null;
  fuzzyWithCustom = null;
}

async function searchNames() {
  const [{ list }, { muscles }] = await Promise.all([getMachines(), getMuscles()]);
  return {
    machines: new Map(list.map((m) => [m.slug, m.name])),
    muscles: new Map(muscles.map((m) => [m.id, m.name])),
  };
}

async function getBaseIndex(): Promise<SearchIndex> {
  if (!baseIndex) {
    baseIndex = (async () => {
      const [{ rows }, names] = await Promise.all([getExerciseIndex(), searchNames()]);
      return buildSearchIndex(rows, names);
    })();
    baseIndex.catch(() => {
      baseIndex = null;
    });
  }
  return baseIndex;
}

async function getIndexFor(custom: CustomExercise[]): Promise<SearchIndex> {
  if (custom.length === 0) return getBaseIndex();
  const key = custom
    .map((c) => [c.slug, c.name, c.kind, c.machineSlug ?? '', c.muscles.map((m) => `${m.id}:${m.role}`).join(',')].join('\u0001'))
    .join('\u0002');
  if (withCustom && withCustom.key === key) return withCustom.index;
  const [{ rows }, names] = await Promise.all([getExerciseIndex(), searchNames()]);
  const index = buildSearchIndex([...rows, ...custom.map(customRow)], names);
  withCustom = { key, index };
  return index;
}

// ---------- public queries ----------

/** One exercise with its detail (loads only its own chunk) and muscle rows. Undefined when the slug is unknown. */
export async function getExercise(slug: string, opts: QueryOptions = {}): Promise<ExerciseFull | undefined> {
  const { bySlug } = await getExerciseIndex();
  const row = bySlug.get(slug);
  if (row) {
    const [detail, map] = await Promise.all([getDetail(slug), getMuscleMap()]);
    if (!detail) return undefined;
    return { row, detail, muscles: map[slug] ?? [] };
  }
  const c = (await usableCustom(opts)).find((x) => x.slug === slug);
  if (!c) return undefined;
  return { row: customRow(c), detail: customDetail(c), muscles: customMap(c) };
}

/** Muscle map rows of an exercise (empty for an unknown slug). */
export async function musclesOf(slug: string, opts: QueryOptions = {}): Promise<MapRow[]> {
  const map = await getMuscleMap();
  const hit = map[slug];
  if (hit) return hit;
  const c = (await usableCustom(opts)).find((x) => x.slug === slug);
  return c ? customMap(c) : [];
}

/** Search the library. Empty query = browse. `muscle` is a muscle id (a core id such as `chest` also matches its children). */
export async function search(
  q: string,
  filters: Omit<SearchFilters, 'slugs'> & { muscle?: string } = {},
  opts: QueryOptions = {},
): Promise<SearchHit[]> {
  const custom = await usableCustom(opts);
  const index = await getIndexFor(custom);
  const { muscle, ...rest } = filters;
  const f: SearchFilters = { ...rest };
  if (muscle !== undefined) f.slugs = new Set((await byMuscle(muscle, opts)).map((h) => h.row.slug));
  return runSearch(index, q, f);
}

// ---------- fuzzy search (Phase 20) ----------

let fuzzyBase: Promise<{ raw: RawSearchIndex; index: FuzzyIndex } | null> | null = null;
let fuzzyWithCustom: { key: string; index: FuzzyIndex } | null = null;

async function getFuzzyBase(): Promise<{ raw: RawSearchIndex; index: FuzzyIndex } | null> {
  if (!fuzzyBase) {
    fuzzyBase = (async () => {
      const raw = parseRawIndex(await getSearchIndex());
      return raw ? { raw, index: buildFuzzyIndex(raw) } : null;
    })();
    fuzzyBase.catch(() => {
      fuzzyBase = null;
    });
  }
  return fuzzyBase;
}

function customDoc(row: ExerciseRow, names: { machines: ReadonlyMap<string, string>; muscles: ReadonlyMap<string, string> }): FuzzyDocInput {
  const machine = row.machine ? names.machines.get(row.machine) : undefined;
  return {
    type: 'e',
    slug: row.slug,
    name: tokenize(row.name),
    alias: [],
    machine: machine ? tokenize(machine) : [],
    muscle: row.primary.flatMap((id) => tokenize(names.muscles.get(id) ?? '')),
    setup: [],
    category: tokenize(`${row.category} ${row.subCategory}`),
  };
}

async function getFuzzyIndexFor(custom: CustomExercise[]): Promise<FuzzyIndex | null> {
  const base = await getFuzzyBase();
  if (!base) return null;
  if (custom.length === 0) return base.index;
  const key = custom
    .map((c) => [c.slug, c.name, c.kind, c.machineSlug ?? '', c.muscles.map((m) => `${m.id}:${m.role}`).join(',')].join('\u0001'))
    .join('\u0002');
  if (fuzzyWithCustom && fuzzyWithCustom.key === key) return fuzzyWithCustom.index;
  const names = await searchNames();
  const index = buildFuzzyIndex(base.raw, custom.map((c) => customDoc(customRow(c), names)));
  fuzzyWithCustom = { key, index };
  return index;
}

export interface FuzzyExerciseResult {
  /** Exercises, best first (filters applied). */
  hits: SearchHit[];
  /** Machine slugs that matched, best first. */
  machines: string[];
  /** The setup the query named and the top exercise offers. */
  suggestedSetup?: SuggestedSetup;
  /** A corrected query that finds something. */
  didYouMean?: string;
}

/**
 * Fuzzy library search (engines.md 14): typos, aliases, word order, setup words, machines and muscles.
 * Empty query = browse (same as `search`). When `search.index.json` is missing it falls back to the Phase 11 search.
 */
export async function fuzzyExercises(
  q: string,
  filters: Omit<SearchFilters, 'slugs'> & { muscle?: string } = {},
  opts: QueryOptions = {},
): Promise<FuzzyExerciseResult> {
  const custom = await usableCustom(opts);
  const index = tokenize(q).length === 0 ? null : await getFuzzyIndexFor(custom);
  if (!index) return { hits: await search(q, filters, opts), machines: [] };

  const { rows } = await getExerciseIndex();
  const bySlug = new Map<string, ExerciseRow>(rows.map((r) => [r.slug, r]));
  for (const c of custom) if (!bySlug.has(c.slug)) bySlug.set(c.slug, customRow(c));
  const { muscle, ...rest } = filters;
  const f: SearchFilters = { ...rest };
  if (muscle !== undefined) f.slugs = new Set((await byMuscle(muscle, opts)).map((h) => h.row.slug));

  const hasFilters = Object.values(f).some((v) => v !== undefined);
  const res = fuzzySearch(index, q, {
    accept: (d) => {
      if (d.type === 'm') return !hasFilters;
      const row = bySlug.get(d.slug);
      return !!row && passesFilters(row, f);
    },
  });
  const hits: SearchHit[] = [];
  for (const h of res.hits) {
    if (h.type !== 'e') continue;
    const row = bySlug.get(h.slug);
    if (row) hits.push({ row, score: h.score });
  }
  return {
    hits,
    machines: res.hits.filter((h) => h.type === 'm').map((h) => h.slug),
    suggestedSetup: res.suggestedSetup,
    didYouMean: res.didYouMean,
  };
}

const EMPHASIS_FACTOR: Record<string, number> = { h: 1, m: 0.6, l: 0.3 };

/** engines.md section 2: primary/secondary = emphasis factor, stabiliser x0.5, mobility 0. */
function rowWeight(r: MapRow): number {
  const f = EMPHASIS_FACTOR[r[2]] ?? 0;
  if (r[1] === 'p' || r[1] === 's') return f;
  if (r[1] === 't') return f * 0.5;
  return 0;
}

export interface MuscleHit {
  row: ExerciseRow;
  /** Highest weight of the muscle (or its children) in this exercise, 0.15 to 1. */
  weight: number;
}

/** Exercises that train a muscle, strongest first (ties: name, then slug). Mobility-only rows are left out. */
export async function byMuscle(muscleId: string, opts: QueryOptions = {}): Promise<MuscleHit[]> {
  const [{ rows }, map, { muscles }] = await Promise.all([getExerciseIndex(), getMuscleMap(), getMuscles()]);
  const parentOf = new Map(muscles.map((m) => [m.id, m.parent]));
  const matches = (id: string): boolean => id === muscleId || parentOf.get(id) === muscleId;

  const hits: MuscleHit[] = [];
  const consider = (row: ExerciseRow, mapRows: readonly MapRow[]): void => {
    let best = 0;
    for (const r of mapRows) if (matches(r[0])) best = Math.max(best, rowWeight(r));
    if (best > 0) hits.push({ row, weight: best });
  };
  for (const row of rows) consider(row, map[row.slug] ?? []);
  for (const c of await usableCustom(opts)) consider(customRow(c), customMap(c));

  return hits.sort(
    (a, b) => b.weight - a.weight || a.row.name.localeCompare(b.row.name, 'en') || (a.row.slug < b.row.slug ? -1 : 1),
  );
}

/** Exercises done on a machine (A to Z). Custom exercises that name the machine are included. */
export async function byMachine(machineSlug: string, opts: QueryOptions = {}): Promise<ExerciseRow[]> {
  const { rows } = await getExerciseIndex();
  const list = rows.filter((r) => r.machine === machineSlug);
  for (const c of await usableCustom(opts)) if ((c.machineSlug ?? '') === machineSlug) list.push(customRow(c));
  return list.sort((a, b) => a.name.localeCompare(b.name, 'en') || (a.slug < b.slug ? -1 : 1));
}

/** The variation texts of an exercise (deduped, file order). Empty for a custom or unknown slug. */
export async function variationsOf(slug: string): Promise<string[]> {
  const detail = await getDetail(slug);
  return detail ? detail.variations : [];
}

/** One machine, or undefined. */
export async function getMachine(slug: string): Promise<Machine | undefined> {
  return (await getMachines()).bySlug.get(slug);
}

/** Photo urls of a machine under `public/machines/<slug>/`. */
export function imageUrls(machineSlug: string): Promise<ImageUrl[]> {
  return loaderImageUrls(machineSlug);
}

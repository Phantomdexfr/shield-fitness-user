// Dataset loader (Phase 11). Reads the compiled JSON in `src/dataset/generated/` lazily, one logical file at a time,
// and remembers each result, so a chunk is fetched once however many screens ask for it.
// Files are found through `dataset.manifest.json`, never by a hard-coded hashed name (docs/DATASET_RUNTIME.md section 4).

// ---------- types (shapes: docs/DATASET_RUNTIME.md section 3) ----------

export interface Manifest {
  contract: string;
  version: string;
  counts: Record<string, number>;
  files: Record<string, string>;
  detailChunks: Array<{ n: number; count: number; file: string }>;
}

interface Table {
  cols: string[];
  rows: unknown[][];
}

/** One library row (the compiled index, plus `custom` for the user's own exercises). */
export interface ExerciseRow {
  slug: string;
  name: string;
  category: string;
  subCategory: string;
  kind: string;
  /** Machine slug, or '' for none. */
  machine: string;
  /** Core muscle ids. */
  primary: string[];
  difficulty: number;
  unilateral: boolean;
  beginner: boolean;
  /** Bitmask: beginner 1, intermediate 2, muscle_gain 4, athlete 8, fat_loss 16, strength 32, cardio 64. */
  tracks: number;
  warmup: boolean;
  /** Detail chunk number; -1 for a custom exercise (it has no chunk). */
  chunk: number;
  custom: boolean;
}

export interface ExerciseDetail {
  cues: string[];
  repMin: number | null;
  repMax: number | null;
  variations: string[];
  hint: string;
  cautions: string;
  tracks: string[];
  pattern: string;
  notes: Record<string, string>;
}

export interface Muscle {
  id: string;
  name: string;
  parent: string;
  group: string;
  status: string;
  regions: string;
}

export interface MusclesFile {
  muscles: Muscle[];
  units: Array<{ unit: string; muscle: string }>;
}

export interface Machine {
  slug: string;
  name: string;
  brand: string;
  category: string;
  zone: string | null;
  stepKg: number | null;
  quantity: number;
  status: string;
  cues: string[];
  muscles: string[];
  detailed: string[];
}

export interface MediaEntry {
  file: string;
  variant: 'thumb' | 'detail';
  primary: boolean;
  w: number;
  h: number;
  alt: string;
}

/** [muscleId, role p|s|t|m, emphasis h|m|l, fallback 0|1] */
export type MapRow = [string, string, string, number];

export interface Superset {
  a: string;
  b: string;
  type: string;
  muscles: string[];
}

/** Where the compiled files come from. The default reads the bundled JSON; tests pass a fixture. */
export interface DatasetSource {
  loadManifest(): Promise<Manifest>;
  /** `fileName` is the hashed name taken from the manifest. */
  loadFile(fileName: string): Promise<unknown>;
}

// ---------- default source: Vite's lazy glob over the committed JSON ----------

const globbed = import.meta.glob('./generated/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;

function fileKey(fileName: string): string {
  return `./generated/${fileName}`;
}

const bundledSource: DatasetSource = {
  async loadManifest() {
    const fn = globbed[fileKey('dataset.manifest.json')];
    if (!fn) throw new Error('dataset manifest is missing from the build');
    return (await fn()) as Manifest;
  },
  async loadFile(fileName) {
    const fn = globbed[fileKey(fileName)];
    if (!fn) throw new Error(`dataset file ${fileName} is missing from the build`);
    return fn();
  },
};

// ---------- cache ----------

let source: DatasetSource = bundledSource;
let cache = new Map<string, Promise<unknown>>();

/** Run `make` once per key. A failed load is forgotten so the next call can try again. */
function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = make().catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, p);
  return p;
}

/** Tests: swap the source and forget everything. Call with no argument to go back to the bundled files. */
export function setDatasetSource(next?: DatasetSource): void {
  source = next ?? bundledSource;
  cache = new Map();
}

// ---------- logical files ----------

export function getManifest(): Promise<Manifest> {
  return once('manifest', () => source.loadManifest());
}

async function logical<T>(name: string): Promise<T> {
  return once(`file:${name}`, async () => {
    const m = await getManifest();
    const file = m.files[name];
    if (!file) throw new Error(`dataset has no file "${name}"`);
    return (await source.loadFile(file)) as T;
  });
}

/** An optional file (the manifest may not list it): resolves to null when it is absent. */
async function optional<T>(name: string): Promise<T | null> {
  const m = await getManifest();
  if (!m.files[name]) return null;
  return logical<T>(name);
}

function rowsToObjects<T>(table: Table, build: (get: (col: string) => unknown) => T): T[] {
  const at = new Map(table.cols.map((c, i) => [c, i]));
  return table.rows.map((r) =>
    build((col) => {
      const i = at.get(col);
      if (i === undefined) throw new Error(`dataset column "${col}" is missing`);
      return r[i];
    }),
  );
}

export interface ExerciseIndex {
  rows: ExerciseRow[];
  bySlug: Map<string, ExerciseRow>;
}

/** The 634 library rows, sorted by slug (as compiled). */
export function getExerciseIndex(): Promise<ExerciseIndex> {
  return once('built:index', async () => {
    const table = await logical<Table>('exercises.index');
    const rows = rowsToObjects<ExerciseRow>(table, (g) => ({
      slug: g('slug') as string,
      name: g('name') as string,
      category: g('category') as string,
      subCategory: g('sub_category') as string,
      kind: g('kind') as string,
      machine: g('machine') as string,
      primary: g('primary') as string[],
      difficulty: g('difficulty') as number,
      unilateral: g('unilateral') === 1,
      beginner: g('beginner') === 1,
      tracks: g('tracks') as number,
      warmup: g('warmup') === 1,
      chunk: g('chunk') as number,
      custom: false,
    }));
    return { rows, bySlug: new Map(rows.map((r) => [r.slug, r])) };
  });
}

export function getMuscles(): Promise<MusclesFile> {
  return logical<MusclesFile>('muscles');
}

export interface MachineList {
  list: Machine[];
  bySlug: Map<string, Machine>;
}

export function getMachines(): Promise<MachineList> {
  return once('built:machines', async () => {
    const table = await logical<Table>('machines');
    const list = rowsToObjects<Machine>(table, (g) => ({
      slug: g('slug') as string,
      name: g('name') as string,
      brand: g('brand') as string,
      category: g('category') as string,
      zone: (g('zone') as string | null) ?? null,
      stepKg: (g('stepKg') as number | null) ?? null,
      quantity: g('quantity') as number,
      status: g('status') as string,
      cues: g('cues') as string[],
      muscles: g('muscles') as string[],
      detailed: g('detailed') as string[],
    }));
    return { list, bySlug: new Map(list.map((m) => [m.slug, m])) };
  });
}

export function getMedia(): Promise<Record<string, MediaEntry[]>> {
  return logical('media');
}

export function getMuscleMap(): Promise<Record<string, MapRow[]>> {
  return logical('muscle_map');
}

export function getVariationShift(): Promise<Record<string, Record<string, Array<[string, string]>>>> {
  return logical('variation_shift');
}

export function getSubstitutions(): Promise<Record<string, string[]>> {
  return logical('substitutions');
}

export function getSupersets(): Promise<Superset[]> {
  return logical('supersets');
}

/** Phase 10 files. Raw shapes are in API_CONTRACTS.md; nothing in Phase 11 reads them yet, so they stay `unknown`. */
export function getSetupOptions(): Promise<unknown | null> {
  return optional('setup_options');
}
/** Phase 47 file: strength ladders, exercise map and tier table. Narrowed by `parseBadgeData` in `src/shared/badges/ladders.ts`. */
export function getBadges(): Promise<unknown | null> {
  return optional('badges');
}
/** Phase 25 file: movement patterns + per-exercise map. Narrowed by `parseMovementData` in `src/shared/movement.ts`. */
export function getMovement(): Promise<unknown | null> {
  return optional('movement');
}
export function getMachineReach(): Promise<unknown | null> {
  return optional('machine_reach');
}
/** Optional input of search (aliases and setup words). Phase 20 uses it; Phase 11 search does not. */
export function getSearchIndex(): Promise<unknown | null> {
  return optional('search.index');
}

// ---------- detail chunks ----------

/** One detail chunk, fetched once. */
export function getDetailChunk(n: number): Promise<Record<string, ExerciseDetail>> {
  return once(`detail:${n}`, async () => {
    const m = await getManifest();
    const entry = m.detailChunks.find((c) => c.n === n);
    if (!entry) throw new Error(`dataset has no detail chunk ${n}`);
    return (await source.loadFile(entry.file)) as Record<string, ExerciseDetail>;
  });
}

/** The detail of one dataset exercise, or undefined when the slug is unknown. Loads only that exercise's chunk. */
export async function getDetail(slug: string): Promise<ExerciseDetail | undefined> {
  const { bySlug } = await getExerciseIndex();
  const row = bySlug.get(slug);
  if (!row) return undefined;
  const chunk = await getDetailChunk(row.chunk);
  return chunk[slug];
}

/**
 * Idle warm (A43): load every detail chunk once so exercise pages work offline for people who never opened them.
 * Nothing calls this yet; the caller (a later phase) decides "online and idle". Chunks load one after another.
 */
export async function warmDetailChunks(): Promise<number> {
  const m = await getManifest();
  let done = 0;
  for (const c of m.detailChunks) {
    await getDetailChunk(c.n);
    done += 1;
  }
  return done;
}

// ---------- machine photos ----------

export interface ImageUrl {
  url: string;
  variant: 'thumb' | 'detail';
  primary: boolean;
  w: number;
  h: number;
  alt: string;
}

function baseUrl(): string {
  const b = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return b.endsWith('/') ? b : `${b}/`;
}

/** Photo urls of a machine, in manifest order (primary pair first as compiled). Empty for an unknown machine. */
export async function imageUrls(machineSlug: string): Promise<ImageUrl[]> {
  const media = await getMedia();
  const list = media[machineSlug] ?? [];
  return list.map((e) => ({
    url: `${baseUrl()}machines/${machineSlug}/${e.file}`,
    variant: e.variant,
    primary: e.primary,
    w: e.w,
    h: e.h,
    alt: e.alt,
  }));
}

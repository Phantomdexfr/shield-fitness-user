// Chunk engine (Phase 75), pure: no DOM, no network, no clock, no randomness. Time is always a parameter.
// Source of truth: contract/engines.md section 27 (chunk backup) and docs/SYNC_SPEC.md PHASE 74 SPEC (B3-B7).
// WebCrypto (`crypto.subtle`) and `CompressionStream` are used as globals, like src/shared/planShare.
// A chunk is an ADDITIONAL copy of the member's data; this file never talks to a server (Phase 76+).

import { istDayKey } from './dates';

export const CHUNK_APP = 'shield-fitness';
/** The chunk schema this app writes and understands (27.5, S7). */
export const CHUNK_SCHEMA = 1;
/** Stored object hard limit (27.4, SFE703) and the soft target ([A-R1]). */
export const MAX_STORED_BYTES = 512 * 1024;
export const TARGET_STORED_BYTES = 200 * 1024;
/** Guard against a zip bomb: no chunk inflates beyond this many bytes of canonical JSON. */
export const MAX_INFLATED_BYTES = 8 * 1024 * 1024;
/** S1: never push fewer than this share of the base row count (exactly 70 % is allowed). */
export const S1_RATIO = 0.7;

export type ChunkRejectReason =
  | 'empty'
  | 'html'
  | 'unknown_marker'
  | 'hash_mismatch'
  | 'bad_gzip'
  | 'bad_json'
  | 'bad_header'
  | 'key_mismatch'
  | 'rows_mismatch'
  | 'too_new'
  | 'too_large';

export class ChunkError extends Error {
  constructor(
    public readonly code: 'bad_value' | 'ambiguous_id' | 'too_big' | 'bad_key' | 'schema_mismatch' | 'bad_table',
    message: string,
  ) {
    super(message);
    this.name = 'ChunkError';
  }
}

// ---------------------------------------------------------------- tables, columns, keys (27.1, 27.2)

/** Order of the tables inside one chunk is alphabetical in the bytes; this list is only the set of known tables. */
export const CHUNK_TABLES = [
  'workout_sessions',
  'workout_sets',
  'cardio_logs',
  'body_stats',
  'intake_logs',
  'routines',
  'custom_exercises',
  'goals',
  'injury_marks',
  'exercise_prefs',
] as const;
export type ChunkTable = (typeof CHUNK_TABLES)[number];

/**
 * [A-P75.1] Column order per table. `workout_sessions` and `workout_sets` follow fixtures/chunks_03 plus one extra
 * `extra` column before `u` (local-only fields, so a restore loses nothing); the other tables carry the local row in one
 * jsonb column `d` because the Admin DATA_MODEL F2 is not in this zip. Never `id`, `member_id`, `created_at`, `updated_at`.
 */
export const CHUNK_COLUMNS: Record<ChunkTable, readonly string[]> = {
  workout_sessions: ['client_id', 'started_at', 'ended_at', 'status', 'program_id', 'day_id', 'routine_id', 'note', 'extra', 'u', 'deleted_at'],
  workout_sets: ['client_id', 'session_id', 'exercise_ref', 'exercise_name', 'set_no', 'weight_kg', 'reps', 'extra', 'u', 'deleted_at'],
  cardio_logs: ['client_id', 'session_id', 'exercise_ref', 'done_at', 'distance_m', 'extra', 'u', 'deleted_at'],
  body_stats: ['client_id', 'measured_on', 'd', 'u', 'deleted_at'],
  intake_logs: ['client_id', 'logged_at', 'd', 'u', 'deleted_at'],
  routines: ['client_id', 'd', 'u', 'deleted_at'],
  custom_exercises: ['client_id', 'd', 'u', 'deleted_at'],
  goals: ['client_id', 'status', 'd', 'u', 'deleted_at'],
  injury_marks: ['muscle_id', 'd', 'u', 'deleted_at'],
  exercise_prefs: ['slug', 'd', 'u', 'deleted_at'],
};

/** Merge / sort key: `client_id`, except the two natural-key tables (27.2). */
export const TABLE_KEY: Partial<Record<ChunkTable, string>> = { injury_marks: 'muscle_id', exercise_prefs: 'slug' };
export const keyColumn = (table: string): string => TABLE_KEY[table as ChunkTable] ?? 'client_id';

const ID_COLUMNS: ReadonlySet<string> = new Set(['client_id', 'session_id', 'program_id', 'day_id', 'routine_id']);
const TIME_COLUMNS: ReadonlySet<string> = new Set(['started_at', 'ended_at', 'done_at', 'logged_at', 'deleted_at']);
const JSON_COLUMNS: ReadonlySet<string> = new Set(['extra', 'd']);

export const SESSION_TABLES: ReadonlySet<string> = new Set(['workout_sessions', 'workout_sets', 'cardio_logs']);
export const BODY_TABLES: ReadonlySet<string> = new Set(['body_stats', 'intake_logs']);

export type ChunkKind = 'sessions' | 'body' | 'small';
const KEY_RE = /^(sessions|body):(\d{4})-(0[1-9]|1[0-2])$/;

export function parseChunkKey(key: string): { kind: ChunkKind; month: string | null } | null {
  if (key === 'small') return { kind: 'small', month: null };
  const m = KEY_RE.exec(key);
  return m ? { kind: m[1] as ChunkKind, month: `${m[2]}-${m[3]}` } : null;
}

/** The tables a chunk key may hold. */
export function tablesOfKey(key: string): readonly ChunkTable[] {
  const p = parseChunkKey(key);
  if (!p) throw new ChunkError('bad_key', `bad chunk key: ${key}`);
  if (p.kind === 'sessions') return ['workout_sessions', 'workout_sets', 'cardio_logs'];
  if (p.kind === 'body') return ['body_stats', 'intake_logs'];
  return ['routines', 'custom_exercises', 'goals', 'injury_marks', 'exercise_prefs'];
}

/** IST calendar month of an instant given in epoch SECONDS ("YYYY-MM"). 2026-11-30T18:30Z is already 2026-12 (27.1). */
export function istMonth(epochSeconds: number): string {
  return istDayKey(epochSeconds * 1000).slice(0, 7);
}

export interface KeyContext {
  /** session `client_id` (wire form) -> chunk key, so a set goes with its session. */
  sessionKeys?: ReadonlyMap<string, string>;
}

/**
 * Chunk key of one WIRE row (27.1): a set goes with its session; a cardio row with no known session uses `done_at`.
 * Returns null when the row cannot be placed (a set whose session is unknown, or a missing date).
 */
export function chunkKeyFor(table: ChunkTable, row: Record<string, unknown>, ctx: KeyContext = {}): string | null {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (table) {
    case 'workout_sessions': {
      const t = num(row.started_at);
      return t === null ? null : `sessions:${istMonth(t)}`;
    }
    case 'workout_sets':
      return typeof row.session_id === 'string' ? (ctx.sessionKeys?.get(row.session_id) ?? null) : null;
    case 'cardio_logs': {
      if (typeof row.session_id === 'string') {
        const k = ctx.sessionKeys?.get(row.session_id);
        if (k) return k;
      }
      const t = num(row.done_at);
      return t === null ? null : `sessions:${istMonth(t)}`;
    }
    case 'body_stats':
      return typeof row.measured_on === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.measured_on) ? `body:${row.measured_on.slice(0, 7)}` : null;
    case 'intake_logs': {
      const t = num(row.logged_at);
      return t === null ? null : `body:${istMonth(t)}`;
    }
    default:
      return 'small';
  }
}

// ---------------------------------------------------------------- ids and wire values (27.3)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID22_RE = /^[A-Za-z0-9_-]{22}$/;

/** uuid -> 22 characters: base64url of the 16 bytes, no padding. */
export function uuidToId22(uuid: string): string {
  if (!UUID_RE.test(uuid)) throw new ChunkError('bad_value', `not a uuid: ${uuid}`);
  const hex = uuid.replace(/-/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < 32; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  let out = '';
  for (let i = 0; i < 15; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const last = bytes[15]!; // 16th byte: 2 chars (8 bits -> 12 bits with 4 zero bits)
  out += B64[(last >> 2) & 63]! + B64[(last << 4) & 63]!;
  return out;
}

/** The exact reverse of `uuidToId22` (lower-case hex). */
export function id22ToUuid(id: string): string {
  if (!ID22_RE.test(id)) throw new ChunkError('bad_value', `not an id22: ${id}`);
  const v = (c: string): number => B64.indexOf(c);
  const bytes: number[] = [];
  for (let i = 0; i < 20; i += 4) {
    const n = (v(id[i]!) << 18) | (v(id[i + 1]!) << 12) | (v(id[i + 2]!) << 6) | v(id[i + 3]!);
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  bytes.push(((v(id[20]!) << 2) | (v(id[21]!) >> 4)) & 255);
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Plain JSON-safe copy with object keys sorted, so equal content gives equal bytes on every device. */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) o[k] = sortKeys(x);
    }
    return o;
  }
  return v;
}

const toSeconds = (v: unknown, col: string): number | null => {
  if (v === null || v === undefined) return null;
  let ms: number;
  if (typeof v === 'number') ms = v;
  else if (typeof v === 'string') ms = Date.parse(v);
  else throw new ChunkError('bad_value', `${col}: not a time`);
  if (!Number.isFinite(ms)) throw new ChunkError('bad_value', `${col}: not a time`);
  return Math.floor(ms / 1000);
};

/**
 * One row as the chunk writes it: columns in `CHUNK_COLUMNS` order, uuids as id22, times as epoch seconds, booleans as
 * 0/1, jsonb with sorted keys, missing = null. Input times may be epoch ms or ISO text; a column not in the list is
 * dropped. A non-uuid id that looks like an id22 is refused (it would be read back as a uuid).
 */
export function toWireRow(table: ChunkTable, row: Record<string, unknown>): Record<string, unknown> {
  const cols = CHUNK_COLUMNS[table];
  if (!cols) throw new ChunkError('bad_table', `unknown table: ${table}`);
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    let v = row[c];
    if (v === undefined) v = null;
    if (v !== null) {
      if (ID_COLUMNS.has(c)) {
        if (typeof v !== 'string') throw new ChunkError('bad_value', `${c}: not a string`);
        if (UUID_RE.test(v)) v = uuidToId22(v);
        else if (ID22_RE.test(v)) throw new ChunkError('ambiguous_id', `${c}: ${v} would read back as a uuid`);
      } else if (TIME_COLUMNS.has(c)) v = toSeconds(v, c);
      else if (JSON_COLUMNS.has(c)) v = sortKeys(v);
      else if (typeof v === 'boolean') v = v ? 1 : 0;
    }
    out[c] = v;
  }
  return out;
}

/** The reverse for the columns this app knows: id22 -> uuid, epoch seconds -> ms. Unknown columns pass through. */
export function fromWireRow(table: ChunkTable, row: Record<string, unknown>): Record<string, unknown> {
  void table;
  const out: Record<string, unknown> = {};
  for (const [c, v0] of Object.entries(row)) {
    let v = v0;
    if (typeof v === 'string' && ID_COLUMNS.has(c) && ID22_RE.test(v)) v = id22ToUuid(v);
    else if (TIME_COLUMNS.has(c) && typeof v === 'number') v = v * 1000;
    out[c] = v;
  }
  return out;
}

// ---------------------------------------------------------------- chunk shape and canonical bytes (27.2, 27.3)

export interface ChunkTableData {
  /** Column names. */
  c: string[];
  /** Rows, values in column order. */
  r: unknown[][];
}
export interface Chunk {
  app: string;
  schema: number;
  key: string;
  rows: number;
  made_at: number;
  t: Record<string, ChunkTableData>;
}

export function countRows(t: Record<string, ChunkTableData>): number {
  let n = 0;
  for (const d of Object.values(t)) n += d.r.length;
  return n;
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

/** Byte-wise compare of two strings as UTF-8 (the tie rule of 27.6 and the row order of 27.2). */
export function compareBytes(a: string, b: string): number {
  // Fast path: up to the first differing UTF-16 unit, two non-surrogate units order the same as their UTF-8 bytes.
  const n0 = Math.min(a.length, b.length);
  for (let i = 0; i < n0; i++) {
    const p = a.charCodeAt(i);
    const q = b.charCodeAt(i);
    if (p === q) continue;
    if ((p < 0xd800 || p > 0xdfff) && (q < 0xd800 || q > 0xdfff)) return p < q ? -1 : 1;
    break;
  }
  const x = enc.encode(a);
  const y = enc.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

function cell(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new ChunkError('bad_value', 'number is not finite');
    const s = JSON.stringify(v);
    if (/e/i.test(s)) throw new ChunkError('bad_value', 'number needs an exponent');
    return s;
  }
  return JSON.stringify(v);
}

/** Canonical JSON (27.3): UTF-8, no whitespace, keys `app, schema, key, rows, made_at, t`, tables alphabetical, `c` then `r`. */
export function canonicalJson(chunk: Chunk): string {
  const names = Object.keys(chunk.t).sort();
  const tables = names
    .map((n) => {
      const d = chunk.t[n]!;
      return `${JSON.stringify(n)}:{"c":${JSON.stringify(d.c)},"r":[${d.r.map((row) => `[${row.map(cell).join(',')}]`).join(',')}]}`;
    })
    .join(',');
  return `{"app":${JSON.stringify(chunk.app)},"schema":${cell(chunk.schema)},"key":${JSON.stringify(chunk.key)},"rows":${cell(chunk.rows)},"made_at":${cell(chunk.made_at)},"t":{${tables}}}`;
}

/**
 * [A-P75.2] `made_at` is part of the bytes, so it must be a pure function of the content or two devices with the same data
 * would never share a fingerprint: the newest `u` (ms) of any row, in seconds, 0 when empty. The contract leaves `made_at`
 * free; the fixtures set their own value, so tests pass it explicitly.
 */
export function madeAtOf(t: Record<string, ChunkTableData>): number {
  let max = 0;
  for (const d of Object.values(t)) {
    const i = d.c.indexOf('u');
    if (i < 0) continue;
    for (const row of d.r) {
      const u = row[i];
      if (typeof u === 'number' && u > max) max = u;
    }
  }
  return Math.floor(max / 1000);
}

/** Turn wire rows (objects) for one table into `{c, r}` with the table's column order, sorted by key (27.2). */
export function tableData(table: ChunkTable, rows: readonly Record<string, unknown>[]): ChunkTableData {
  const c = [...CHUNK_COLUMNS[table]];
  const k = keyColumn(table);
  const sorted = [...rows].sort((a, b) => compareBytes(String(a[k]), String(b[k])));
  return { c, r: sorted.map((row) => c.map((col) => (row[col] === undefined ? null : row[col]))) };
}

/** Build one chunk from wire rows of ITS tables. A table with no rows is left out. */
export function makeChunk(key: string, rowsByTable: Partial<Record<ChunkTable, readonly Record<string, unknown>[]>>, madeAt?: number): Chunk {
  const allowed = new Set<string>(tablesOfKey(key));
  const t: Record<string, ChunkTableData> = {};
  for (const name of CHUNK_TABLES) {
    const rows = rowsByTable[name];
    if (!rows || rows.length === 0) continue;
    if (!allowed.has(name)) throw new ChunkError('bad_table', `${name} does not belong in ${key}`);
    t[name] = tableData(name, rows);
  }
  return { app: CHUNK_APP, schema: CHUNK_SCHEMA, key, rows: countRows(t), made_at: madeAt ?? madeAtOf(t), t };
}

export interface GroupResult {
  chunks: Chunk[];
  /** Rows that could not be placed (a set whose session is not in the input, a missing date). Nothing is lost silently. */
  orphans: { table: ChunkTable; row: Record<string, unknown> }[];
}

/** Group wire rows of all tables into chunks by key (27.1); chunks come back sorted by key. A chunk with no rows is not made. */
export function groupIntoChunks(rowsByTable: Partial<Record<ChunkTable, readonly Record<string, unknown>[]>>): GroupResult {
  const sessionKeys = new Map<string, string>();
  for (const row of rowsByTable.workout_sessions ?? []) {
    const k = chunkKeyFor('workout_sessions', row);
    if (k && typeof row.client_id === 'string') sessionKeys.set(row.client_id, k);
  }
  const by = new Map<string, Partial<Record<ChunkTable, Record<string, unknown>[]>>>();
  const orphans: GroupResult['orphans'] = [];
  for (const table of CHUNK_TABLES) {
    for (const row of rowsByTable[table] ?? []) {
      const key = chunkKeyFor(table, row, { sessionKeys });
      if (!key) {
        orphans.push({ table, row });
        continue;
      }
      const slot = by.get(key) ?? {};
      (slot[table] ??= []).push(row);
      by.set(key, slot);
    }
  }
  const chunks = [...by.keys()].sort(compareBytes).map((k) => makeChunk(k, by.get(k)!));
  return { chunks, orphans };
}

// ---------------------------------------------------------------- bytes: gzip, sha256, marker (27.4)

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const buf = (u: Uint8Array): Uint8Array<ArrayBuffer> => u as Uint8Array<ArrayBuffer>;
const toHex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await subtle().digest('SHA-256', buf(bytes))));
}

const hasStreams = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array | null> {
  const writer = t.writable.getWriter();
  void writer.write(buf(data)).then(() => writer.close()).catch((e) => void reader.cancel(e).catch(() => undefined));
  const reader = t.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface EncodedChunk {
  /** The stored object: marker byte + payload. */
  bytes: Uint8Array;
  /** sha256 over the stored bytes INCLUDING the marker (integrity, names the object). */
  sha256: string;
  /** sha256 over the canonical JSON alone: the fingerprint used for L, B and S. */
  contentSha256: string;
  gzip: boolean;
  rows: number;
}

/** Canonical bytes -> stored object. gzip when `CompressionStream` exists (and `gzip !== false`), else the raw form. */
export async function encodeChunk(chunk: Chunk, opts: { gzip?: boolean } = {}): Promise<EncodedChunk> {
  const json = enc.encode(canonicalJson(chunk));
  const contentSha256 = await sha256Hex(json);
  let marker = 0x00;
  let payload: Uint8Array = json;
  if (opts.gzip !== false && hasStreams()) {
    const z = await pipe(json, new CompressionStream('gzip'), json.length + 1024);
    if (z) {
      marker = 0x01;
      payload = z;
    }
  }
  const bytes = new Uint8Array(payload.length + 1);
  bytes[0] = marker;
  bytes.set(payload, 1);
  if (bytes.length > MAX_STORED_BYTES) throw new ChunkError('too_big', `chunk ${chunk.key} is ${bytes.length} bytes`);
  return { bytes, sha256: await sha256Hex(bytes), contentSha256, gzip: marker === 0x01, rows: chunk.rows };
}

/** The fingerprint `L` / `B` / `S` of a chunk as this app would write it: `content_sha256`. */
export async function fingerprintOf(chunk: Chunk): Promise<string> {
  return sha256Hex(enc.encode(canonicalJson(chunk)));
}

// ---------------------------------------------------------------- read: header checks and migrate (27.5, S4, S7)

export interface DecodeExpect {
  /** The requested key. */
  key: string;
  /** `sha256` from the manifest; when given it is checked against the stored bytes (S4). */
  sha256?: string;
  /** The schema this app knows (default `CHUNK_SCHEMA`). */
  knownSchema?: number;
}
export type DecodeResult =
  | { ok: true; chunk: Chunk; contentSha256: string; migrated: boolean }
  | { ok: false; reason: ChunkRejectReason };

const fail = (reason: ChunkRejectReason): DecodeResult => ({ ok: false, reason });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Stored bytes -> chunk. A body that starts with `<` is a network error (an HTML login page), never data. Checks in
 * order: size, `<`, marker byte, sha256 against the manifest, gunzip (capped), JSON, header (`app`, `key`, `schema`,
 * `rows`), schema newer than known (S7: refuse, "update the app"), then migrates an older schema in memory.
 */
export async function decodeChunk(bytes: Uint8Array, expect: DecodeExpect): Promise<DecodeResult> {
  if (bytes.length === 0) return fail('empty');
  if (bytes.length > MAX_STORED_BYTES) return fail('too_large');
  if (bytes[0] === 0x3c) return fail('html');
  const marker = bytes[0];
  if (marker !== 0x00 && marker !== 0x01) return fail('unknown_marker');
  if (expect.sha256 !== undefined && (await sha256Hex(bytes)) !== expect.sha256) return fail('hash_mismatch');
  let json: Uint8Array;
  if (marker === 0x01) {
    if (!hasStreams()) return fail('bad_gzip');
    const z = await pipe(bytes.subarray(1), new DecompressionStream('gzip'), MAX_INFLATED_BYTES);
    if (!z) return fail('bad_gzip');
    json = z;
  } else json = bytes.subarray(1);
  if (json.length > 0 && json[0] === 0x3c) return fail('html');
  let parsed: unknown;
  try {
    parsed = JSON.parse(dec.decode(json));
  } catch {
    return fail('bad_json');
  }
  if (!isObj(parsed)) return fail('bad_json');
  if (parsed.app !== CHUNK_APP) return fail('bad_header');
  if (typeof parsed.key !== 'string') return fail('bad_header');
  if (parsed.key !== expect.key) return fail('key_mismatch');
  const schema = parsed.schema;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) return fail('bad_header');
  const known = expect.knownSchema ?? CHUNK_SCHEMA;
  if (schema > known) return fail('too_new');
  if (typeof parsed.rows !== 'number' || typeof parsed.made_at !== 'number' || !isObj(parsed.t)) return fail('bad_header');
  const t: Record<string, ChunkTableData> = {};
  for (const [name, d] of Object.entries(parsed.t)) {
    if (!isObj(d) || !Array.isArray(d.c) || !Array.isArray(d.r)) return fail('bad_header');
    if (!d.c.every((x) => typeof x === 'string')) return fail('bad_header');
    const width = d.c.length;
    if (!d.r.every((row) => Array.isArray(row) && row.length === width)) return fail('bad_header');
    t[name] = { c: d.c as string[], r: d.r as unknown[][] };
  }
  if (countRows(t) !== parsed.rows) return fail('rows_mismatch');
  const chunk: Chunk = { app: CHUNK_APP, schema, key: parsed.key, rows: parsed.rows, made_at: parsed.made_at, t };
  const migrated = schema < known;
  return { ok: true, chunk: migrated ? migrateChunk(chunk, known) : chunk, contentSha256: await sha256Hex(json), migrated };
}

/** One step per schema version, `MIGRATIONS[n]` turns schema n into n + 1. Empty today (only schema 1 exists). */
export const MIGRATIONS: Record<number, (c: Chunk) => Chunk> = {};

/** Older schema -> the app's schema, in memory only. Unknown tables and columns are kept (lossless). */
export function migrateChunk(chunk: Chunk, known: number = CHUNK_SCHEMA): Chunk {
  if (chunk.schema > known) throw new ChunkError('schema_mismatch', 'schema is newer than this app');
  let c = chunk;
  while (c.schema < known) {
    const step = MIGRATIONS[c.schema];
    if (!step) throw new ChunkError('schema_mismatch', `no migration from schema ${c.schema}`);
    c = { ...step(c), schema: c.schema + 1 };
  }
  return c;
}

// ---------------------------------------------------------------- merge (27.6)

export type MergeRow = Record<string, unknown>;
export interface MergeOptions {
  /** Row key: `client_id` by default; `muscle_id` / `slug` for the natural-key tables. */
  key?: string;
  /** Column holding the deletion time (default `deleted_at`). */
  deleted?: string;
  /** Is this row in a final state (27.6 rule 2)? */
  isFinal?: (row: MergeRow) => boolean;
  /** Column holding the device change time in ms (default `u`). */
  u?: string;
}

/** Final states: a session `done` with `ended_at`; a goal `done` or `dropped`. */
export function isFinalRow(table: string, row: MergeRow): boolean {
  if (table === 'workout_sessions') return row.status === 'done' && row.ended_at != null;
  if (table === 'goals') return row.status === 'done' || row.status === 'dropped';
  return false;
}

/**
 * Pick ONE whole row for a key present on both sides (never mixes columns): 1) a deleted row beats a live one;
 * 2) a final-state row beats a non-final one; 3) the larger `u`; 4) the row whose canonical JSON is larger byte-wise.
 */
export function pickRow(a: MergeRow, b: MergeRow, o: MergeOptions = {}): MergeRow {
  const del = o.deleted ?? 'deleted_at';
  const uCol = o.u ?? 'u';
  const da = a[del] != null;
  const db = b[del] != null;
  if (da !== db) return da ? a : b;
  const fa = o.isFinal ? o.isFinal(a) : false;
  const fb = o.isFinal ? o.isFinal(b) : false;
  if (fa !== fb) return fa ? a : b;
  const ua = typeof a[uCol] === 'number' ? (a[uCol] as number) : 0;
  const ub = typeof b[uCol] === 'number' ? (b[uCol] as number) : 0;
  if (ua !== ub) return ua > ub ? a : b;
  return compareBytes(JSON.stringify(a), JSON.stringify(b)) >= 0 ? a : b;
}

/** Union of both sides by key; a key on both sides goes through `pickRow`. Never removes a key. Sorted by key (byte-wise). */
export function mergeRows(local: readonly MergeRow[], remote: readonly MergeRow[], o: MergeOptions = {}): MergeRow[] {
  const key = o.key ?? 'client_id';
  const m = new Map<string, MergeRow>();
  for (const row of local) m.set(String(row[key]), row);
  for (const row of remote) {
    const k = String(row[key]);
    const have = m.get(k);
    m.set(k, have ? pickRow(have, row, o) : row);
  }
  return [...m.keys()].sort(compareBytes).map((k) => m.get(k)!);
}

/** A table's `{c, r}` as row objects, and back (columns = the given list). */
export const rowsOf = (d: ChunkTableData | undefined): MergeRow[] => (d ? d.r.map((row) => Object.fromEntries(d.c.map((col, i) => [col, row[i]]))) : []);
function dataOf(table: string, rows: readonly MergeRow[], cols: readonly string[]): ChunkTableData {
  const k = keyColumn(table);
  const sorted = [...rows].sort((a, b) => compareBytes(String(a[k]), String(b[k])));
  return { c: [...cols], r: sorted.map((row) => cols.map((c) => (row[c] === undefined ? null : row[c]))) };
}

export interface MergeResult {
  chunk: Chunk;
  /** The merged content differs from the local chunk (something must be applied here). */
  changedLocal: boolean;
  /** The merged content differs from the remote chunk (a push is needed). A merge equal to one side is not a new revision. */
  changedRemote: boolean;
}

/** Same tables, columns and rows (made_at ignored). */
export function sameContent(a: Chunk, b: Chunk): boolean {
  const na = Object.keys(a.t).sort();
  const nb = Object.keys(b.t).sort();
  if (na.length !== nb.length || na.some((n, i) => n !== nb[i])) return false;
  return na.every((n) => JSON.stringify(a.t[n]) === JSON.stringify(b.t[n]));
}

/**
 * Merge two chunks of the SAME key and schema (27.6). Columns: this app's column list first, then any column only the
 * other side has (kept, so a newer writer's extra columns survive). `made_at` is recomputed from the merged rows.
 */
export function mergeChunk(local: Chunk, remote: Chunk): MergeResult {
  if (local.key !== remote.key) throw new ChunkError('bad_key', 'chunks of different keys');
  if (local.schema !== remote.schema) throw new ChunkError('schema_mismatch', 'migrate both chunks first');
  const names = [...new Set([...Object.keys(local.t), ...Object.keys(remote.t)])].sort();
  const t: Record<string, ChunkTableData> = {};
  for (const name of names) {
    const l = local.t[name];
    const r = remote.t[name];
    const known = (CHUNK_COLUMNS as Record<string, readonly string[] | undefined>)[name] ?? [];
    const cols = [...new Set([...known, ...(l?.c ?? []), ...(r?.c ?? [])])];
    const merged = mergeRows(rowsOf(l), rowsOf(r), { key: keyColumn(name), isFinal: (row) => isFinalRow(name, row) });
    if (merged.length > 0) t[name] = dataOf(name, merged, cols);
  }
  const chunk: Chunk = { app: CHUNK_APP, schema: local.schema, key: local.key, rows: countRows(t), made_at: madeAtOf(t), t };
  return { chunk, changedLocal: !sameContent(chunk, local), changedRemote: !sameContent(chunk, remote) };
}

// ---------------------------------------------------------------- three-way decision (27.7, 27.8 S1)

export type Fingerprint = string;
/** `L` is a fingerprint, or EMPTY (zero rows) / MISSING (never written). `S` is a fingerprint or MISSING. */
export type LocalFp = Fingerprint | 'EMPTY' | 'MISSING';
export type ServerFp = Fingerprint | 'MISSING';

export type SyncAction =
  | 'NOOP'
  | 'NOOP_REPORT_BOTH_GONE'
  | 'PUSH'
  | 'PUSH_ALL'
  | 'PULL_MERGE'
  | 'MERGE_THEN_PUSH'
  | 'MERGE_NEVER_OVERWRITE'
  | 'RESTORE'
  | 'STOP_OFFER_RESTORE';

export interface PlanInput {
  L: LocalFp;
  /** Base fingerprint this device recorded at its last sync of the chunk; null / undefined = none. */
  B?: Fingerprint | null;
  S: ServerFp;
  /** Row count (tombstones included) of what would be pushed. Needed for S1. */
  rowsL?: number;
  /** Row count of the base. Needed for S1. */
  rowsB?: number;
}

/** S1: fewer than 70 % of the base rows (strictly) must not be pushed. Exactly 70 % is allowed. No base = not subject. */
export function s1Blocks(rowsToPush: number | undefined, rowsB: number | undefined): boolean {
  if (rowsToPush === undefined || rowsB === undefined || rowsB <= 0) return false;
  return rowsToPush < S1_RATIO * rowsB;
}

const PUSHES: ReadonlySet<SyncAction> = new Set(['PUSH', 'PUSH_ALL', 'MERGE_THEN_PUSH', 'MERGE_NEVER_OVERWRITE']);

/** The decision for one chunk, in the order of 27.7, with S1 applied last to every outcome that ends in a push. */
export function planSync(i: PlanInput): SyncAction {
  const { L, S } = i;
  const B = i.B ?? null;
  const lEmpty = L === 'EMPTY' || L === 'MISSING';
  const lData = !lEmpty;
  const sData = S !== 'MISSING';
  let a: SyncAction;
  if (lData && sData && L === S) a = 'NOOP';
  else if (lEmpty && sData) a = 'RESTORE';
  else if (!sData && lData) a = 'PUSH_ALL';
  else if (!sData && lEmpty) a = B !== null ? 'NOOP_REPORT_BOTH_GONE' : 'NOOP';
  else if (B === null) a = 'MERGE_NEVER_OVERWRITE';
  else {
    const localChanged = L !== B;
    const serverChanged = S !== B;
    a = localChanged && !serverChanged ? 'PUSH' : !localChanged && serverChanged ? 'PULL_MERGE' : 'MERGE_THEN_PUSH';
  }
  if (PUSHES.has(a) && s1Blocks(i.rowsL, i.rowsB)) return 'STOP_OFFER_RESTORE';
  return a;
}

/** Restore order (B7): newest month first (sessions and body together), then `small`, then older months. */
export function restoreOrder(keys: readonly string[]): string[] {
  const dated = keys.filter((k) => parseChunkKey(k)?.month);
  const newest = dated.map((k) => parseChunkKey(k)!.month!).sort().pop() ?? null;
  const first = newest ? dated.filter((k) => parseChunkKey(k)!.month === newest) : [];
  const older = dated.filter((k) => !first.includes(k));
  const byMonthDesc = (a: string, b: string): number => {
    const ma = parseChunkKey(a)!.month!;
    const mb = parseChunkKey(b)!.month!;
    return ma === mb ? compareBytes(a, b) : ma < mb ? 1 : -1;
  };
  const small = keys.filter((k) => k === 'small');
  return [...first.sort(byMonthDesc), ...small, ...older.sort(byMonthDesc)];
}

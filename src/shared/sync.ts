// Sync rules (Phase 67), pure: no DOM, no fetch, no clock (time and randomness are parameters).
// Source: contract/connected-api.md "Sync rules" and docs/SYNC_SPEC.md. The network side lives in src/data/gym/*.

import type { EntityStore, OutboxOp, Row } from '../data/local/types';

/** Server tables the member pushes to (train shard), parents before children (rule 3). */
export const PUSH_ORDER = [
  'workout_sessions',
  'workout_sets',
  'cardio_logs',
  'personal_records',
  'xp_events',
  'body_stats',
  'goals',
  'intake_logs',
  'routines',
  'custom_exercises',
  'injury_marks',
  'exercise_prefs',
] as const;
export type PushTable = (typeof PUSH_ORDER)[number];

export const BATCH_MAX = 50;
export const BACKOFF_CAP_MS = 15 * 60_000;
export const PULL_LIMIT = 500;
export const FOREGROUND_DEBOUNCE_MS = 30_000;

/** How a table is written: append-only ignores duplicates, member-owned merges, natural-key tables merge on their key. */
export type PushMode = 'ignore' | 'merge';
export interface TableRule {
  mode: PushMode;
  onConflict: string;
}
export const TABLE_RULES: Record<PushTable, TableRule> = {
  workout_sessions: { mode: 'merge', onConflict: 'client_id' },
  workout_sets: { mode: 'ignore', onConflict: 'client_id' },
  cardio_logs: { mode: 'ignore', onConflict: 'client_id' },
  personal_records: { mode: 'ignore', onConflict: 'client_id' },
  xp_events: { mode: 'ignore', onConflict: 'client_id' },
  body_stats: { mode: 'merge', onConflict: 'client_id' },
  goals: { mode: 'merge', onConflict: 'client_id' },
  intake_logs: { mode: 'ignore', onConflict: 'client_id' },
  routines: { mode: 'merge', onConflict: 'client_id' },
  custom_exercises: { mode: 'merge', onConflict: 'client_id' },
  injury_marks: { mode: 'merge', onConflict: 'member_id,muscle_id' },
  exercise_prefs: { mode: 'merge', onConflict: 'member_id,slug' },
};

/** One request to the server, made from one outbox row. */
export interface ServerOp {
  table: PushTable;
  /** `upsert` writes `body`; `soft-delete` patches `deleted_at` by `client_id`. */
  kind: 'upsert' | 'soft-delete';
  body: Record<string, unknown>;
  clientId: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();

const LOCAL_TO_SERVER: Partial<Record<EntityStore, PushTable>> = {
  routines: 'routines',
  customExercises: 'custom_exercises',
  marks: 'injury_marks',
  favourites: 'exercise_prefs',
  bodyStats: 'body_stats',
  goals: 'goals',
  intake: 'intake_logs',
};

/** The local `{kind:'lib',slug}` / `{kind:'custom',id}` reference as the server's `exercise_ref`. */
export function exerciseRef(ref: unknown): string | null {
  const r = ref as { kind?: string; slug?: string; id?: string } | null;
  if (!r) return null;
  if (r.kind === 'lib' && r.slug) return r.slug;
  if (r.kind === 'custom' && r.id) return r.id;
  return null;
}

/**
 * [A-P67.1] Column names are NOT in this zip (the Admin DATA_MODEL owns them). This is the one place that decides them,
 * kept small so a mismatch is a one-file fix: the local fields go through unchanged except that `updated_at` is dropped
 * (the server's trigger owns it), `deleted_at` becomes an ISO string, and exercise references become `exercise_ref`.
 * `member_id` is not sent: the server fills it from the signed-in user (RLS).
 */
function baseBody(row: Row): Record<string, unknown> {
  const { updated_at: _u, deleted_at, ...rest } = row;
  void _u;
  return { ...rest, ...(deleted_at != null ? { deleted_at: iso(deleted_at as number) } : {}) };
}

/** What one outbox row asks of the server, in push order. Rows with no server table (prefs, photos) give nothing. */
export function toServerOps(table: EntityStore, op: OutboxOp, row: Row): ServerOp[] {
  if (table === 'routines' && row.followed === true) return []; // Phase 69: a followed gym program is a read-only mirror, never uploaded
  if (table === 'sessions') return sessionOps(op, row);
  const server = LOCAL_TO_SERVER[table];
  if (!server) return [];
  if (op === 'remove' || row.deleted_at != null) {
    if (server === 'injury_marks' || server === 'exercise_prefs') return [{ table: server, kind: 'upsert', body: baseBody({ ...row, deleted_at: row.deleted_at ?? row.updated_at }), clientId: row.client_id }];
    return [{ table: server, kind: 'soft-delete', body: { deleted_at: iso((row.deleted_at as number | null) ?? row.updated_at) }, clientId: row.client_id }];
  }
  return [{ table: server, kind: 'upsert', body: baseBody(row), clientId: row.client_id }];
}

interface SetLike {
  distanceM?: number;
  [k: string]: unknown;
}
interface ItemLike {
  ref?: unknown;
  order?: number;
  sets?: SetLike[];
  [k: string]: unknown;
}

/** A session row becomes `workout_sessions` plus one `workout_sets` / `cardio_logs` row per set; child ids are derived, so a replay never duplicates. */
function sessionOps(op: OutboxOp, row: Row): ServerOp[] {
  const items = (row.items as ItemLike[] | undefined) ?? [];
  const { items: _i, ...head } = row as Row & { items?: unknown };
  void _i;
  if (op === 'remove' || row.deleted_at != null) {
    return [{ table: 'workout_sessions', kind: 'soft-delete', body: { deleted_at: iso((row.deleted_at as number | null) ?? row.updated_at) }, clientId: row.client_id }];
  }
  const ops: ServerOp[] = [{ table: 'workout_sessions', kind: 'upsert', body: baseBody(head as Row), clientId: row.client_id }];
  items.forEach((it, ii) => {
    const ref = exerciseRef(it.ref);
    (it.sets ?? []).forEach((s, si) => {
      const cid = `${row.client_id}:${it.order ?? ii}:${si}`;
      const cardio = s.distanceM != null;
      ops.push({
        table: cardio ? 'cardio_logs' : 'workout_sets',
        kind: 'upsert',
        body: { ...s, client_id: cid, session_client_id: row.client_id, exercise_ref: ref, item_order: it.order ?? ii, set_index: si },
        clientId: cid,
      });
    });
  });
  return ops;
}

/** Stable sort by push order (parents first); ties keep the order they arrived in. */
export function sortForPush<T extends { table: PushTable }>(ops: readonly T[]): T[] {
  const rank = new Map<string, number>(PUSH_ORDER.map((t, i) => [t, i]));
  return ops.map((o, i) => ({ o, i })).sort((a, b) => (rank.get(a.o.table)! - rank.get(b.o.table)!) || a.i - b.i).map((x) => x.o);
}

/** Group consecutive ops of one table and kind into batches of at most `max` (SYNC rule 3). Soft-deletes go one per request. */
export function batchOps<T extends { table: PushTable; kind: ServerOp['kind'] }>(ops: readonly T[], max = BATCH_MAX): T[][] {
  const out: T[][] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && op.kind === 'upsert' && last[0]!.table === op.table && last[0]!.kind === 'upsert' && last.length < max) last.push(op);
    else out.push([op]);
  }
  return out;
}

/** Retry delay: min(2^attempts x 5 s, 15 min) plus jitter (`rand` in [0,1), up to 20% of the delay). */
export function retryDelayMs(attempts: number, rand: number): number {
  const base = Math.min(2 ** attempts * 5_000, BACKOFF_CAP_MS);
  return Math.round(base + base * 0.2 * rand);
}

export interface RemoteError {
  status?: number;
  /** Postgres code such as `23503`, or a `SFE###` code. */
  code?: string;
  message?: string;
  offline?: boolean;
  retry_after?: number;
}
export type ErrorClass = 'retry' | 'auth' | 'failed';

/** Rule 4: network / 5xx / 429 / foreign key -> retry; 401 -> auth (refresh once, then pause); anything else -> failed, kept visible. */
export function classifyError(e: RemoteError): ErrorClass {
  if (e.offline) return 'retry';
  if (e.code === '23503') return 'retry';
  const s = e.status ?? 0;
  if (s === 401) return 'auth';
  if (s === 429 || s >= 500 || s === 0) return 'retry';
  return 'failed';
}

/** A plain reason for a failed item (the screen shows it as text, never the raw server message). */
export function failureReason(e: RemoteError): string {
  if (e.code === '42501' || e.status === 403) return 'Your gym did not accept this change.';
  if (e.code === '23505') return 'This was already saved on the server in a different form.';
  if (e.status === 400 || e.status === 422 || e.code?.startsWith('22') || e.code?.startsWith('23')) return 'The server did not accept this change.';
  return 'The server could not save this change.';
}

// ---------- delta pull ----------

export interface Cursor {
  /** The server's `updated_at` string, kept exactly as received. */
  u: string;
  /** The tie-breaker value (`id`, `member_id`, `slug` or `key`). */
  t: string;
}
export const TIE_COLUMN: Record<string, string> = { member_stats: 'member_id', custom_exercises_approved: 'slug', gym_settings: 'key' };

/** The PostgREST `or` filter for rule 5; null for the first pull. */
export function pullFilter(table: string, c: Cursor | null): string | null {
  if (!c) return null;
  const tie = TIE_COLUMN[table] ?? 'id';
  return `(updated_at.gt.${c.u},and(updated_at.eq.${c.u},${tie}.gt.${c.t}))`;
}
export const pullOrder = (table: string): string[] => ['updated_at', TIE_COLUMN[table] ?? 'id'];

/** The cursor after a page: the last row's own values. */
export function nextCursor(table: string, rows: readonly Record<string, unknown>[], prev: Cursor | null): Cursor | null {
  const last = rows[rows.length - 1];
  if (!last) return prev;
  return { u: String(last.updated_at), t: String(last[TIE_COLUMN[table] ?? 'id']) };
}
export const pageIsLast = (rows: readonly unknown[], limit = PULL_LIMIT): boolean => rows.length < limit;

// ---------- chip ----------

export type ChipState =
  | { kind: 'idle'; lastSyncedAt: number | null }
  | { kind: 'syncing' }
  | { kind: 'offline'; waiting: number }
  | { kind: 'attention'; reason: 'signin' | 'failed' | 'version' | 'backup_blocked' | 'backup_update'; failed: number }
  | { kind: 'backing_up' };

export interface ChipInput {
  connected: boolean;
  running: boolean;
  online: boolean;
  waiting: number;
  failed: number;
  authPaused: boolean;
  versionMismatch: boolean;
  lastSyncedAt: number | null;
  /** Phase 76-b2: the backup runtime's input; absent = no backup state (older callers). */
  backup?: { saving: boolean; blocked: boolean; newer: boolean };
}
/** Never shown standalone (returns null). Needs-attention beats everything; then syncing; then offline; else idle. */
export function chipState(i: ChipInput): ChipState | null {
  if (!i.connected) return null;
  if (i.versionMismatch) return { kind: 'attention', reason: 'version', failed: i.failed };
  if (i.authPaused) return { kind: 'attention', reason: 'signin', failed: i.failed };
  if (i.failed > 0) return { kind: 'attention', reason: 'failed', failed: i.failed };
  if (i.backup?.newer) return { kind: 'attention', reason: 'backup_update', failed: 0 };
  if (i.backup?.blocked) return { kind: 'attention', reason: 'backup_blocked', failed: 0 };
  if (i.running) return { kind: 'syncing' };
  if (i.backup?.saving) return { kind: 'backing_up' };
  if (!i.online) return { kind: 'offline', waiting: i.waiting };
  return { kind: 'idle', lastSyncedAt: i.lastSyncedAt };
}

// ---------- login helpers ----------

/** Sentence keys for credential-function codes (docs/GYM_CONNECTION.md section 2). Unknown codes: the server message, else the fallback. */
export const FUNCTION_CODE_KEYS: Record<string, string> = {
  SFE101: 'gy.err.login',
  SFE004: 'gy.err.rate',
  SFE006: 'gy.err.origin',
  SFE102: 'gy.err.pw.current',
  SFE103: 'gy.err.pw.weak',
  SFE104: 'gy.err.pw.same',
  SFE105: 'gy.err.locked',
  SFE402: 'gy.err.pw.undone',
  OFFLINE: 'gy.err.offline',
  ASLEEP: 'gy.err.asleep',
};

/** Password rule shown in words on the change screen: 10-72 characters, a letter and a number. The server is the judge; this only saves a round trip. */
export function passwordProblem(pw: string, code: string, phone: string): 'weak' | 'same' | null {
  if (pw.length < 10 || pw.length > 72 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'weak';
  const low = pw.toLowerCase();
  const digits = (s: string) => s.replace(/\D/g, '');
  if ((code && low.includes(code.toLowerCase())) || (digits(phone).length >= 6 && digits(pw).includes(digits(phone).slice(-10)))) return 'same';
  return null;
}

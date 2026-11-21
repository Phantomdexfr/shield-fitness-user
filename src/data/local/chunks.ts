// Local chunk helpers (Phase 75): build a chunk from the IndexedDB stores, and apply a downloaded chunk in ONE transaction.
// No network, no outbox: a restore must never queue rows to push (S6), and a build only reads.
// The pure rules (keys, bytes, merge, plan) live in src/shared/chunks.ts. Mapping choices are [A-P75.1] in PHASE_STATUS.md.

import { getDb } from './db';
import type { EntityStore, Row } from './types';
import { exerciseRef } from '../../shared/sync';
import { istDayKey } from '../../shared/dates';
import {
  type Chunk,
  type ChunkTable,
  CHUNK_TABLES,
  fromWireRow,
  groupIntoChunks,
  keyColumn,
  mergeChunk,
  rowsOf,
  toWireRow,
} from '../../shared/chunks';

type Obj = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Local store -> chunk table, for the stores that ride along as one jsonb column `d`. */
const FLAT: { store: EntityStore; table: ChunkTable }[] = [
  { store: 'routines', table: 'routines' },
  { store: 'customExercises', table: 'custom_exercises' },
  { store: 'goals', table: 'goals' },
  { store: 'marks', table: 'injury_marks' },
  { store: 'favourites', table: 'exercise_prefs' },
  { store: 'bodyStats', table: 'body_stats' },
  { store: 'intake', table: 'intake_logs' },
];

export interface BuildProblem {
  table: string;
  id: string;
  message: string;
}
export interface BuildResult {
  chunks: Chunk[];
  /** Rows that could not be turned into a chunk row. Phase 76 decides what to tell the member; nothing is dropped silently. */
  problems: BuildProblem[];
}

interface ItemLike extends Obj {
  ref?: unknown;
  order?: number;
  sets?: Obj[];
}

/** One local session row -> its `workout_sessions` row plus one `workout_sets` / `cardio_logs` row per set. */
export function sessionToWire(r: Row): { head: Obj; sets: Obj[]; cardio: Obj[] } {
  const sid = r.client_id;
  const u = r.updated_at;
  const deleted = r.deleted_at ?? null;
  const { client_id: _c, updated_at: _u, deleted_at: _d, items: rawItems, startedAt, endedAt, routineId, dayId, id: _id, ...rest } = r as Obj & Row;
  void [_c, _u, _d, _id];
  const items = (Array.isArray(rawItems) ? rawItems : []) as ItemLike[];
  const extra: Obj = { ...rest };
  if (typeof startedAt === 'string') extra.startedAt = startedAt;
  if (typeof endedAt === 'string') extra.endedAt = endedAt;
  const col = (v: unknown, name: 'routineId' | 'dayId'): string | null => {
    if (typeof v !== 'string' || v === '') return null;
    if (UUID_RE.test(v)) return v;
    extra[name] = v; // not a uuid: kept inside `extra` so it can never be misread (27.3)
    return null;
  };
  const head: Obj = {
    client_id: sid,
    started_at: typeof startedAt === 'string' ? Date.parse(startedAt) : null,
    ended_at: typeof endedAt === 'string' ? Date.parse(endedAt) : null,
    status: typeof endedAt === 'string' ? 'done' : 'active',
    program_id: null,
    day_id: col(dayId, 'dayId'),
    routine_id: col(routineId, 'routineId'),
    note: null,
    extra,
    u,
    deleted_at: deleted,
  };
  const sets: Obj[] = [];
  const cardio: Obj[] = [];
  if (deleted === null) {
    extra.items = items.map(({ sets: _s, ...meta }) => meta);
    items.forEach((it, ii) => {
      const order = typeof it.order === 'number' ? it.order : ii;
      const ref = exerciseRef(it.ref);
      (it.sets ?? []).forEach((s, si) => {
        const cid = `${sid}:${order}:${si}`;
        if (s.distanceM != null) {
          const { distanceM, ...more } = s;
          cardio.push({
            client_id: cid,
            session_id: sid,
            exercise_ref: ref,
            done_at: typeof s.doneAt === 'string' ? Date.parse(s.doneAt) : null,
            distance_m: distanceM,
            extra: { ...more, o: order, i: si },
            u,
            deleted_at: null,
          });
        } else {
          const { weightKg, reps, ...more } = s;
          sets.push({
            client_id: cid,
            session_id: sid,
            exercise_ref: ref,
            exercise_name: null,
            set_no: si + 1,
            weight_kg: weightKg ?? null,
            reps: reps ?? null,
            extra: { ...more, o: order, i: si },
            u,
            deleted_at: null,
          });
        }
      });
    });
  }
  return { head, sets, cardio };
}

/** The rows of one session as they sit in a (merged) chunk, back to ONE local session row. `head` is a decoded row (objects, wire values). */
export function sessionFromWire(head: Obj, sets: readonly Obj[], cardio: readonly Obj[]): Row {
  const h = fromWireRow('workout_sessions', head);
  const extra = (h.extra ?? {}) as Obj;
  const { items: metas, startedAt, endedAt, routineId: xr, dayId: xd, ...rest } = extra as Obj & { items?: Obj[] };
  const sid = String(h.client_id);
  const iso = (ms: unknown): string | undefined => (typeof ms === 'number' ? new Date(ms).toISOString() : undefined);
  const byOrder = new Map<number, { meta: Obj | null; sets: { i: number; s: Obj }[]; ref: unknown }>();
  for (const m of (metas ?? []) as Obj[]) {
    const o = typeof m.order === 'number' ? m.order : byOrder.size;
    byOrder.set(o, { meta: m, sets: [], ref: m.ref });
  }
  const put = (w: Obj, cardioRow: boolean): void => {
    const x = fromWireRow(cardioRow ? 'cardio_logs' : 'workout_sets', w);
    const ex = (x.extra ?? {}) as Obj;
    const o = typeof ex.o === 'number' ? ex.o : 0;
    const i = typeof ex.i === 'number' ? ex.i : 0;
    const { o: _o, i: _i, ...own } = ex;
    void [_o, _i];
    const s: Obj = cardioRow ? { ...own, distanceM: x.distance_m } : { weightKg: x.weight_kg ?? null, reps: x.reps ?? null, ...own };
    const slot = byOrder.get(o) ?? { meta: null, sets: [], ref: typeof x.exercise_ref === 'string' ? { kind: 'lib', slug: x.exercise_ref } : null };
    slot.sets.push({ i, s });
    byOrder.set(o, slot);
  };
  for (const w of sets) if (w.deleted_at == null) put(w, false);
  for (const w of cardio) if (w.deleted_at == null) put(w, true);
  const items = [...byOrder.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([order, slot]) => ({ ...(slot.meta ?? { ref: slot.ref, status: 'done' }), order, sets: slot.sets.sort((a, b) => a.i - b.i).map((x) => x.s) }));
  const out: Obj = {
    ...rest,
    client_id: sid,
    id: sid,
    startedAt: typeof startedAt === 'string' ? startedAt : iso(h.started_at),
    items,
    updated_at: typeof h.u === 'number' ? h.u : 0,
    deleted_at: typeof h.deleted_at === 'number' ? h.deleted_at : null,
  };
  const end = typeof endedAt === 'string' ? endedAt : iso(h.ended_at);
  if (end) out.endedAt = end;
  const rid = h.routine_id ?? xr;
  const did = h.day_id ?? xd;
  if (typeof rid === 'string') out.routineId = rid;
  if (typeof did === 'string') out.dayId = did;
  return out as unknown as Row;
}

/** Every local row (tombstones included) as wire rows, by chunk table. Followed gym programs, prefs and photos are never in a chunk (27.1). */
export async function localWireRows(): Promise<{ rows: Partial<Record<ChunkTable, Obj[]>>; problems: BuildProblem[] }> {
  const db = await getDb();
  const rows: Partial<Record<ChunkTable, Obj[]>> = {};
  const problems: BuildProblem[] = [];
  const add = (table: ChunkTable, row: Obj, id: string): void => {
    try {
      (rows[table] ??= []).push(toWireRow(table, row));
    } catch (e) {
      problems.push({ table, id, message: e instanceof Error ? e.message : String(e) });
    }
  };
  for (const r of (await db.getAll('sessions')) as Row[]) {
    if (!Array.isArray((r as Obj).items) && r.deleted_at == null) continue; // not a session row (defensive)
    try {
      const { head, sets, cardio } = sessionToWire(r);
      add('workout_sessions', head, r.client_id);
      for (const s of sets) add('workout_sets', s, String(s.client_id));
      for (const c of cardio) add('cardio_logs', c, String(c.client_id));
    } catch (e) {
      problems.push({ table: 'workout_sessions', id: r.client_id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const { store, table } of FLAT) {
    for (const r of (await db.getAll(store)) as Row[]) {
      if (store === 'routines' && r.followed === true) continue; // a read-only mirror of a gym program
      const { updated_at, deleted_at, ...d } = r as Obj & Row;
      const w: Obj = { d, u: updated_at, deleted_at: deleted_at ?? null, client_id: r.client_id };
      if (table === 'injury_marks') w.muscle_id = typeof r.muscle === 'string' ? r.muscle : r.client_id;
      if (table === 'exercise_prefs') w.slug = typeof r.slug === 'string' ? r.slug : r.client_id;
      if (table === 'goals') w.status = r.achievedOn ? 'done' : 'active';
      if (table === 'body_stats') w.measured_on = typeof r.day === 'string' ? r.day : istDayKey(updated_at);
      if (table === 'intake_logs') w.logged_at = typeof r.at === 'number' ? r.at : updated_at;
      add(table, w, r.client_id);
    }
  }
  return { rows, problems };
}

/** All chunks this device would write now, sorted by key. */
export async function buildAllChunks(): Promise<BuildResult> {
  const { rows, problems } = await localWireRows();
  const g = groupIntoChunks(rows);
  for (const o of g.orphans) problems.push({ table: o.table, id: String(o.row.client_id ?? o.row.muscle_id ?? o.row.slug), message: 'no chunk key (missing date or session)' });
  return { chunks: g.chunks, problems };
}

/** One chunk as this device would write it now, or null when it holds no rows (a chunk with no rows is never uploaded, S1). */
export async function buildChunk(key: string): Promise<Chunk | null> {
  const { chunks } = await buildAllChunks();
  return chunks.find((c) => c.key === key) ?? null;
}

export interface ApplyResult {
  /** Local rows written (a session counts once). */
  changed: number;
  /** The merged chunk (what a push of this key should upload when the plan says merge, then push). */
  merged: Chunk;
  /** The merged content differs from the remote chunk, so a push is needed. */
  needsPush: boolean;
}

/** An already-merged remote row decoded to local row values (ms times, original ids). */
function flatToLocal(table: ChunkTable, w: Obj): Row | null {
  const x = fromWireRow(table, w);
  const d = (x.d ?? {}) as Obj;
  const cid = typeof d.client_id === 'string' ? d.client_id : typeof x.client_id === 'string' ? x.client_id : null;
  if (!cid) return null;
  return { ...d, client_id: cid, updated_at: typeof x.u === 'number' ? x.u : 0, deleted_at: typeof x.deleted_at === 'number' ? x.deleted_at : null } as Row;
}

/**
 * Merge a downloaded chunk (already verified and decoded by `decodeChunk`) into this device and write the result in ONE
 * IndexedDB transaction. Rows are merged by key (27.6): nothing local is deleted, a tombstone is never revived, a final
 * state is never reverted. Writes go straight to the stores, never to the outbox (S5, S6). Followed gym routines, prefs
 * and photos are not touched. The caller records `B` only after this resolves.
 */
export async function applyChunk(key: string, remote: Chunk): Promise<ApplyResult> {
  const db = await getDb();
  const built = await buildAllChunks();
  const local: Chunk = built.chunks.find((c) => c.key === key) ?? { ...remote, rows: 0, made_at: 0, t: {} };
  const { chunk: merged, changedLocal, changedRemote } = mergeChunk(local, remote);
  if (!changedLocal) return { changed: 0, merged, needsPush: changedRemote };

  const was = (table: string): Map<string, string> => new Map(rowsOf(local.t[table]).map((r) => [String(r[keyColumn(table)]), JSON.stringify(r)]));
  const stores: EntityStore[] = ['sessions', ...FLAT.map((f) => f.store)];
  const tx = db.transaction(stores, 'readwrite');
  let changed = 0;

  // Sessions: any changed head, set or cardio row rewrites that whole session from the merged rows.
  const heads = rowsOf(merged.t.workout_sessions);
  const sets = rowsOf(merged.t.workout_sets);
  const cardio = rowsOf(merged.t.cardio_logs);
  const touched = new Set<string>();
  for (const table of ['workout_sessions', 'workout_sets', 'cardio_logs'] as const) {
    const before = was(table);
    for (const r of rowsOf(merged.t[table])) {
      if (before.get(String(r.client_id)) !== JSON.stringify(r)) touched.add(String(table === 'workout_sessions' ? r.client_id : r.session_id));
    }
  }
  for (const h of heads) {
    if (!touched.has(String(h.client_id))) continue;
    // A session that is already deleted here and whose head did not change: keep the tombstone, do not write set rows into it.
    if (h.deleted_at != null && was('workout_sessions').get(String(h.client_id)) === JSON.stringify(h)) continue;
    const mine = (r: Obj): boolean => r.session_id === h.client_id;
    const row = sessionFromWire(h, sets.filter(mine), cardio.filter(mine));
    await tx.objectStore('sessions').put(row);
    changed += 1;
  }

  // The flat tables: write each changed row.
  for (const { store, table } of FLAT) {
    const before = was(table);
    for (const r of rowsOf(merged.t[table])) {
      if (before.get(String(r[keyColumn(table)])) === JSON.stringify(r)) continue;
      const row = flatToLocal(table, r);
      if (!row) continue;
      await tx.objectStore(store).put(row);
      changed += 1;
    }
  }
  await tx.done;
  return { changed, merged, needsPush: changedRemote };
}

export { CHUNK_TABLES };

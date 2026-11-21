// Inverse of `toServerOps` for the restore (Phase 73). Pure. [A-P73.2] Column names are the same guesses as [A-P67.1].
import type { Row } from '../data/local/types';

const ms = (v: unknown): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

/** Server table -> local store, for the tables whose local row is the server row with times as ISO text. */
export const FLAT_RESTORE: Record<string, 'routines' | 'customExercises' | 'marks' | 'favourites' | 'bodyStats' | 'goals' | 'intake'> = {
  routines: 'routines',
  custom_exercises: 'customExercises',
  injury_marks: 'marks',
  exercise_prefs: 'favourites',
  body_stats: 'bodyStats',
  goals: 'goals',
  intake_logs: 'intake',
};

/** One server row as a local row; null when it has no usable `client_id`. `member_id` is dropped, times become ms. */
export function localFromServer(row: Record<string, unknown>): Row | null {
  const id = row.client_id;
  if (typeof id !== 'string' || id === '') return null;
  const { member_id: _m, created_at: _c, updated_at, deleted_at, ...rest } = row;
  void _m;
  void _c;
  const u = ms(updated_at) ?? 0;
  const d = deleted_at == null ? null : ms(deleted_at);
  return { ...rest, client_id: id, updated_at: u, deleted_at: d } as Row;
}

interface SetRow {
  session_client_id?: unknown;
  item_order?: unknown;
  set_index?: unknown;
  exercise_ref?: unknown;
  [k: string]: unknown;
}

/** The local `ref` for a server `exercise_ref`: a known custom exercise id stays custom, anything else is a library slug. */
export function refFromServer(ref: unknown, customIds: ReadonlySet<string>): { kind: 'lib'; slug: string } | { kind: 'custom'; id: string } | null {
  if (typeof ref !== 'string' || ref === '') return null;
  return customIds.has(ref) ? { kind: 'custom', id: ref } : { kind: 'lib', slug: ref };
}

/**
 * Put one set row into a session (idempotent: the same item_order + set_index is written once). The server keeps only
 * the head and the sets, so item-level fields (plan, status, supersets) are not restored this way; every restored item
 * is `done`. A later chunk restore (Phase 75+) carries the full row.
 */
export function addSetToSession(session: Row, set: SetRow, customIds: ReadonlySet<string>): Row {
  const order = typeof set.item_order === 'number' ? set.item_order : 0;
  const idx = typeof set.set_index === 'number' ? set.set_index : 0;
  const ref = refFromServer(set.exercise_ref, customIds);
  if (!ref) return session;
  const items = [...((session.items as Record<string, unknown>[] | undefined) ?? [])];
  let at = items.findIndex((it) => it.order === order);
  if (at < 0) {
    items.push({ ref, order, status: 'done', sets: [] });
    at = items.length - 1;
  }
  const it = { ...items[at]! };
  const sets = [...((it.sets as Record<string, unknown>[] | undefined) ?? [])];
  if (sets.some((s) => s.__i === idx)) return session;
  const { session_client_id: _s, item_order: _o, set_index: _x, exercise_ref: _r, client_id: _c, member_id: _m, created_at: _k, updated_at: _u, deleted_at: _d, ...own } = set as Record<string, unknown>;
  void [_s, _o, _x, _r, _c, _m, _k, _u, _d];
  sets.push({ ...own, __i: idx });
  sets.sort((a, b) => (a.__i as number) - (b.__i as number));
  it.sets = sets;
  items[at] = it;
  items.sort((a, b) => (a.order as number) - (b.order as number));
  return { ...session, items };
}

/** Remove the helper index before the row is shown or saved. */
export function finishSession(session: Row): Row {
  const items = ((session.items as Record<string, unknown>[] | undefined) ?? []).map((it) => ({
    ...it,
    sets: ((it.sets as Record<string, unknown>[] | undefined) ?? []).map(({ __i: _i, ...s }) => s),
  }));
  void 0;
  return { ...session, items };
}

// Flexible session rules (Phase 34): contract/engines.md section 1 (Session, SessionItem), docs/FLEXIBLE_SESSION.md and
// API_CONTRACTS.md P14.8. Pure: no DOM, no storage, no clock (time and ids are parameters). No step forces another:
// any status can move to any other, items can be added, removed and reordered at any time, and a session may end with
// items still `todo`.

import type { RoutineDay, RoutineItem } from './routine';

export type SessionStatus = 'todo' | 'doing' | 'done' | 'skipped' | 'later';
export type SkipReason = 'busy' | 'pain' | 'no_time' | 'too_hard' | 'other';
export type ItemRef = RoutineItem['ref'];

export interface SetLog {
  weightKg: number | null;
  reps: number | null;
  seconds?: number;
  rpe?: number;
  tag: 'normal' | 'warmup' | 'drop' | 'superset';
  doneAt: string;
  /** Local optional fields (Phase 38, [A-P38.1]): cardio rows and the real rest taken before this set. */
  distanceM?: number;
  incline?: number;
  calories?: number;
  restSec?: number;
}

/** What the day planned for the item (extra, local field [A-P34.1]; the contract shape has no planned sets). */
export interface ItemPlan {
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}

export interface SessionItem {
  ref: ItemRef;
  variation?: string;
  setup?: Record<string, unknown>;
  status: SessionStatus;
  skipReason?: SkipReason;
  sets: SetLog[];
  order: number;
  plan?: ItemPlan;
  /** Local: superset group copied from the day. */
  supersetGroup?: string;
}

export interface Session {
  id: string;
  clientId: string;
  startedAt: string;
  endedAt?: string;
  routineId?: string;
  dayId?: string;
  /** Local: the day's name at the start, so the header still reads right if the day is renamed or deleted. */
  dayName?: string;
  /** Local (Phase 35): machine slugs marked busy for this session; their exercises are not offered as alternatives. */
  busyMachines?: string[];
  items: SessionItem[];
}

export const STALE_HOURS = 6;
export const STATUSES: readonly SessionStatus[] = ['todo', 'doing', 'done', 'skipped', 'later'];

const iso = (ms: number): string => new Date(ms).toISOString();

/** 0..n-1 in list order. */
export function renumber(items: readonly SessionItem[]): SessionItem[] {
  return items.map((it, i) => (it.order === i ? it : { ...it, order: i }));
}

const sorted = (items: readonly SessionItem[]): SessionItem[] => [...items].sort((a, b) => a.order - b.order);

function fromRoutineItem(it: RoutineItem, order: number): SessionItem {
  const out: SessionItem = {
    ref: it.ref,
    status: 'todo',
    sets: [],
    order,
    plan: { sets: it.sets, repMin: it.repMin, repMax: it.repMax, restSec: it.restSec },
  };
  if (it.variation) out.variation = it.variation;
  if (it.setup) out.setup = it.setup;
  if (it.supersetGroup) out.supersetGroup = it.supersetGroup;
  return out;
}

export function startFromDay(day: Pick<RoutineDay, 'id' | 'name' | 'items'>, routineId: string, id: string, nowMs: number): Session {
  return { id, clientId: id, startedAt: iso(nowMs), routineId, dayId: day.id, dayName: day.name, items: day.items.map((it, i) => fromRoutineItem(it, i)) };
}

export function startFree(id: string, nowMs: number): Session {
  return { id, clientId: id, startedAt: iso(nowMs), items: [] };
}

/** A new session with the same exercises as `prev` (status todo, no sets). */
export function repeatOf(prev: Session, id: string, nowMs: number): Session {
  const items = sorted(prev.items).map((it, i): SessionItem => {
    const { skipReason: _r, ...rest } = it;
    return { ...rest, status: 'todo', sets: [], order: i };
  });
  const s: Session = { id, clientId: id, startedAt: iso(nowMs), items };
  if (prev.routineId) s.routineId = prev.routineId;
  if (prev.dayId) s.dayId = prev.dayId;
  if (prev.dayName) s.dayName = prev.dayName;
  return s;
}

/** Items to append to a started day: leftovers from last time that the day does not have yet. */
export function withLeftovers(s: Session, leftover: readonly ItemRef[]): Session {
  const have = new Set(s.items.map((i) => refId(i.ref)));
  const extra = leftover.filter((r) => !have.has(refId(r)));
  return extra.length === 0 ? s : { ...s, items: renumber([...s.items, ...extra.map((ref, k) => ({ ref, status: 'todo' as const, sets: [], order: s.items.length + k }))]) };
}

export const refId = (r: ItemRef): string => (r.kind === 'lib' ? r.slug : `custom:${r.id}`);

// ---------- items ----------

/** Adds at the end. Duplicates are allowed. Never blocked. */
export function addItem(s: Session, ref: ItemRef, plan?: ItemPlan): Session {
  const item: SessionItem = { ref, status: 'todo', sets: [], order: s.items.length };
  if (plan) item.plan = plan;
  return { ...s, items: [...sorted(s.items), item] };
}

export function removeItem(s: Session, index: number): { session: Session; removed?: SessionItem } {
  const list = sorted(s.items);
  const removed = list[index];
  if (!removed) return { session: s };
  return { session: { ...s, items: renumber(list.filter((_, i) => i !== index)) }, removed };
}

/** Puts an item back at `index` (Undo). */
export function insertItem(s: Session, index: number, item: SessionItem): Session {
  const list = sorted(s.items);
  const at = Math.max(0, Math.min(list.length, index));
  return { ...s, items: renumber([...list.slice(0, at), item, ...list.slice(at)]) };
}

export function moveItem(s: Session, from: number, to: number): Session {
  const list = sorted(s.items);
  if (from === to || !list[from] || to < 0 || to >= list.length) return s;
  const [it] = list.splice(from, 1);
  list.splice(to, 0, it!);
  return { ...s, items: renumber(list) };
}

/** Any status to any status. `skipReason` lives only on `skipped`; sets are never touched. */
export function setStatus(s: Session, index: number, status: SessionStatus, reason?: SkipReason): Session {
  const list = sorted(s.items);
  const cur = list[index];
  if (!cur) return s;
  const { skipReason: _old, ...rest } = cur;
  const next: SessionItem = { ...rest, status };
  if (status === 'skipped' && reason) next.skipReason = reason;
  return { ...s, items: list.map((it, i) => (i === index ? next : it)) };
}

/** What a swap puts in the new item: another exercise, or the same one with another variation text. */
export interface Replacement {
  ref: ItemRef;
  variation?: string;
}

/**
 * Swap (Phase 35, P14.1): the original keeps its logged sets and becomes `skipped` with the reason (a `done` item stays
 * `done`); the replacement is a NEW `todo` item at the original's `order + 1` with the same plan. A same-exercise
 * variation also keeps the setup; another exercise does not (setup axes belong to the exercise). Nothing else moves.
 */
export function swapItem(s: Session, index: number, repl: Replacement, reason?: SkipReason): Session {
  const list = sorted(s.items);
  const cur = list[index];
  if (!cur) return s;
  const { skipReason: _r, ...rest } = cur;
  const original: SessionItem = { ...rest, status: cur.status === 'done' ? 'done' : 'skipped' };
  if (original.status === 'skipped' && reason) original.skipReason = reason;
  if (original.status === 'done' && cur.skipReason) original.skipReason = cur.skipReason;
  const fresh: SessionItem = { ref: repl.ref, status: 'todo', sets: [], order: index + 1 };
  if (cur.plan) fresh.plan = { ...cur.plan };
  if (repl.variation) fresh.variation = repl.variation;
  if (repl.variation && refId(repl.ref) === refId(cur.ref) && cur.setup) fresh.setup = cur.setup;
  return { ...s, items: renumber([...list.slice(0, index), original, fresh, ...list.slice(index + 1)]) };
}

/** Marks a machine busy for the rest of this session (local; keeps the list unique and sorted by arrival). */
export function markMachineBusy(s: Session, machine: string): Session {
  if (!machine || (s.busyMachines ?? []).includes(machine)) return s;
  return { ...s, busyMachines: [...(s.busyMachines ?? []), machine] };
}

/** Takes a machine off the busy list again (Undo). */
export function clearMachineBusy(s: Session, machine: string): Session {
  const left = (s.busyMachines ?? []).filter((m) => m !== machine);
  const { busyMachines: _b, ...rest } = s;
  return left.length > 0 ? { ...rest, busyMachines: left } : rest;
}

/** Reopen: `doing` when it has sets, else `todo`. */
export const reopen = (s: Session, index: number): Session => setStatus(s, index, (sorted(s.items)[index]?.sets.length ?? 0) > 0 ? 'doing' : 'todo');

export function bringAllBack(s: Session): Session {
  return { ...s, items: sorted(s.items).map((it) => (it.status === 'later' ? { ...it, status: 'todo' as const } : it)) };
}

/** Logs a set; the first set moves `todo`, `later` and `skipped` items to `doing`, never a `done` item. */
export function logSet(s: Session, index: number, set: SetLog): Session {
  const list = sorted(s.items);
  const cur = list[index];
  if (!cur) return s;
  const status = cur.status === 'done' ? 'done' : 'doing';
  const { skipReason: _r, ...rest } = cur;
  const next: SessionItem = { ...rest, status, sets: [...cur.sets, set] };
  if (status === 'done' && cur.skipReason) next.skipReason = cur.skipReason;
  return { ...s, items: list.map((it, i) => (i === index ? next : it)) };
}

// ---------- reading ----------

export type StatusCounts = Record<SessionStatus, number>;

export function counts(s: Session): StatusCounts {
  const c: StatusCounts = { todo: 0, doing: 0, done: 0, skipped: 0, later: 0 };
  for (const it of s.items) c[it.status] += 1;
  return c;
}

export const setsLogged = (s: Session): number => s.items.reduce((n, it) => n + it.sets.length, 0);
export const isOpen = (s: Session): boolean => s.endedAt === undefined;

/** Items that are not `done`: skipped, later, todo and doing. */
export const unfinished = (s: Session): SessionItem[] => sorted(s.items).filter((it) => it.status !== 'done');

/** A suggestion only: the first `todo`, else the first `doing`. Nothing forces it. */
export function suggestedNext(s: Session): number | undefined {
  const list = sorted(s.items);
  const todo = list.findIndex((it) => it.status === 'todo');
  if (todo >= 0) return todo;
  const doing = list.findIndex((it) => it.status === 'doing');
  return doing >= 0 ? doing : undefined;
}

/** Everything is done or skipped (\"All set\"). */
export const allSet = (s: Session): boolean => s.items.length > 0 && s.items.every((it) => it.status === 'done' || it.status === 'skipped');

export const elapsedSec = (s: Session, nowMs: number): number => Math.max(0, Math.floor(((s.endedAt ? Date.parse(s.endedAt) : nowMs) - Date.parse(s.startedAt)) / 1000));

/** Open more than 6 hours with no set logged: the next open offers \"Finish this session?\". */
export const isStale = (s: Session, nowMs: number): boolean => isOpen(s) && setsLogged(s) === 0 && nowMs - Date.parse(s.startedAt) > STALE_HOURS * 3600 * 1000;

/** The one open session: the newest that has not ended. */
export function openSession(list: readonly Session[]): Session | undefined {
  return [...list].filter(isOpen).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
}

/** The newest finished session that had exercises (an empty one is not worth repeating). */
export function lastFinished(list: readonly Session[]): Session | undefined {
  return [...list].filter((s) => !isOpen(s) && s.items.length > 0).sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!))[0];
}

/** Whole hours since a finished session of this day ended, when under 24 (\"Done 2 hours ago\"); else undefined. */
export function doneHoursAgo(list: readonly Session[], dayId: string, nowMs: number): number | undefined {
  let best: number | undefined;
  for (const s of list) {
    if (s.dayId !== dayId || !s.endedAt) continue;
    const h = Math.floor((nowMs - Date.parse(s.endedAt)) / 3600000);
    if (h >= 0 && h < 24 && (best === undefined || h < best)) best = h;
  }
  return best;
}

// ---------- finish ----------

export interface FinishResult {
  session: Session;
  /** Refs of unfinished items when `keep` was chosen (the caller stores them for the day's next start). */
  leftover: ItemRef[];
}

/** Finish sets `endedAt` and nothing else; unfinished items stay in the record (skipped is neutral). Never refused. */
export function finish(s: Session, nowMs: number, keep: 'drop' | 'keep' = 'drop'): FinishResult {
  const leftover = keep === 'keep' ? unfinished(s).map((it) => it.ref) : [];
  return { session: { ...s, endedAt: iso(nowMs) }, leftover };
}

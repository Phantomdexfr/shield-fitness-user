// Set logger rules (Phase 38): what the set rows do, as pure functions over a Session. No DOM, no storage, no clock
// (the time of a set is a parameter). The screen calls these, then autosaves the returned session (one write per set).

import { roundKg } from './units';
import { DEFAULT_BAR, DEFAULT_PLATES } from './pocket';
import { stepOf, type OverloadResult } from './engine/overload';
import { topWeight, workingSets, type EngineSet, type ExerciseResult } from './engine/sessionStats';
import { logSet, refId, type ItemRef, type Session, type SetLog } from './session';

export type SetTag = SetLog['tag'];
export const TAGS: readonly SetTag[] = ['normal', 'warmup', 'drop', 'superset'];

// ---------- drafts (the numbers waiting to be logged) ----------

export interface Draft {
  weightKg: number;
  reps: number;
  /** null = no RPE. */
  rpe: number | null;
  tag: SetTag;
}

export interface CardioDraft {
  minutes: number;
  distanceKm: number;
  incline: number;
  calories: number;
}

export const EMPTY_CARDIO: CardioDraft = { minutes: 10, distanceKm: 0, incline: 0, calories: 0 };
export const RPE_MIN = 5;
export const RPE_MAX = 10;
export const RPE_STEP = 0.5;
export const MAX_KG = 1000;
export const MAX_REPS = 200;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** One set row from a draft. RPE is dropped for warm-ups; empty weight on a bodyweight draft stays null. */
export function setFromDraft(d: Draft, doneAt: string, restSec?: number): SetLog {
  const set: SetLog = {
    weightKg: d.weightKg > 0 ? roundKg(clamp(d.weightKg, 0, MAX_KG)) : null,
    reps: Math.round(clamp(d.reps, 0, MAX_REPS)),
    tag: d.tag,
    doneAt,
  };
  if (d.rpe != null && d.tag !== 'warmup') set.rpe = clamp(d.rpe, RPE_MIN, RPE_MAX);
  if (restSec != null && restSec > 0) set.restSec = Math.round(restSec);
  return set;
}

/** One cardio row: time (seconds), and distance, incline and calories only when given. */
export function cardioFromDraft(d: CardioDraft, doneAt: string): SetLog {
  const set: SetLog = { weightKg: null, reps: null, seconds: Math.max(0, Math.round(d.minutes * 60)), tag: 'normal', doneAt };
  if (d.distanceKm > 0) set.distanceM = Math.round(d.distanceKm * 1000);
  if (d.incline > 0) set.incline = roundKg(d.incline);
  if (d.calories > 0) set.calories = Math.round(d.calories);
  return set;
}

export const draftOfSet = (s: SetLog): Draft => ({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0, rpe: s.rpe ?? null, tag: s.tag });

// ---------- history ----------

/** Finished sessions' results for one exercise, oldest first (the order `overload()` reads). Skipped items and empty items are left out. */
export function resultsFor(sessions: readonly Session[], ref: ItemRef, excludeId?: string): ExerciseResult[] {
  const id = refId(ref);
  return sessions
    .filter((s) => s.endedAt !== undefined && s.id !== excludeId)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .flatMap((s) => s.items.filter((it) => refId(it.ref) === id && it.status !== 'skipped' && it.sets.length > 0).map((it) => ({ sets: it.sets as readonly EngineSet[] })));
}

/** Actual rests (seconds) logged for one exercise, oldest first, over all sessions including the open one. */
export function restHistory(sessions: readonly Session[], ref: ItemRef): number[] {
  const id = refId(ref);
  return [...sessions]
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .flatMap((s) => s.items.filter((it) => refId(it.ref) === id).flatMap((it) => it.sets.map((x) => x.restSec).filter((x): x is number => typeof x === 'number')));
}

export interface LastTime {
  weightKg: number;
  /** Reps of each working set of the last session, in order. */
  reps: number[];
  /** `up` when the overload engine says add weight, `down` for a deload, otherwise `hold`. */
  trend: 'up' | 'hold' | 'down' | null;
}

/** "Last: 60 kg x 10, 10, 9" data from the newest result with a working set. */
export function lastTime(results: readonly ExerciseResult[], suggestion?: OverloadResult | null): LastTime | null {
  for (let i = results.length - 1; i >= 0; i--) {
    const w = workingSets((results[i] as ExerciseResult).sets);
    if (w.length === 0) continue;
    const trend: LastTime['trend'] = !suggestion || suggestion.weightKg == null ? null : suggestion.note === 'add_weight' || suggestion.note === 'add_weight_2' ? 'up' : suggestion.note === 'deload' ? 'down' : 'hold';
    return { weightKg: topWeight(w), reps: w.map((s) => s.reps as number), trend };
  }
  return null;
}

// ---------- auto-fill ----------

export interface FillInput {
  /** Sets already logged in THIS session for the item. */
  logged: readonly SetLog[];
  last: LastTime | null;
  suggestion?: OverloadResult | null;
  repMin: number;
  repMax: number;
  /** Plan from the routine day, when there is one. */
  planReps?: number;
}

/**
 * The first draft for an item. Priority: what you just did in this session (the next set is usually the same), then the
 * overload suggestion, then last time, then the rep range. Never invents a weight: with nothing known it is 0 (bodyweight).
 */
export function initialDraft(i: FillInput): Draft {
  const mine = [...i.logged].reverse().find((s) => s.tag !== 'warmup' && s.reps != null);
  if (mine) return { weightKg: mine.weightKg ?? 0, reps: mine.reps ?? i.repMin, rpe: null, tag: 'normal' };
  const sug = i.suggestion;
  if (sug && sug.weightKg != null) return { weightKg: sug.weightKg, reps: sug.reps[0] ?? i.planReps ?? i.repMin, rpe: null, tag: 'normal' };
  if (i.last) return { weightKg: i.last.weightKg, reps: i.last.reps[0] ?? i.repMin, rpe: null, tag: 'normal' };
  return { weightKg: 0, reps: i.planReps ?? i.repMin, rpe: null, tag: 'normal' };
}

/** Step of the weight Stepper: the machine's own step, else 2.5 kg. */
export const weightStep = (stepKg: number | null | undefined): number => stepOf(stepKg);

// ---------- set rows on a session ----------

const sortedIdx = (s: Session, itemIdx: number): number => itemIdx;

function withSets(s: Session, itemIdx: number, fn: (sets: SetLog[]) => SetLog[]): Session {
  const list = [...s.items].sort((a, b) => a.order - b.order);
  const cur = list[sortedIdx(s, itemIdx)];
  if (!cur) return s;
  const sets = fn(cur.sets);
  const status = cur.status === 'done' ? 'done' : sets.length === 0 && cur.status === 'doing' ? 'todo' : cur.status;
  return { ...s, items: list.map((it, i) => (i === itemIdx ? { ...it, sets, status } : it)) };
}

/** Appends a set (same as `logSet`, kept here so the screen imports one module). */
export const addSet = (s: Session, itemIdx: number, set: SetLog): Session => logSet(s, itemIdx, set);

/** Changes a logged set. Moving to `warmup` drops its RPE. */
export function editSet(s: Session, itemIdx: number, setIdx: number, patch: Partial<Pick<SetLog, 'weightKg' | 'reps' | 'rpe' | 'tag' | 'seconds' | 'distanceM' | 'incline' | 'calories'>>): Session {
  return withSets(s, itemIdx, (sets) =>
    sets.map((x, i) => {
      if (i !== setIdx) return x;
      const next: SetLog = { ...x, ...patch };
      if (patch.rpe === undefined && 'rpe' in patch) delete next.rpe;
      if (next.tag === 'warmup') delete next.rpe;
      return next;
    }),
  );
}

/** Removes one set. An item that had only that set goes back from `doing` to `todo`. */
export function deleteSet(s: Session, itemIdx: number, setIdx: number): { session: Session; removed?: SetLog } {
  const list = [...s.items].sort((a, b) => a.order - b.order);
  const removed = list[itemIdx]?.sets[setIdx];
  if (!removed) return { session: s };
  return { session: withSets(s, itemIdx, (sets) => sets.filter((_, i) => i !== setIdx)), removed };
}

/** Puts a removed set back where it was (Undo). */
export function restoreSet(s: Session, itemIdx: number, setIdx: number, set: SetLog): Session {
  return withSets(s, itemIdx, (sets) => [...sets.slice(0, setIdx), set, ...sets.slice(setIdx)]);
}

/** Copies a set right after itself, with a new time and no rest figure. */
export function duplicateSet(s: Session, itemIdx: number, setIdx: number, doneAt: string): Session {
  return withSets(s, itemIdx, (sets) => {
    const src = sets[setIdx];
    if (!src) return sets;
    const { restSec: _r, ...rest } = src;
    return [...sets.slice(0, setIdx + 1), { ...rest, doneAt }, ...sets.slice(setIdx + 1)];
  });
}

/** Logs ramp sets one after the other, each tagged `warmup`. */
export function addRamp(s: Session, itemIdx: number, ramp: ReadonlyArray<{ weightKg: number; reps: number }>, doneAt: string): Session {
  return ramp.reduce((acc, r) => logSet(acc, itemIdx, { weightKg: r.weightKg, reps: r.reps, tag: 'warmup', doneAt }), s);
}

/** Working sets logged so far on an item (warm-ups never count). */
export const workingCount = (sets: readonly SetLog[]): number => workingSets(sets as readonly EngineSet[]).length;

// ---------- swipe ----------

export const SWIPE_PX = 64;

/** Left swipe = delete, right swipe = duplicate. A mostly vertical move is a scroll, never a swipe. */
export function swipeAction(dx: number, dy: number, threshold = SWIPE_PX): 'delete' | 'duplicate' | null {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'delete' : 'duplicate';
}

// ---------- stored preferences ----------

export interface LoggerPrefs {
  mode: 'simple' | 'advanced';
  big: boolean;
  barKg: number;
  /** Plates in the rack (kg), any order. */
  plates: number[];
}

export const DEFAULT_LOGGER_PREFS: LoggerPrefs = { mode: 'simple', big: false, barKg: DEFAULT_BAR.kg, plates: [...DEFAULT_PLATES.kg] };

/** Reads whatever was stored; anything wrong or missing falls back to the default for that field. */
export function sanitizePrefs(raw: unknown): LoggerPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const plates = Array.isArray(r.plates) ? r.plates.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= 100) : [];
  const bar = typeof r.barKg === 'number' && Number.isFinite(r.barKg) && r.barKg >= 0 && r.barKg <= 50 ? r.barKg : DEFAULT_LOGGER_PREFS.barKg;
  return {
    mode: r.mode === 'advanced' ? 'advanced' : 'simple',
    big: r.big === true,
    barKg: roundKg(bar),
    plates: plates.length > 0 ? [...new Set(plates.map(roundKg))].sort((a, b) => b - a).slice(0, 12) : [...DEFAULT_LOGGER_PREFS.plates],
  };
}

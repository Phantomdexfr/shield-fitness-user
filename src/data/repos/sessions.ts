// Sessions repo (Phase 34): stores sessions in the local `sessions` store (one row per session, `client_id` = id),
// starts them from a day, free or a repeat, finishes them and moves the schedule pointer. Screens ask here only.

import { newClientId, prefsRepo, sessionsRepo } from '../local';
import { pointerAfter } from '../../shared/schedule';
import { finish, lastFinished, openSession, repeatOf, startFree, startFromDay, withLeftovers, type ItemRef, type Session } from '../../shared/session';
import { getRoutine } from './routines';
import { readState, writeState } from './schedule';

const LEFTOVER_ID = (dayId: string) => `leftover:${dayId}`;

type Row = Session & { client_id: string; updated_at?: number; deleted_at?: number };

const clean = (r: Row): Session => {
  const { client_id: _c, updated_at: _u, deleted_at: _d, ...s } = r;
  return s as Session;
};

export async function listSessions(): Promise<Session[]> {
  return ((await sessionsRepo.list()) as unknown as Row[]).filter((r) => typeof r.id === 'string' && Array.isArray(r.items)).map(clean);
}

export async function getSession(id: string): Promise<Session | undefined> {
  const r = (await sessionsRepo.get(id)) as unknown as Row | undefined;
  return r && Array.isArray(r.items) ? clean(r) : undefined;
}

/** Autosave: one write per change, so an app kill loses nothing. */
export async function putSession(s: Session): Promise<void> {
  await sessionsRepo.put({ ...s, client_id: s.id } as never);
}

export async function deleteSession(id: string): Promise<void> {
  await sessionsRepo.remove(id);
}

export async function currentOpen(): Promise<Session | undefined> {
  return openSession(await listSessions());
}

export async function previousFinished(): Promise<Session | undefined> {
  return lastFinished(await listSessions());
}

/** Starts a session from a routine day. Returns undefined when the routine or day no longer exists. */
export async function beginDay(routineId: string, dayId: string, nowMs = Date.now()): Promise<Session | undefined> {
  const routine = await getRoutine(routineId);
  const day = routine?.days.find((d) => d.id === dayId);
  if (!routine || !day) return undefined;
  const left = (await prefsRepo.get(LEFTOVER_ID(day.id)))?.value as { refs?: ItemRef[] } | undefined;
  const s = withLeftovers(startFromDay(day, routine.id, newClientId(), nowMs), Array.isArray(left?.refs) ? left.refs : []);
  await putSession(s);
  if (left?.refs) await prefsRepo.remove(LEFTOVER_ID(day.id));
  return s;
}

export async function beginFree(nowMs = Date.now()): Promise<Session> {
  const s = startFree(newClientId(), nowMs);
  await putSession(s);
  return s;
}

export async function beginRepeat(nowMs = Date.now()): Promise<Session | undefined> {
  const prev = await previousFinished();
  if (!prev) return undefined;
  const s = repeatOf(prev, newClientId(), nowMs);
  await putSession(s);
  return s;
}

/** Starts a new session with the same exercises as the finished session `id` (History: "Repeat this session"). */
export async function beginRepeatOf(id: string, nowMs = Date.now()): Promise<Session | undefined> {
  const prev = await getSession(id);
  if (!prev || prev.items.length === 0) return undefined;
  const s = repeatOf(prev, newClientId(), nowMs);
  await putSession(s);
  return s;
}

/**
 * Finishes a session: sets `endedAt`, stores leftovers for the day's next start when asked, and moves the routine's
 * rotation pointer past the day that was trained. Never refuses; a pointer or leftover failure does not undo the finish.
 */
export async function finishSession(s: Session, keep: 'drop' | 'keep', nowMs = Date.now()): Promise<Session> {
  const res = finish(s, nowMs, keep);
  await putSession(res.session);
  try {
    if (keep === 'keep' && s.dayId && res.leftover.length > 0) await prefsRepo.put({ client_id: LEFTOVER_ID(s.dayId), value: { refs: res.leftover } });
    if (s.routineId && s.dayId) {
      const routine = await getRoutine(s.routineId);
      const at = routine?.days.findIndex((d) => d.id === s.dayId) ?? -1;
      if (routine && at >= 0) await writeState(routine.id, { ...(await readState(routine.id)), pointer: pointerAfter(at, routine.days.length) });
    }
  } catch {
    /* the finish itself is saved */
  }
  return res.session;
}

/** "Start new anyway": ends the old session as it is (no pointer move, no summary); it stays in History. */
export async function endAsIs(s: Session, nowMs = Date.now()): Promise<void> {
  await putSession(finish(s, nowMs, 'drop').session);
}

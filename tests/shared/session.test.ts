import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDb, setClock } from '../../src/data/local';
import { beginDay, beginFree, beginRepeat, currentOpen, deleteSession, finishSession, getSession, listSessions, putSession } from '../../src/data/repos/sessions';
import { putRoutine } from '../../src/data/repos/routines';
import { readState } from '../../src/data/repos/schedule';
import {
  addItem, allSet, bringAllBack, counts, doneHoursAgo, elapsedSec, finish, insertItem, isStale, logSet, moveItem, openSession, removeItem, reopen, repeatOf,
  setStatus, setsLogged, startFree, startFromDay, suggestedNext, unfinished, withLeftovers, type Session, type SetLog,
} from '../../src/shared/session';
import type { Routine } from '../../src/shared/routine';

const T0 = Date.parse('2026-11-19T04:30:00.000Z');
const ri = (slug: string, sets = 3) => ({ ref: { kind: 'lib' as const, slug }, sets, repMin: 8, repMax: 12, restSec: 90, tag: 'normal' as const });
const day = { id: 'd1', name: 'Push', items: [ri('bench'), ri('press'), ri('fly'), ri('dips')] };
const set = (w = 40, r = 10): SetLog => ({ weightKg: w, reps: r, tag: 'normal', doneAt: '2026-11-19T05:00:00.000Z' });
const base = (): Session => startFromDay(day, 'r1', 's1', T0);
const slugs = (s: Session) => [...s.items].sort((a, b) => a.order - b.order).map((i) => (i.ref.kind === 'lib' ? i.ref.slug : i.ref.id));

describe('start', () => {
  it('a day becomes todo items in order with their plan, and the id is the clientId', () => {
    const s = base();
    expect(s.clientId).toBe(s.id);
    expect(s.startedAt).toBe('2026-11-19T04:30:00.000Z');
    expect(s.items.map((i) => [i.status, i.order, i.sets.length])).toEqual([['todo', 0, 0], ['todo', 1, 0], ['todo', 2, 0], ['todo', 3, 0]]);
    expect(s.items[0]!.plan).toEqual({ sets: 3, repMin: 8, repMax: 12, restSec: 90 });
    expect(s.dayName).toBe('Push');
  });
  it('a free session is empty; repeat copies the last one with nothing done', () => {
    expect(startFree('f', T0).items).toEqual([]);
    let s = logSet(base(), 0, set());
    s = setStatus(s, 1, 'skipped', 'busy');
    const r = repeatOf(s, 'r2', T0 + 1000);
    expect(r.items.map((i) => [i.status, i.sets.length, i.skipReason])).toEqual([['todo', 0, undefined], ['todo', 0, undefined], ['todo', 0, undefined], ['todo', 0, undefined]]);
    expect(r.dayId).toBe('d1');
    expect(r.endedAt).toBeUndefined();
  });
  it('leftovers are added once and never duplicate an item already in the day', () => {
    const s = withLeftovers(base(), [{ kind: 'lib', slug: 'bench' }, { kind: 'lib', slug: 'curl' }]);
    expect(slugs(s)).toEqual(['bench', 'press', 'fly', 'dips', 'curl']);
  });
});

describe('no forced order (state machine)', () => {
  it('every status can move to every other status, in any order, on any item', () => {
    const all = ['todo', 'doing', 'done', 'skipped', 'later'] as const;
    for (const from of all) for (const to of all) {
      let s = setStatus(base(), 2, from);
      s = setStatus(s, 2, to);
      expect(s.items[2]!.status, `${from}->${to}`).toBe(to);
    }
    // Do the last item first, then the third, then skip the first: nothing blocks.
    let s = setStatus(base(), 3, 'done');
    s = setStatus(s, 2, 'doing');
    s = setStatus(s, 0, 'skipped');
    expect(s.items.map((i) => i.status)).toEqual(['skipped', 'todo', 'doing', 'done']);
  });
  it('skipReason lives only on skipped; sets are never touched by a status change', () => {
    let s = logSet(base(), 0, set());
    s = setStatus(s, 0, 'skipped', 'pain');
    expect(s.items[0]!.skipReason).toBe('pain');
    expect(s.items[0]!.sets).toHaveLength(1);
    s = setStatus(s, 0, 'later');
    expect(s.items[0]!.skipReason).toBeUndefined();
    expect('skipReason' in s.items[0]!).toBe(false);
    expect(s.items[0]!.sets).toHaveLength(1);
    expect(setStatus(s, 0, 'skipped').items[0]!.skipReason).toBeUndefined();
  });
  it('the first logged set moves an item to doing (also from skipped or later), never reopens done', () => {
    expect(logSet(base(), 0, set()).items[0]!.status).toBe('doing');
    expect(logSet(setStatus(base(), 0, 'later'), 0, set()).items[0]!.status).toBe('doing');
    const sk = logSet(setStatus(base(), 0, 'skipped', 'busy'), 0, set());
    expect(sk.items[0]!.status).toBe('doing');
    expect(sk.items[0]!.skipReason).toBeUndefined();
    expect(logSet(setStatus(base(), 0, 'done'), 0, set()).items[0]!.status).toBe('done');
  });
  it('reopen goes to doing with sets, todo without', () => {
    expect(reopen(setStatus(base(), 0, 'done'), 0).items[0]!.status).toBe('todo');
    expect(reopen(setStatus(logSet(base(), 0, set()), 0, 'done'), 0).items[0]!.status).toBe('doing');
  });
  it('a bad index changes nothing', () => {
    const s = base();
    expect(setStatus(s, 9, 'done')).toBe(s);
    expect(logSet(s, -1, set())).toBe(s);
  });
});

describe('add, remove, reorder during a session', () => {
  it('add at any time, duplicates allowed, orders stay 0..n-1', () => {
    let s = logSet(base(), 1, set());
    s = addItem(s, { kind: 'lib', slug: 'bench' });
    s = addItem(s, { kind: 'custom', id: 'c1' }, { sets: 2, repMin: 5, repMax: 8, restSec: 60 });
    expect(slugs(s)).toEqual(['bench', 'press', 'fly', 'dips', 'bench', 'c1']);
    expect(s.items.map((i) => i.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.items[5]!.plan?.sets).toBe(2);
  });
  it('remove renumbers and Undo puts it back where it was', () => {
    const s = logSet(base(), 1, set());
    const r = removeItem(s, 1);
    expect(r.removed?.ref).toEqual({ kind: 'lib', slug: 'press' });
    expect(slugs(r.session)).toEqual(['bench', 'fly', 'dips']);
    expect(r.session.items.map((i) => i.order)).toEqual([0, 1, 2]);
    const back = insertItem(r.session, 1, r.removed!);
    expect(slugs(back)).toEqual(['bench', 'press', 'fly', 'dips']);
    expect(back.items[1]!.sets).toHaveLength(1);
    expect(removeItem(s, 9).removed).toBeUndefined();
  });
  it('removing everything is allowed', () => {
    let s = base();
    for (let i = 0; i < 4; i++) s = removeItem(s, 0).session;
    expect(s.items).toEqual([]);
  });
  it('move reorders and ignores the ends', () => {
    const s = base();
    expect(slugs(moveItem(s, 0, 2))).toEqual(['press', 'fly', 'bench', 'dips']);
    expect(slugs(moveItem(s, 3, 0))).toEqual(['dips', 'bench', 'press', 'fly']);
    expect(moveItem(s, 0, -1)).toBe(s);
    expect(moveItem(s, 3, 4)).toBe(s);
  });
  it('later shelf: items return to their old place; bring all back', () => {
    let s = setStatus(setStatus(base(), 0, 'later'), 2, 'later');
    expect(counts(s).later).toBe(2);
    expect(slugs(s)).toEqual(['bench', 'press', 'fly', 'dips']);
    s = bringAllBack(s);
    expect(s.items.map((i) => i.status)).toEqual(['todo', 'todo', 'todo', 'todo']);
  });
});

describe('reading', () => {
  it('suggested next is only a suggestion: first todo, else first doing, else none', () => {
    let s = base();
    expect(suggestedNext(s)).toBe(0);
    s = setStatus(setStatus(s, 0, 'done'), 1, 'skipped');
    expect(suggestedNext(s)).toBe(2);
    s = setStatus(setStatus(s, 2, 'doing'), 3, 'later');
    expect(suggestedNext(s)).toBe(2);
    expect(suggestedNext(setStatus(s, 2, 'done'))).toBeUndefined();
    expect(suggestedNext(startFree('x', T0))).toBeUndefined();
  });
  it('all set = everything done or skipped', () => {
    let s = base();
    expect(allSet(s)).toBe(false);
    for (let i = 0; i < 4; i++) s = setStatus(s, i, i % 2 ? 'skipped' : 'done');
    expect(allSet(s)).toBe(true);
    expect(allSet(startFree('x', T0))).toBe(false);
  });
  it('elapsed time, stale after 6 h with no set, one open session at a time', () => {
    const s = base();
    expect(elapsedSec(s, T0 + 90_000)).toBe(90);
    expect(isStale(s, T0 + 5 * 3600_000)).toBe(false);
    expect(isStale(s, T0 + 7 * 3600_000)).toBe(true);
    expect(isStale(logSet(s, 0, set()), T0 + 7 * 3600_000)).toBe(false);
    expect(isStale({ ...s, endedAt: '2026-11-19T06:00:00.000Z' }, T0 + 7 * 3600_000)).toBe(false);
    const a = startFree('a', T0);
    const b = startFree('b', T0 + 5000);
    expect(openSession([a, b])?.id).toBe('b');
    expect(openSession([{ ...b, endedAt: 'x' }, a])?.id).toBe('a');
    expect(openSession([])).toBeUndefined();
  });
  it('"Done 2 hours ago" only for the same day, under 24 h', () => {
    const done = { ...base(), endedAt: new Date(T0 + 3600_000).toISOString() };
    expect(doneHoursAgo([done], 'd1', T0 + 3 * 3600_000)).toBe(2);
    expect(doneHoursAgo([done], 'd2', T0 + 3 * 3600_000)).toBeUndefined();
    expect(doneHoursAgo([done], 'd1', T0 + 30 * 3600_000)).toBeUndefined();
  });
});

describe('finish anytime', () => {
  it('finishes with todo items left; nothing is dropped from the record and nothing is refused', () => {
    let s = logSet(base(), 0, set());
    s = setStatus(s, 1, 'skipped', 'no_time');
    s = setStatus(s, 2, 'later');
    expect(counts(s)).toEqual({ todo: 1, doing: 1, done: 0, skipped: 1, later: 1 });
    const r = finish(s, T0 + 3600_000);
    expect(r.session.endedAt).toBe('2026-11-19T05:30:00.000Z');
    expect(r.session.items).toHaveLength(4);
    expect(r.leftover).toEqual([]);
    expect(unfinished(r.session)).toHaveLength(4);
  });
  it('with zero sets logged it still finishes', () => {
    const r = finish(base(), T0 + 1000);
    expect(setsLogged(r.session)).toBe(0);
    expect(r.session.endedAt).toBeDefined();
  });
  it('keep for next time lists the unfinished refs, not the done ones', () => {
    const s = setStatus(setStatus(base(), 0, 'done'), 2, 'skipped');
    expect(finish(s, T0, 'keep').leftover.map((r) => (r.kind === 'lib' ? r.slug : ''))).toEqual(['press', 'fly', 'dips']);
  });
});

// ---------- crash-resume and the repo (fake-indexeddb) ----------

const routine = (): Routine => ({
  id: 'r1', name: 'PPL', source: 'mine', daysPerWeek: 2, weekdays: [], splitStyle: 'ppl', active: true,
  days: [{ id: 'd1', name: 'Push', targetMuscles: ['chest'], items: day.items }, { id: 'd2', name: 'Pull', targetMuscles: ['lats'], items: [ri('row')] }],
});

let t = 1000;
beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  t = 1000;
  setClock(() => ++t);
});

describe('autosave and crash-resume', () => {
  it('after an app kill the open session comes back exactly as it was', async () => {
    await putRoutine(routine());
    const s0 = (await beginDay('r1', 'd1', T0))!;
    let s = logSet(s0, 2, set(50, 8));
    s = setStatus(s, 0, 'later');
    s = addItem(s, { kind: 'lib', slug: 'curl' });
    await putSession(s); // autosave after each change
    await resetDb(); // the app is killed: the connection is gone, the data stays
    const again = await currentOpen();
    expect(again).toEqual(s);
    expect(again!.items[2]!.sets).toEqual([set(50, 8)]);
    expect(again!.items.map((i) => i.status)).toEqual(['later', 'todo', 'doing', 'todo', 'todo']);
  });
  it('only an open session is "open"; finishing moves the rotation pointer past the trained day', async () => {
    await putRoutine(routine());
    const s = (await beginDay('r1', 'd1', T0))!;
    expect(await readState('r1')).toMatchObject({ pointer: 0 });
    await finishSession(s, 'drop', T0 + 1000);
    expect(await currentOpen()).toBeUndefined();
    expect((await readState('r1')).pointer).toBe(1);
    const s2 = (await beginDay('r1', 'd2', T0 + 2000))!;
    await finishSession(s2, 'drop', T0 + 3000);
    expect((await readState('r1')).pointer).toBe(0);
  });
  it('keep for next time: the unfinished items are added the next time that day starts, once', async () => {
    await putRoutine(routine());
    let s = (await beginDay('r1', 'd1', T0))!;
    s = setStatus(s, 0, 'done');
    await finishSession(s, 'keep', T0 + 1000);
    const next = (await beginDay('r1', 'd1', T0 + 5000))!;
    expect(next.items).toHaveLength(4); // the day's own items; the leftovers were already in the day
    const free = (await beginFree(T0 + 6000))!;
    await finishSession(free, 'drop', T0 + 7000);
    const extra: Session = withLeftovers(next, [{ kind: 'lib', slug: 'row' }]);
    expect(extra.items).toHaveLength(5);
  });
  it('repeat last, delete and unknown ids', async () => {
    await putRoutine(routine());
    expect(await beginRepeat(T0)).toBeUndefined();
    const s = (await beginDay('r1', 'd1', T0))!;
    await finishSession(logSet(s, 0, set()), 'drop', T0 + 1000);
    const rep = (await beginRepeat(T0 + 2000))!;
    expect(rep.items.every((i) => i.status === 'todo' && i.sets.length === 0)).toBe(true);
    expect(rep.id).not.toBe(s.id);
    expect(await getSession('nope')).toBeUndefined();
    expect(await beginDay('r1', 'gone', T0)).toBeUndefined();
    await deleteSession(rep.id);
    expect((await listSessions()).map((x) => x.id)).toEqual([s.id]);
  });
});

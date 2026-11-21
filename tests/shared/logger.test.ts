import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGGER_PREFS, addRamp, addSet, cardioFromDraft, deleteSet, duplicateSet, editSet, initialDraft, lastTime, restHistory, restoreSet, resultsFor, sanitizePrefs, setFromDraft, swipeAction, weightStep,
  type Draft,
} from '../../src/shared/logger';
import { addItem, startFree, type Session, type SetLog } from '../../src/shared/session';
import { sessionStats } from '../../src/shared/engine';
import { overload } from '../../src/shared/engine/overload';

const bench = { kind: 'lib', slug: 'bench-press' } as const;
const squat = { kind: 'lib', slug: 'squat' } as const;
const at = '2026-11-20T06:00:00.000Z';
const w = (kg: number | null, reps: number, extra: Partial<SetLog> = {}): SetLog => ({ weightKg: kg, reps, tag: 'normal', doneAt: at, ...extra });
const fresh = (): Session => addItem(addItem(startFree('s1', Date.parse(at)), bench), squat);
const done = (id: string, startedAt: string, sets: SetLog[], slug = 'bench-press', status: 'done' | 'skipped' = 'done', ended = true): Session => ({
  id, clientId: id, startedAt, ...(ended ? { endedAt: startedAt } : {}), items: [{ ref: { kind: 'lib', slug }, status, sets, order: 0 }],
});

describe('setFromDraft / cardioFromDraft', () => {
  const d: Draft = { weightKg: 60, reps: 10, rpe: 8, tag: 'normal' };
  it('builds a set row with RPE and the real rest', () => {
    expect(setFromDraft(d, at, 75)).toEqual({ weightKg: 60, reps: 10, rpe: 8, tag: 'normal', doneAt: at, restSec: 75 });
  });
  it('no weight = bodyweight (null); no rpe and no rest are left out', () => {
    expect(setFromDraft({ weightKg: 0, reps: 12, rpe: null, tag: 'normal' }, at)).toEqual({ weightKg: null, reps: 12, tag: 'normal', doneAt: at });
  });
  it('a warm-up never carries RPE', () => {
    expect(setFromDraft({ ...d, tag: 'warmup' }, at).rpe).toBeUndefined();
  });
  it('clamps silly numbers and rounds to 2 dp', () => {
    expect(setFromDraft({ weightKg: 5000, reps: 9999, rpe: 14, tag: 'normal' }, at)).toMatchObject({ weightKg: 1000, reps: 200, rpe: 10 });
    expect(setFromDraft({ weightKg: 0.1 + 0.2, reps: 5, rpe: null, tag: 'normal' }, at).weightKg).toBe(0.3);
  });
  it('cardio keeps time, and distance / incline / calories only when given', () => {
    expect(cardioFromDraft({ minutes: 20, distanceKm: 0, incline: 0, calories: 0 }, at)).toEqual({ weightKg: null, reps: null, seconds: 1200, tag: 'normal', doneAt: at });
    expect(cardioFromDraft({ minutes: 12.5, distanceKm: 2.25, incline: 1.5, calories: 130 }, at)).toEqual({ weightKg: null, reps: null, seconds: 750, distanceM: 2250, incline: 1.5, calories: 130, tag: 'normal', doneAt: at });
  });
});

describe('history readers', () => {
  const sessions = [
    done('b', '2026-11-10T06:00:00Z', [w(60, 10), w(60, 9)]),
    done('a', '2026-11-03T06:00:00Z', [w(57.5, 10)]),
    done('c', '2026-11-17T06:00:00Z', [w(62.5, 8)], 'bench-press', 'skipped'),
    done('d', '2026-11-18T06:00:00Z', [w(70, 5)], 'bench-press', 'done', false),
    done('e', '2026-11-19T06:00:00Z', [], 'bench-press'),
    done('f', '2026-11-19T07:00:00Z', [w(100, 5)], 'squat'),
  ];
  it('resultsFor: finished only, oldest first, no skipped or empty items, other exercises left out', () => {
    expect(resultsFor(sessions, bench).map((r) => r.sets.length)).toEqual([1, 2]);
    expect(resultsFor(sessions, bench)[0]!.sets[0]!.weightKg).toBe(57.5);
  });
  it('resultsFor can leave one session out', () => {
    expect(resultsFor(sessions, bench, 'a')).toHaveLength(1);
  });
  it('restHistory: real rests of one exercise, oldest first, open session included', () => {
    const s = [done('x', '2026-11-02T06:00:00Z', [w(60, 10, { restSec: 90 }), w(60, 10)]), done('y', '2026-11-09T06:00:00Z', [w(60, 10, { restSec: 70 })], 'bench-press', 'done', false), done('z', '2026-11-10T06:00:00Z', [w(1, 1, { restSec: 5 })], 'squat')];
    expect(restHistory(s, bench)).toEqual([90, 70]);
  });
  it('lastTime: top weight and the reps of the working sets; warm-ups ignored', () => {
    const r = resultsFor([done('k', '2026-11-10T06:00:00Z', [w(20, 8, { tag: 'warmup' }), w(60, 10), w(60, 10), w(60, 9)])], bench);
    expect(lastTime(r)).toEqual({ weightKg: 60, reps: [10, 10, 9], trend: null });
    expect(lastTime([])).toBeNull();
    expect(lastTime([{ sets: [{ weightKg: 20, reps: 8, tag: 'warmup' }] }])).toBeNull();
  });
  it('lastTime trend comes from the overload note', () => {
    const r = resultsFor([done('k', '2026-11-10T06:00:00Z', [w(60, 12), w(60, 12)])], bench);
    const up = overload(r, { mode: 'double', repMin: 8, repMax: 12, stepKg: 2.5 });
    expect(up.note).toBe('add_weight');
    expect(lastTime(r, up)?.trend).toBe('up');
    expect(lastTime(r, { weightKg: 60, reps: [10], note: 'hold_reps' })?.trend).toBe('hold');
    expect(lastTime(r, { weightKg: 54, reps: [8], note: 'deload' })?.trend).toBe('down');
    expect(lastTime(r, { weightKg: null, reps: [], note: 'off' })?.trend).toBeNull();
  });
});

describe('initialDraft (auto-fill)', () => {
  const base = { logged: [] as SetLog[], last: null, repMin: 8, repMax: 12 };
  it('nothing known: bodyweight at the bottom of the range', () => {
    expect(initialDraft(base)).toEqual({ weightKg: 0, reps: 8, rpe: null, tag: 'normal' });
    expect(initialDraft({ ...base, planReps: 10 }).reps).toBe(10);
  });
  it('last time fills weight and the first rep count', () => {
    expect(initialDraft({ ...base, last: { weightKg: 60, reps: [10, 10, 9], trend: null } })).toMatchObject({ weightKg: 60, reps: 10 });
  });
  it('the overload suggestion beats last time', () => {
    expect(initialDraft({ ...base, last: { weightKg: 60, reps: [12], trend: 'up' }, suggestion: { weightKg: 62.5, reps: [8, 8], note: 'add_weight' } })).toMatchObject({ weightKg: 62.5, reps: 8 });
  });
  it('a suggestion of 0 (bodyweight) is used as 0', () => {
    expect(initialDraft({ ...base, suggestion: { weightKg: 0, reps: [11], note: 'bodyweight' } })).toMatchObject({ weightKg: 0, reps: 11 });
  });
  it('what you just logged beats everything; warm-ups do not count', () => {
    const logged = [w(40, 8, { tag: 'warmup' }), w(65, 7)];
    expect(initialDraft({ ...base, logged, suggestion: { weightKg: 62.5, reps: [8], note: 'add_weight' } })).toMatchObject({ weightKg: 65, reps: 7 });
    expect(initialDraft({ ...base, logged: [w(40, 8, { tag: 'warmup' })], last: { weightKg: 60, reps: [10], trend: null } })).toMatchObject({ weightKg: 60 });
  });
  it('the weight step is the machine step or 2.5', () => {
    expect(weightStep(5)).toBe(5);
    expect(weightStep(null)).toBe(2.5);
    expect(weightStep(0)).toBe(2.5);
  });
});

describe('set rows on a session', () => {
  it('the first set moves the item to doing; logging never touches the other item', () => {
    const s = addSet(fresh(), 0, w(60, 10));
    expect(s.items[0]!.status).toBe('doing');
    expect(s.items[0]!.sets).toHaveLength(1);
    expect(s.items[1]!.sets).toHaveLength(0);
  });
  it('delete, then Undo puts the set back in the same place', () => {
    let s = addSet(addSet(addSet(fresh(), 0, w(60, 10)), 0, w(62.5, 8)), 0, w(65, 6));
    const res = deleteSet(s, 0, 1);
    expect(res.removed?.weightKg).toBe(62.5);
    expect(res.session.items[0]!.sets.map((x) => x.weightKg)).toEqual([60, 65]);
    s = restoreSet(res.session, 0, 1, res.removed!);
    expect(s.items[0]!.sets.map((x) => x.weightKg)).toEqual([60, 62.5, 65]);
  });
  it('deleting the only set of a doing item sends it back to todo; a done item stays done', () => {
    const one = addSet(fresh(), 0, w(60, 10));
    expect(deleteSet(one, 0, 0).session.items[0]!.status).toBe('todo');
    const fin = { ...one, items: one.items.map((it, i) => (i === 0 ? { ...it, status: 'done' as const } : it)) };
    expect(deleteSet(fin, 0, 0).session.items[0]!.status).toBe('done');
  });
  it('a missing set or item changes nothing', () => {
    const s = addSet(fresh(), 0, w(60, 10));
    expect(deleteSet(s, 0, 5).session).toBe(s);
    expect(deleteSet(s, 9, 0).session).toBe(s);
    expect(editSet(s, 9, 0, { reps: 3 })).toBe(s);
    expect(duplicateSet(s, 0, 4, at).items[0]!.sets).toHaveLength(1);
  });
  it('duplicate copies the set right after itself with a new time and no rest figure', () => {
    const s = addSet(addSet(fresh(), 0, w(60, 10, { rpe: 8, restSec: 90 })), 0, w(65, 6));
    const c = duplicateSet(s, 0, 0, '2026-11-20T06:05:00.000Z');
    expect(c.items[0]!.sets.map((x) => x.weightKg)).toEqual([60, 60, 65]);
    expect(c.items[0]!.sets[1]).toEqual({ weightKg: 60, reps: 10, rpe: 8, tag: 'normal', doneAt: '2026-11-20T06:05:00.000Z' });
  });
  it('edit changes only the chosen set; warm-up drops its RPE', () => {
    const s = addSet(addSet(fresh(), 0, w(60, 10, { rpe: 8 })), 0, w(60, 9));
    const e = editSet(s, 0, 0, { reps: 11 });
    expect(e.items[0]!.sets.map((x) => x.reps)).toEqual([11, 9]);
    const wu = editSet(s, 0, 0, { tag: 'warmup' });
    expect(wu.items[0]!.sets[0]!.rpe).toBeUndefined();
    expect(wu.items[0]!.sets[0]!.tag).toBe('warmup');
  });
  it('the ramp adds warm-up sets that stay out of volume and PR maths', () => {
    const s = addSet(addRamp(fresh(), 0, [{ weightKg: 50, reps: 8 }, { weightKg: 70, reps: 5 }, { weightKg: 85, reps: 3 }], at), 0, w(100, 5));
    expect(s.items[0]!.sets.map((x) => x.tag)).toEqual(['warmup', 'warmup', 'warmup', 'normal']);
    const st = sessionStats(s.items[0]!.sets);
    expect(st.workingSets).toBe(1);
    expect(st.volume).toBe(500);
    expect(st.topWeight).toBe(100);
  });
  it('autosave shape: every reducer returns a plain Session that survives JSON', () => {
    const s = editSet(duplicateSet(addSet(fresh(), 0, w(60, 10)), 0, 0, at), 0, 1, { reps: 9 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('swipeAction', () => {
  it('left deletes, right copies, short or vertical moves do nothing', () => {
    expect(swipeAction(-80, 4)).toBe('delete');
    expect(swipeAction(80, -4)).toBe('duplicate');
    expect(swipeAction(-40, 0)).toBeNull();
    expect(swipeAction(-90, 80)).toBeNull();
    expect(swipeAction(70, 40)).toBe('duplicate');
    expect(swipeAction(0, 0)).toBeNull();
  });
});

describe('sanitizePrefs', () => {
  it('defaults for nothing or rubbish', () => {
    expect(sanitizePrefs(undefined)).toEqual(DEFAULT_LOGGER_PREFS);
    expect(sanitizePrefs('x')).toEqual(DEFAULT_LOGGER_PREFS);
    expect(sanitizePrefs({ mode: 'weird', big: 'yes', barKg: -4, plates: [] })).toEqual(DEFAULT_LOGGER_PREFS);
  });
  it('keeps good values, sorts and de-duplicates plates', () => {
    expect(sanitizePrefs({ mode: 'advanced', big: true, barKg: 15, plates: [5, 20, 20, 1.25, 'x', -3] })).toEqual({ mode: 'advanced', big: true, barKg: 15, plates: [20, 5, 1.25] });
  });
});

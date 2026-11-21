import { describe, expect, it } from 'vitest';
import type { Routine, RoutineItem } from '../../src/shared/routine';
import {
  addDay, addItem, dayVolume, estimateMinutes, insertItem, linkSuperset, moveItem, newItem, overloadHints, removeDay, removeItem, renameRoutine,
  restoreDay, supersetLabels, unlinkSuperset, validateItemPatch, weeklyVolume, WEEKLY_SET_CAP, type MuscleLookup,
} from '../../src/shared/routineEdit';

const lib = (slug: string): RoutineItem => newItem({ kind: 'lib', slug });
const four = (slug: string): RoutineItem => ({ ...lib(slug), sets: 4 });
const slugs = (items: RoutineItem[]) => items.map((i) => (i.ref.kind === 'lib' ? i.ref.slug : i.ref.id));
let n = 0;
const gid = () => `g${++n}`;

const MAP: Record<string, Array<[string, string, string]>> = {
  bench: [['chest', 'p', 'h'], ['triceps', 's', 'm'], ['stab', 't', 'h']],
  fly: [['chest', 'p', 'h']],
  squat: [['quads', 'p', 'h'], ['glutes', 's', 'm']],
  row: [['back', 'p', 'h']],
};
const lookup: MuscleLookup = (ref) => (ref.kind === 'lib' ? MAP[ref.slug] ?? [] : []);
const routine = (days: RoutineItem[][]): Routine => ({
  id: 'r', name: 'R', source: 'mine', daysPerWeek: days.length, weekdays: [], splitStyle: 'custom', active: false,
  days: days.map((items, i) => ({ id: `d${i + 1}`, name: `Day ${i + 1}`, targetMuscles: [], items })),
});

describe('reorder', () => {
  const a = ['a', 'b', 'c', 'd'];
  it('moves down, up, to the ends', () => {
    expect(moveItem(a, 0, 1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveItem(a, 3, 2)).toEqual(['a', 'b', 'd', 'c']);
    expect(moveItem(a, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveItem(a, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('ignores out-of-range and same-place moves and never changes the input', () => {
    expect(moveItem(a, -1, 2)).toEqual(a);
    expect(moveItem(a, 1, 9)).toEqual(a);
    expect(moveItem(a, 2, 2)).toEqual(a);
    expect(a).toEqual(['a', 'b', 'c', 'd']);
  });
  it('add keeps order, allows the same exercise twice, never blocks a long day', () => {
    let items: RoutineItem[] = [];
    for (let i = 0; i < 15; i += 1) items = addItem(items, { kind: 'lib', slug: i % 2 ? 'x' : 'y' });
    expect(items).toHaveLength(15);
    expect(items[0]!.sets).toBe(3);
  });
  it('remove returns the item and Undo puts it back in place', () => {
    const items = ['a', 'b', 'c'].map(lib);
    const r = removeItem(items, 1);
    expect(slugs(r.items)).toEqual(['a', 'c']);
    expect(slugs(insertItem(r.items, 1, r.removed!))).toEqual(['a', 'b', 'c']);
    expect(removeItem(items, 7).removed).toBeUndefined();
  });
});

describe('supersets', () => {
  it('links two items, they sit together, labelled A', () => {
    const items = linkSuperset(['a', 'b', 'c', 'd'].map(lib), 0, 2, gid);
    expect(items).toHaveLength(4);
    expect(slugs(items).sort()).toEqual(['a', 'b', 'c', 'd']);
    const idx = items.map((i, k) => (i.supersetGroup ? k : -1)).filter((k) => k >= 0);
    expect(idx).toHaveLength(2);
    expect(Math.abs(idx[0]! - idx[1]!)).toBe(1);
    expect(new Set(items.filter((i) => i.supersetGroup).map((i) => i.supersetGroup)).size).toBe(1);
    expect(items.filter((i) => i.supersetGroup).every((i) => i.tag === 'superset')).toBe(true);
    expect([...supersetLabels(items).values()]).toEqual(['A', 'A']);
  });
  it('a third item joins the existing group', () => {
    let items = linkSuperset(['a', 'b', 'c'].map(lib), 0, 1, gid);
    items = linkSuperset(items, 2, 1, gid);
    expect(new Set(items.map((i) => i.supersetGroup)).size).toBe(1);
  });
  it('unlinking one of two clears both; of three leaves a pair', () => {
    const two = linkSuperset(['a', 'b'].map(lib), 0, 1, gid);
    expect(unlinkSuperset(two, 0).some((i) => i.supersetGroup)).toBe(false);
    let three = linkSuperset(['a', 'b', 'c'].map(lib), 0, 1, gid);
    three = linkSuperset(three, 2, 1, gid);
    expect(unlinkSuperset(three, 0).filter((i) => i.supersetGroup)).toHaveLength(2);
  });
  it('removing a member of a pair clears the other one', () => {
    const two = linkSuperset(['a', 'b', 'c'].map(lib), 0, 1, gid);
    const r = removeItem(two, 0);
    expect(r.items.some((i) => i.supersetGroup)).toBe(false);
  });
  it('linking an item with itself or out of range changes nothing', () => {
    const items = ['a', 'b'].map(lib);
    expect(linkSuperset(items, 0, 0, gid)).toEqual(items);
    expect(linkSuperset(items, 0, 5, gid)).toEqual(items);
  });
});

describe('item sheet checks', () => {
  const base = lib('a');
  it('accepts good values and drops empty note/variation', () => {
    const r = validateItemPatch(base, { sets: 5, repMin: 6, repMax: 6, restSec: 120, note: '' });
    expect(r.ok).toBe(true);
    if (r.ok) expect('note' in r.value).toBe(false);
  });
  it('rejects bad ones with a named reason', () => {
    expect(validateItemPatch(base, { sets: 0 })).toEqual({ ok: false, error: 'sets_range' });
    expect(validateItemPatch(base, { sets: 11 })).toEqual({ ok: false, error: 'sets_range' });
    expect(validateItemPatch(base, { repMin: 12, repMax: 8 })).toEqual({ ok: false, error: 'rep_order' });
    expect(validateItemPatch(base, { repMin: 8.5 })).toEqual({ ok: false, error: 'rep_range' });
    expect(validateItemPatch(base, { restSec: 10 })).toEqual({ ok: false, error: 'rest_range' });
    expect(validateItemPatch(base, { restSec: 100 })).toEqual({ ok: false, error: 'rest_range' });
    expect(validateItemPatch(base, { restSec: 615 })).toEqual({ ok: false, error: 'rest_range' });
    expect(validateItemPatch(base, { note: 'x'.repeat(501) })).toEqual({ ok: false, error: 'note_too_long' });
  });
});

describe('days and rename', () => {
  it('adds up to 7 days and then says no', () => {
    let r: Routine | null = routine([[], []]);
    let k = 0;
    for (let i = 0; i < 5; i += 1) r = addDay(r!, () => `n${++k}`);
    expect(r!.days).toHaveLength(7);
    expect(r!.daysPerWeek).toBe(7);
    expect(addDay(r!, () => 'z')).toBeNull();
  });
  it('removes a day with Undo and never the last one', () => {
    const r = routine([[lib('a')], [lib('b')]]);
    const gone = removeDay(r, 'd1')!;
    expect(gone.routine.days.map((d) => d.id)).toEqual(['d2']);
    expect(gone.routine.daysPerWeek).toBe(1);
    expect(removeDay(gone.routine, 'd2')).toBeNull();
    expect(restoreDay(gone.routine, gone.removed, gone.index).days.map((d) => d.id)).toEqual(['d1', 'd2']);
  });
  it('rename: trims, rejects empty/long/taken, allows its own name', () => {
    const r = routine([[]]);
    const ok = renameRoutine(r, '  Push   focus ', ['Other']);
    expect(ok.ok && ok.value.name).toBe('Push focus');
    expect(renameRoutine(r, '  ')).toEqual({ ok: false, error: 'name_empty' });
    expect(renameRoutine(r, 'x'.repeat(41))).toEqual({ ok: false, error: 'name_too_long' });
    expect(renameRoutine(r, 'other', ['Other'])).toEqual({ ok: false, error: 'name_taken' });
    expect(renameRoutine(r, 'r', ['R']).ok).toBe(true);
  });
});

describe('planned volume', () => {
  it('weights sets by role and emphasis (stabiliser halves)', () => {
    const v = dayVolume([lib('bench')], lookup);
    expect(v.chest).toBe(3);
    expect(v.triceps).toBe(1.8);
    expect(v.stab).toBe(1.5);
  });
  it('adds days up, sorted biggest first, unknown exercises count nothing', () => {
    const r = routine([[lib('bench'), lib('nothing')], [lib('fly'), lib('squat')]]);
    const w = weeklyVolume(r, lookup);
    expect(w[0]).toEqual({ muscle: 'chest', sets: 6 });
    expect(w.map((x) => x.muscle)).toContain('quads');
  });
});

describe('overload detector', () => {
  it('flags a muscle on two consecutive days', () => {
    const r = routine([[four('bench')], [four('fly')], [lib('squat')]]);
    const h = overloadHints(r, lookup);
    expect(h).toContainEqual({ kind: 'back_to_back', muscle: 'chest', dayIds: ['d1', 'd2'] });
  });
  it('does not flag when days are apart, or when the volume is small', () => {
    expect(overloadHints(routine([[four('bench')], [lib('squat')], [lib('row')]]), lookup).filter((x) => x.kind === 'back_to_back')).toEqual([]);
    const small = { ...lib('fly'), sets: 3 }; // 3 weighted sets < 4
    expect(overloadHints(routine([[small], [small]]), lookup)).toEqual([]);
  });
  it('wraps from the last day to the first, but a 2-day routine reports once', () => {
    const wrap = overloadHints(routine([[four('bench')], [lib('squat')], [four('fly')]]), lookup);
    expect(wrap).toContainEqual({ kind: 'back_to_back', muscle: 'chest', dayIds: ['d3', 'd1'] });
    const two = overloadHints(routine([[four('bench')], [four('fly')]]), lookup).filter((x) => x.muscle === 'chest');
    expect(two).toHaveLength(1);
  });
  it('flags weekly volume above the cap when no day is adjacent', () => {
    const f10 = { ...lib('fly'), sets: 10 };
    const f11 = { ...lib('fly'), sets: 11 };
    const hints = overloadHints(routine([[f10], [lib('squat')], [f11], [lib('squat')]]), lookup);
    expect(hints).toContainEqual({ kind: 'weekly_cap', muscle: 'chest', sets: 21 });
    expect(hints.some((x) => x.kind === 'back_to_back' && x.muscle === 'chest')).toBe(false);
    expect(WEEKLY_SET_CAP).toBe(20);
  });
  it('one hint per muscle: back-to-back wins over the weekly cap', () => {
    const big = { ...lib('fly'), sets: 12 };
    const chest = overloadHints(routine([[big], [big]]), lookup).filter((x) => x.muscle === 'chest');
    expect(chest).toHaveLength(1);
    expect(chest[0]!.kind).toBe('back_to_back');
  });
  it('an empty routine has no hints', () => {
    expect(overloadHints(routine([[], [], []]), lookup)).toEqual([]);
  });
});

describe('estimate', () => {
  it('is 0 for an empty day and rounds up to 5 minutes', () => {
    expect(estimateMinutes([])).toBe(0);
    expect(estimateMinutes([lib('a')])).toBe(10); // 3 x (45+90) = 405 s = 6.75 min -> 10
    expect(estimateMinutes([lib('a'), lib('b'), lib('c'), lib('d')])).toBe(30); // 27 min -> 30
  });
});

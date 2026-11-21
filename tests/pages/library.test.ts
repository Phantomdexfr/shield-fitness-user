import { describe, expect, test } from 'vitest';
import { buildSearchIndex, runSearch } from '../../src/dataset/search';
import type { ExerciseRow, Machine } from '../../src/dataset/loader';
import { allowsMachine, EQUIPMENT_PRESETS, isPreset } from '../../src/shared/equipment';
import {
  addRecent, countBy, filterMachines, machineCategories, parseLibraryUrl, refineExercises, removeRecent, serializeLibraryUrl, sheetFilterCount,
  type LibraryState,
} from '../../src/pages/library/libraryState';

const ex = (slug: string, name: string, o: Partial<ExerciseRow> = {}): ExerciseRow => ({
  slug, name, category: 'compound', subCategory: 'press', kind: 'strength', machine: '', primary: ['chest'], difficulty: 2,
  unilateral: false, beginner: false, tracks: 0, warmup: false, chunk: 0, custom: false, ...o,
});
const rows: ExerciseRow[] = [
  ex('bench-press', 'Bench Press', { machine: 'flat-bench' }),
  ex('incline-bench-press', 'Incline Bench Press', { machine: 'adjustable-bench', difficulty: 3 }),
  ex('dumbbell-fly', 'Dumbbell Fly', { category: 'isolation', subCategory: 'fly', machine: 'dumbbells-and-rack', beginner: true }),
  ex('cable-fly', 'Cable Fly', { category: 'isolation', subCategory: 'fly', machine: 'cable-crossover' }),
  ex('push-up', 'Push Up', { kind: 'bodyweight', subCategory: 'press', beginner: true }),
  ex('single-arm-row', 'Single Arm Row', { category: 'compound', subCategory: 'row', unilateral: true, machine: 'dumbbells-and-rack' }),
  ex('my-push', 'My Push', { category: 'custom', subCategory: '', custom: true }),
];
const machine = (slug: string, name: string, category: string, status = 'active'): Machine => ({
  slug, name, brand: 'Jerai Fitness', category, zone: null, stepKg: null, quantity: 1, status, cues: [], muscles: [], detailed: [],
});
const machines = [
  machine('lat-pulldown', 'Lat Pulldown', 'strength_machine'),
  machine('cable-crossover', 'Cable Crossover', 'cable'),
  machine('flat-bench', 'Flat Bench', 'free_weight'),
  machine('dumbbells-and-rack', 'Dumbbells and Rack', 'free_weight'),
  machine('treadmill', 'Treadmill', 'cardio', 'maintenance'),
];

describe('URL <-> filter state', () => {
  const full: LibraryState = {
    tab: 'exercises', q: 'bench press', category: 'compound', sub: 'press', kind: 'strength', difficulty: 3, beginner: true, unilateral: true, machine: 'flat-bench',
  };
  test('round trip keeps every field', () => {
    expect(parseLibraryUrl(serializeLibraryUrl(full))).toEqual(full);
    const m: LibraryState = { tab: 'machines', q: 'lat', mcat: 'strength_machine' };
    expect(parseLibraryUrl(serializeLibraryUrl(m))).toEqual(m);
  });
  test('defaults leave the URL empty; order is stable', () => {
    expect(serializeLibraryUrl({ tab: 'exercises', q: '' })).toBe('');
    expect(serializeLibraryUrl({ tab: 'exercises', q: '   ' })).toBe('');
    expect(serializeLibraryUrl(full)).toBe(serializeLibraryUrl({ ...full }));
    expect(serializeLibraryUrl(full)).toBe('?q=bench+press&cat=compound&sub=press&kind=strength&diff=3&beginner=1&uni=1&machine=flat-bench');
  });
  test('works with and without the leading ?', () => {
    expect(parseLibraryUrl('?tab=machines&q=x')).toEqual(parseLibraryUrl('tab=machines&q=x'));
  });
  test('bad values are ignored, so any URL gives a valid state', () => {
    const s = parseLibraryUrl('?tab=nonsense&diff=9&cat=BAD%20VALUE&machine=../x&beginner=yes&uni=0&kind=');
    expect(s).toEqual({ tab: 'exercises', q: '' });
    expect(parseLibraryUrl('?q=' + 'a'.repeat(500)).q.length).toBe(80);
  });
  test('sheet filter count counts only the sheet filters', () => {
    expect(sheetFilterCount(full)).toBe(5);
    expect(sheetFilterCount({ tab: 'exercises', q: 'x', category: 'compound', sub: 'press' })).toBe(0);
  });
});

describe('search as you type with fixtures', () => {
  const index = buildSearchIndex(rows, { machines: new Map(machines.map((m) => [m.slug, m.name])), muscles: new Map([['chest', 'Chest']]) });
  const find = (q: string, s: Partial<LibraryState> = {}, preset: Parameters<typeof refineExercises>[2] = 'gym') =>
    refineExercises(runSearch(index, q).map((h) => h.row), { tab: 'exercises', q, ...s }, preset).map((r) => r.slug);

  test('each extra letter narrows the list; an empty box browses everything', () => {
    expect(find('')).toHaveLength(rows.length);
    const b = find('ben');
    expect(b).toContain('bench-press');
    expect(find('bench')).toEqual(expect.arrayContaining(['bench-press', 'incline-bench-press']));
    expect(find('incline bench')[0]).toBe('incline-bench-press');
    expect(find('zzzzzz')).toEqual([]);
  });
  test('category, sub-category and unilateral filters', () => {
    expect(find('', { category: 'isolation' }).sort()).toEqual(['cable-fly', 'dumbbell-fly']);
    expect(find('', { category: 'isolation', sub: 'fly' })).toHaveLength(2);
    expect(find('', { category: 'compound', sub: 'fly' })).toEqual([]);
    expect(find('', { unilateral: true })).toEqual(['single-arm-row']);
  });
  test('counts for the chips are biggest first, empty names left out', () => {
    expect(countBy(rows, 'category')).toEqual([{ value: 'compound', n: 4 }, { value: 'isolation', n: 2 }, { value: 'custom', n: 1 }]);
    expect(countBy(rows, 'subCategory').map((c) => c.value)).toEqual(['press', 'fly', 'row']);
  });
});

describe('equipment mode', () => {
  test('presets only filter: gym allows everything', () => {
    expect(EQUIPMENT_PRESETS).toEqual(['gym', 'bodyweight', 'dumbbells', 'bands', 'home']);
    expect(isPreset('home')).toBe(true);
    expect(isPreset('hotel')).toBe(false);
    for (const m of ['cable-crossover', 'lat-pulldown', '']) expect(allowsMachine('gym', m)).toBe(true);
  });
  test('no-machine exercises are always allowed', () => {
    for (const p of EQUIPMENT_PRESETS) expect(allowsMachine(p, '')).toBe(true);
  });
  test('bodyweight, dumbbells and home keep only their gear', () => {
    const slugs = (p: Parameters<typeof refineExercises>[2]) => refineExercises(rows, { tab: 'exercises', q: '' }, p).map((r) => r.slug);
    expect(slugs('bodyweight')).toEqual(['push-up', 'my-push']);
    expect(slugs('dumbbells')).toEqual(['dumbbell-fly', 'push-up', 'single-arm-row', 'my-push']);
    expect(slugs('home')).toEqual(['bench-press', 'incline-bench-press', 'dumbbell-fly', 'push-up', 'single-arm-row', 'my-push']);
    expect(slugs('gym')).toHaveLength(rows.length);
  });
  test('machines tab follows the preset and the category chips', () => {
    const s = { tab: 'machines', q: '' } as const;
    expect(filterMachines(machines, s, 'gym').map((m) => m.slug)).toEqual(['cable-crossover', 'dumbbells-and-rack', 'flat-bench', 'lat-pulldown', 'treadmill']);
    expect(filterMachines(machines, s, 'dumbbells').map((m) => m.slug)).toEqual(['dumbbells-and-rack']);
    expect(machineCategories(machines, 'home')).toEqual([{ value: 'free_weight', n: 2 }]);
  });
});

describe('machines tab', () => {
  test('text search covers name, brand and category; category chip filters', () => {
    const s = (q: string, mcat?: string) => filterMachines(machines, { tab: 'machines', q, mcat }, 'gym').map((m) => m.slug);
    expect(s('lat')).toEqual(['lat-pulldown']);
    expect(s('cable cross')).toEqual(['cable-crossover']);
    expect(s('jerai')).toHaveLength(5);
    expect(s('strength machine')).toEqual(['lat-pulldown']);
    expect(s('', 'free_weight')).toEqual(['dumbbells-and-rack', 'flat-bench']);
    expect(s('nothing')).toEqual([]);
  });
});

describe('recent searches', () => {
  test('newest first, no duplicates, short text ignored, capped at 8', () => {
    let l: string[] = [];
    l = addRecent(l, 'bench');
    l = addRecent(l, 'lat pulldown');
    l = addRecent(l, '  Bench  ');
    expect(l).toEqual(['Bench', 'lat pulldown']);
    expect(addRecent(l, 'a')).toEqual(l);
    expect(addRecent(l, '   ')).toEqual(l);
    for (let i = 0; i < 12; i += 1) l = addRecent(l, `query ${i}`);
    expect(l).toHaveLength(8);
    expect(l[0]).toBe('query 11');
  });
  test('remove ignores case and does not change the input', () => {
    const l = ['Bench', 'curl'];
    expect(removeRecent(l, 'bench')).toEqual(['curl']);
    expect(l).toEqual(['Bench', 'curl']);
  });
});

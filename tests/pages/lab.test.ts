import { describe, expect, test } from 'vitest';
import { buildTaxonomy } from '../../src/shared/muscles';
import {
  activeFilterCount, countByMuscle, emphasisOf, filterChoices, labList, machineFinder, machineWorkedRows, surpriseMe, toCandidate, workedRows,
  type LabRow,
} from '../../src/pages/body/labData';
import type { MapRow } from '../../src/dataset/loader';

const tax = buildTaxonomy([
  { id: 'chest', parent: 'chest' }, { id: 'upper_chest', parent: 'chest' }, { id: 'lower_chest', parent: 'chest' },
  { id: 'biceps', parent: 'biceps' }, { id: 'lats', parent: 'lats' },
]);
const DAY = '2026-11-19';

const row = (slug: string, o: Partial<LabRow> = {}): LabRow => ({
  slug, name: slug, category: 'compound', kind: 'strength', machine: '', difficulty: 2, unilateral: false, beginner: false, tracks: 0, ...o,
});
const chest = (e: string): MapRow[] => [['upper_chest', 'p', e, 0]];

// Six strong chest exercises, two medium, one low that sits in the plan, one low that does not, one custom (low).
const fixture = () => {
  const list = [];
  for (const s of ['strong-a', 'strong-b', 'strong-c', 'strong-d', 'strong-e', 'strong-f']) list.push(toCandidate(row(s, { machine: s === 'strong-a' ? 'pec-deck' : '' }), chest('h')));
  list.push(toCandidate(row('medium-a', { beginner: true, difficulty: 1 }), chest('m')));
  list.push(toCandidate(row('medium-b', { unilateral: true, category: 'isolation' }), chest('m')));
  list.push(toCandidate(row('plan-low'), chest('l')));
  list.push(toCandidate(row('other-low'), chest('l')));
  list.push(toCandidate(row('my-fly', { custom: true, category: 'custom' }), chest('l')));
  list.push(toCandidate(row('curl'), [['biceps', 'p', 'h', 0]]));
  return list;
};
const person = { routineSlugs: new Set(['plan-low']), customSlugs: new Set(['my-fly']) };

describe('list order (fixture user)', () => {
  const l = labList(fixture(), 'chest', tax, DAY, person);
  const slugs = (xs: Array<{ slug: string }>) => xs.map((x) => x.slug);

  test('Suggested is the top six; plan and custom items land in section 2 (Built for you)', () => {
    expect(l.suggested).toHaveLength(6);
    expect(slugs(l.suggested).every((s) => s.startsWith('strong-'))).toBe(true);
    expect(slugs(l.built).sort()).toEqual(['my-fly', 'plan-low']);
    expect(slugs(l.more).sort()).toEqual(['medium-a', 'medium-b', 'other-low']);
  });
  test('an exercise is in one section only and other muscles are left out', () => {
    const all = [...l.suggested, ...l.built, ...l.more].map((r) => r.slug);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain('curl');
  });
  test('without a plan there is no built section for the plan item', () => {
    const none = labList(fixture(), 'chest', tax, DAY, {});
    expect(none.built).toHaveLength(0);
    expect(none.more.map((r) => r.slug)).toContain('plan-low');
  });
  test('same day, same order; surprise me picks from the three sections', () => {
    const again = labList(fixture(), 'chest', tax, DAY, person);
    expect(again.more.map((r) => r.slug)).toEqual(l.more.map((r) => r.slug));
    const pick = surpriseMe(l, DAY, 0);
    expect(pick && [...l.suggested, ...l.built, ...l.more].some((r) => r.slug === pick.slug)).toBe(true);
    expect(surpriseMe({ suggested: [], built: [], more: [], unavailable: [] }, DAY, 0)).toBeUndefined();
  });
  test('why chips: plan and custom items carry their reasons, favourites show too', () => {
    const fav = labList(fixture(), 'chest', tax, DAY, { ...person, favourites: new Set(['strong-a']) });
    const all = [...fav.suggested, ...fav.built, ...fav.more];
    const code = (s: string) => all.find((r) => r.slug === s)?.reasons.map((x) => x.code);
    expect(code('plan-low')).toEqual(['in_routine']);
    expect(code('my-fly')).toEqual(['built_by_you']);
    expect(code('strong-a')).toEqual(['favourite']);
    expect(code('other-low')).toEqual([]);
  });
});

describe('filters', () => {
  const run = (f: Parameters<typeof labList>[5]) => {
    const l = labList(fixture(), 'chest', tax, DAY, person, f);
    return [...l.suggested, ...l.built, ...l.more].map((r) => r.slug).sort();
  };
  test('equipment: a machine, and "no machine"', () => {
    expect(run({ machine: 'pec-deck' })).toEqual(['strong-a']);
    expect(run({ machine: '' })).not.toContain('strong-a');
    expect(run({ machine: '' })).toHaveLength(10);
  });
  test('category, kind, difficulty', () => {
    expect(run({ category: 'isolation' })).toEqual(['medium-b']);
    expect(run({ category: 'custom' })).toEqual(['my-fly']);
    expect(run({ kind: 'cardio' })).toEqual([]);
    expect(run({ difficulty: 1 })).toEqual(['medium-a']);
  });
  test('unilateral and beginner friendly', () => {
    expect(run({ unilateral: true })).toEqual(['medium-b']);
    expect(run({ beginnerFriendly: true })).toEqual(['medium-a']);
  });
  test('track: a custom exercise never matches a track filter', () => {
    const c = fixture().map((x) => (x.slug === 'strong-b' ? { ...x, tracks: 32 } : x));
    const l = labList(c, 'chest', tax, DAY, person, { track: 'strength' });
    expect([...l.suggested, ...l.built, ...l.more].map((r) => r.slug)).toEqual(['strong-b']);
  });
  test('filters combine (all must match) and count', () => {
    expect(run({ difficulty: 1, unilateral: true })).toEqual([]);
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ machine: '', difficulty: 2, unilateral: true, beginnerFriendly: false })).toBe(3);
  });
  test('filter choices come from the muscle pool only', () => {
    const ch = filterChoices(fixture(), 'chest', tax);
    expect(ch.machines).toEqual(['', 'pec-deck']);
    expect(ch.categories).toEqual(['compound', 'custom', 'isolation']);
    expect(ch.difficulties).toEqual([1, 2]);
  });
  test('an avoid mark hides exercises that load the muscle at medium or high; a hidden exercise never shows', () => {
    const l = labList(fixture(), 'chest', tax, DAY, { ...person, avoid: new Set(['upper_chest']), hidden: new Set(['plan-low']) });
    // strong (h) and medium (m) primary rows are hidden; low rows stay (engines.md 6); plan-low is hidden by the person.
    expect([...l.suggested, ...l.built, ...l.more].map((r) => r.slug).sort()).toEqual(['my-fly', 'other-low']);
  });
  test('a machine in maintenance is left out', () => {
    const l = labList(fixture(), 'chest', tax, DAY, person, {}, { 'pec-deck': 'maintenance' });
    expect([...l.suggested, ...l.built, ...l.more].map((r) => r.slug)).not.toContain('strong-a');
  });
});

describe('counts, muscles worked, machine finder', () => {
  test('counts include children and skip mobility-only rows', () => {
    const c = [...fixture(), toCandidate(row('stretch'), [['upper_chest', 'm', 'h', 0]])];
    const n = countByMuscle(c, ['chest', 'upper_chest', 'biceps', 'lats'], tax);
    expect(n).toEqual({ chest: 11, upper_chest: 11, biceps: 1, lats: 0 });
  });
  test('workedRows: strongest first, mobility dropped, best role per muscle wins', () => {
    const rows = workedRows([['chest', 's', 'h', 0], ['chest', 'p', 'm', 0], ['triceps', 's', 'm', 0], ['lats', 'p', 'h', 0], ['neck', 'm', 'h', 0], ['abs', 't', 'l', 0]]);
    expect(rows.map((r) => [r.muscle, r.role, r.band])).toEqual([
      ['lats', 'primary', 'high'], ['chest', 'primary', 'medium'], ['triceps', 'secondary', 'medium'], ['abs', 'stabiliser', 'low'],
    ]);
    expect(emphasisOf(rows)).toEqual({ lats: 'primary', chest: 'primary', triceps: 'secondary' });
  });
  const reach = { machines: { 'pec-deck': { n: 3, all: [['upper_chest', 1, 4], ['front_delts', 0.3, 1]] }, 'cable': { n: 9, all: [['lower_chest', 0.6, 7]] }, 'broken': { n: 1, all: [['lower_chest', 1, 9]] }, 'leg': { n: 2, all: [['quads', 1, 2]] } } };
  const machines = [{ slug: 'pec-deck', name: 'Pec Deck' }, { slug: 'cable', name: 'Cable' }, { slug: 'broken', name: 'Broken', status: 'out_of_order' }, { slug: 'leg', name: 'Leg' }];
  test('machine finder: strongest weight first, children of a core id count, broken and unrelated machines skipped', () => {
    expect(machineFinder(reach, 'chest', tax, machines).map((m) => m.slug)).toEqual(['pec-deck', 'cable']);
    expect(machineFinder(reach, 'lower_chest', tax, machines).map((m) => m.slug)).toEqual(['cable']);
    expect(machineFinder(reach, 'chest', tax, machines, 1)).toHaveLength(1);
    expect(machineFinder(null, 'chest', tax, machines)).toEqual([]);
  });
  test('machine worked rows: weight 1 is primary', () => {
    expect(machineWorkedRows(reach, 'pec-deck').map((r) => [r.muscle, r.role])).toEqual([['upper_chest', 'primary'], ['front_delts', 'secondary']]);
    expect(machineWorkedRows(reach, 'nope')).toEqual([]);
  });
});

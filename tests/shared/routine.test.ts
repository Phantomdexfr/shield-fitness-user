import { describe, expect, test } from 'vitest';
import { cloneRoutine, createRoutine, freeName, normaliseWeekdays, splitDays, validateRoutine, validateRoutineName, weekdayMismatch, type Routine, type RoutineInput } from '../../src/shared/routine';

const ids = (prefix = 'id') => {
  let n = 0;
  return () => `${prefix}${(n += 1)}`;
};
const input = (o: Partial<RoutineInput> = {}): RoutineInput => ({ name: 'Push pull', days: 3, weekdays: [], splitStyle: 'ppl', ...o });
const made = (o: Partial<RoutineInput> = {}, taken: string[] = []): Routine => {
  const r = createRoutine(input(o), ids(), taken);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('createRoutine: validation', () => {
  test('days 2 to 7 are accepted, others are not', () => {
    for (const d of [2, 3, 4, 5, 6, 7]) expect(createRoutine(input({ days: d }), ids()).ok).toBe(true);
    for (const d of [0, 1, 8, 2.5, -3]) expect(createRoutine(input({ days: d }), ids())).toEqual({ ok: false, error: 'days_range' });
  });
  test('flexible gives 3 days and no weekdays, even if weekdays were sent', () => {
    const r = made({ days: 'flexible', weekdays: [0, 2, 4] });
    expect(r.days).toHaveLength(3);
    expect(r.daysPerWeek).toBe(3);
    expect(r.weekdays).toEqual([]);
  });
  test('weekdays are sorted, de-duplicated and need not match the day count', () => {
    const r = made({ days: 3, weekdays: [4, 0, 4, 2, 6] });
    expect(r.weekdays).toEqual([0, 2, 4, 6]);
    expect(weekdayMismatch(3, [0, 2, 4, 6])).toBe(true);
    expect(weekdayMismatch(3, [])).toBe(false);
    expect(weekdayMismatch('flexible', [0])).toBe(false);
  });
  test('bad weekdays and unknown split are refused', () => {
    expect(createRoutine(input({ weekdays: [7] }), ids())).toEqual({ ok: false, error: 'weekday_invalid' });
    expect(createRoutine(input({ weekdays: [-1] }), ids())).toEqual({ ok: false, error: 'weekday_invalid' });
    expect(createRoutine(input({ weekdays: [1.5] }), ids())).toEqual({ ok: false, error: 'weekday_invalid' });
    expect(normaliseWeekdays([0, 6])).toEqual([0, 6]);
    expect(createRoutine(input({ splitStyle: 'arnold' as never }), ids())).toEqual({ ok: false, error: 'split_unknown' });
  });
  test('name: trimmed, 40 characters at most, blank becomes My routine then My routine 2', () => {
    expect(made({ name: '  Heavy   week  ' }).name).toBe('Heavy week');
    expect(createRoutine(input({ name: 'x'.repeat(41) }), ids())).toEqual({ ok: false, error: 'name_too_long' });
    expect(createRoutine(input({ name: 'x'.repeat(40) }), ids()).ok).toBe(true);
    expect(made({ name: '   ' }).name).toBe('My routine');
    expect(made({ name: '' }, ['My routine']).name).toBe('My routine 2');
    expect(made({ name: '' }, ['my routine', 'My routine 2']).name).toBe('My routine 3');
    expect(validateRoutineName('')).toEqual({ ok: false, error: 'name_empty' });
  });
  test('a new routine is mine, inactive, with empty days', () => {
    const r = made();
    expect(r.source).toBe('mine');
    expect(r.active).toBe(false);
    expect(r.days.every((d) => d.items.length === 0)).toBe(true);
  });
});

describe('day ids', () => {
  test('every day id is unique and different from the routine id', () => {
    for (const style of ['ppl', 'upper_lower', 'full_body', 'bro', 'custom'] as const) {
      for (const d of [2, 3, 4, 5, 6, 7]) {
        const r = made({ splitStyle: style, days: d });
        const all = [r.id, ...r.days.map((x) => x.id)];
        expect(new Set(all).size).toBe(all.length);
        expect(r.days).toHaveLength(d);
        expect(validateRoutine(r)).toEqual([]);
      }
    }
  });
  test('validateRoutine finds duplicates, missing ids, empty and too many days', () => {
    const r = made();
    expect(validateRoutine({ ...r, days: [r.days[0]!, { ...r.days[1]!, id: r.days[0]!.id }] })).toEqual(['day_id_duplicate']);
    expect(validateRoutine({ ...r, days: [{ ...r.days[0]!, id: '' }] })).toEqual(['day_id_missing']);
    expect(validateRoutine({ ...r, days: [] })).toEqual(['no_days']);
    expect(validateRoutine({ ...r, name: ' ', daysPerWeek: 9, weekdays: [8] })).toEqual(['name_empty', 'days_per_week', 'weekday_invalid']);
    expect(validateRoutine({ ...r, days: [{ ...r.days[0]!, name: ' ' }] })).toEqual(['day_name_empty']);
    const eight = Array.from({ length: 8 }, (_, i) => ({ ...r.days[0]!, id: `x${i}` }));
    expect(validateRoutine({ ...r, days: eight })).toEqual(['too_many_days']);
    expect(validateRoutine({ ...r, daysPerWeek: 1, days: [r.days[0]!] })).toEqual([]); // custom may have 1 day
  });
});

describe('splitDays', () => {
  test('PPL: 3 and 6 days are whole cycles, 4 repeats and says so', () => {
    expect(splitDays('ppl', 3).days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs']);
    expect(splitDays('ppl', 3).cycled).toBe(false);
    expect(splitDays('ppl', 6).days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs']);
    expect(splitDays('ppl', 6).cycled).toBe(true);
    expect(splitDays('ppl', 4).days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs', 'Push']);
    expect(splitDays('ppl', 4).cycled).toBe(true);
    expect(splitDays('ppl', 2).cycled).toBe(false);
  });
  test('Upper/Lower 3 days = Upper, Lower, Upper', () => {
    expect(splitDays('upper_lower', 3).days.map((d) => d.label)).toEqual(['Upper', 'Lower', 'Upper']);
    expect(splitDays('upper_lower', 4).cycled).toBe(true);
    expect(splitDays('upper_lower', 2).cycled).toBe(false);
  });
  test('Full body 4 = A to D; Bro 3 = Chest, Back, Shoulders; Bro 7 ends with Core and cardio, Mobility', () => {
    expect(splitDays('full_body', 4).days.map((d) => d.label)).toEqual(['Full body A', 'Full body B', 'Full body C', 'Full body D']);
    expect(splitDays('bro', 3).days.map((d) => d.label)).toEqual(['Chest', 'Back', 'Shoulders']);
    const bro7 = splitDays('bro', 7).days;
    expect(bro7.map((d) => d.label).slice(5)).toEqual(['Core and cardio', 'Mobility']);
    expect(bro7[6]!.muscles).toEqual([]);
    expect(splitDays('bro', 5).days.map((d) => d.label)).toEqual(['Chest', 'Back', 'Shoulders', 'Arms', 'Legs']);
  });
  test('Custom gives blank Day 1..N; muscles come from the table (PPL push)', () => {
    const c = splitDays('custom', 3);
    expect(c.days.map((d) => d.label)).toEqual(['Day 1', 'Day 2', 'Day 3']);
    expect(c.days.every((d) => d.muscles.length === 0)).toBe(true);
    expect(splitDays('ppl', 3).days[0]!.muscles).toEqual(['chest', 'front_delts', 'side_delts', 'triceps']);
  });
  test('returned muscle lists are copies (editing one day does not change the table)', () => {
    const a = splitDays('ppl', 3);
    a.days[0]!.muscles.push('forearms');
    expect(splitDays('ppl', 3).days[0]!.muscles).not.toContain('forearms');
  });
});

describe('cloneRoutine', () => {
  const withItem = (): Routine => {
    const r = made({ name: 'Mine' });
    r.days[0]!.items.push({ ref: { kind: 'lib', slug: 'barbell-bench-press' }, sets: 3, repMin: 8, repMax: 12, restSec: 90 });
    r.active = true;
    r.archived = true;
    return r;
  };
  test('new ids, name "<name> copy", inactive, not archived, items copied', () => {
    const src = withItem();
    const c = cloneRoutine(src, ids('copy'), ['Mine']);
    expect(c.id).not.toBe(src.id);
    expect(c.name).toBe('Mine copy');
    expect(c.active).toBe(false);
    expect(c.archived).toBeUndefined();
    expect(c.source).toBe('mine');
    expect(c.days).toHaveLength(src.days.length);
    expect(c.days[0]!.items).toEqual(src.days[0]!.items);
    const all = new Set([...src.days.map((d) => d.id), ...c.days.map((d) => d.id)]);
    expect(all.size).toBe(src.days.length * 2);
    expect(validateRoutine(c)).toEqual([]);
  });
  test('the copy is deep: editing it leaves the original alone', () => {
    const src = withItem();
    const c = cloneRoutine(src, ids());
    c.days[0]!.items[0]!.sets = 9;
    c.days[0]!.targetMuscles.push('abs');
    expect(src.days[0]!.items[0]!.sets).toBe(3);
    expect(src.days[0]!.targetMuscles).not.toContain('abs');
  });
  test('copy of a copy gets "copy 2"; a gym routine becomes mine; a long name still fits 40', () => {
    const src = withItem();
    expect(cloneRoutine(src, ids(), ['Mine', 'Mine copy']).name).toBe('Mine copy 2');
    expect(cloneRoutine({ ...src, source: 'gym' }, ids()).source).toBe('mine');
    const long = made({ name: 'y'.repeat(40) });
    const c = cloneRoutine(long, ids());
    expect(c.name.length).toBeLessThanOrEqual(40);
    expect(c.name.endsWith(' copy')).toBe(true);
    expect(validateRoutine(c)).toEqual([]);
  });
  test('freeName counts up without clashing', () => {
    expect(freeName('A', [])).toBe('A');
    expect(freeName('A', ['a'])).toBe('A 2');
  });
});

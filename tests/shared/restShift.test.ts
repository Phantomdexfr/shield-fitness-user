import { describe, expect, it } from 'vitest';
import { autoShifts, restShift, weekCells, missedDays, type PlanInput } from '../../src/shared/schedule';

const days = [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, name: `Day ${n}`, targetMuscles: [] as string[] }));
// Mon 23 Nov 2026 ... Sun 29 Nov. Five training days a week, Saturday and Sunday rest.
const base = (over: Partial<PlanInput>): PlanInput => ({ schedule: { mode: 'weekdays', weekdays: [0, 1, 2, 3, 4] }, days, pointer: 0, today: '2026-11-26', meta: { deloadWeeks: [], savedOn: '2026-11-23' }, ...over });
const strip = (i: PlanInput, n = 4) => weekCells(i, n).map((c) => (c.kind === 'T' ? String((c.dayIndex ?? 0) + 1) : 'r')).join(' ');

describe('rest today', () => {
  it('Mon-Wed done, rest on Thursday: 1 2 3 r 4 5 r', () => {
    const i = base({ pointer: 3, sessionDates: ['2026-11-23', '2026-11-24', '2026-11-25'] });
    const shift = restShift(i, '2026-11-26');
    expect(shift).toEqual({ '2026-11-26': 'rest', '2026-11-28': 'train' });
    expect(strip({ ...i, overrides: shift }, 4)).toBe('r 4 5 r');
  });
  it('a plan with no rest date left just moves later', () => {
    const i = base({ schedule: { mode: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }, pointer: 3 });
    expect(restShift(i, '2026-11-26')).toEqual({ '2026-11-26': 'rest' });
  });
  it('every N and floating plans only rest the date', () => {
    expect(restShift(base({ schedule: { mode: 'every_n', n: 2 } }), '2026-11-26')).toEqual({ '2026-11-26': 'rest' });
  });
});

describe('days nobody logged', () => {
  const done = ['2026-11-23', '2026-11-24', '2026-11-25'];
  it('a missed Thursday uses up Saturday, so Friday is day 4 and Saturday day 5', () => {
    const i = base({ today: '2026-11-27', pointer: 3, sessionDates: done });
    expect(autoShifts(i)).toEqual({ '2026-11-28': 'train' });
    expect(strip(i, 3)).toBe('4 5 r');
  });
  it('the shift stays put once Saturday is trained (it is not used twice)', () => {
    const i = base({ today: '2026-11-29', pointer: 0, sessionDates: [...done, '2026-11-27', '2026-11-28'] });
    expect(autoShifts(i)).toEqual({ '2026-11-28': 'train' });
    expect(strip(i, 1)).toBe('r');
  });
  it('two missed days in a row use up two rest dates', () => {
    const i = base({ today: '2026-11-28', pointer: 3, sessionDates: done });
    expect(autoShifts(i)).toEqual({ '2026-11-28': 'train', '2026-11-29': 'train' });
  });
  it('logging the forgotten day later puts the plan back', () => {
    const missedOne = base({ today: '2026-11-27', pointer: 3, sessionDates: done });
    expect(Object.keys(autoShifts(missedOne))).toHaveLength(1);
    const fixed = base({ today: '2026-11-27', pointer: 4, sessionDates: [...done, '2026-11-26'] });
    expect(autoShifts(fixed)).toEqual({});
    expect(strip(fixed, 3)).toBe('5 r r');
  });
  it('a long break does not turn every rest day into training', () => {
    const i = base({ today: '2026-11-27', pointer: 0, sessionDates: [] });
    expect(missedDays(i, '2026-11-20').welcomeBack).toBe(true);
    expect(autoShifts(i)).toEqual({});
  });
  it('days the user decided about do not shift anything', () => {
    const i = base({ today: '2026-11-27', pointer: 3, sessionDates: done, decided: ['2026-11-26'] });
    expect(autoShifts(i)).toEqual({});
  });
  it('flexible plans are never shifted', () => {
    expect(autoShifts(base({ schedule: { mode: 'floating', maxPerWeek: 4 } as never, today: '2026-11-27' }))).toEqual({});
  });
});

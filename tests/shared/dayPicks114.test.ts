// Phase 114: "on this date do THIS Day" (week only), layered on the scheduler without changing the rotation.
import { describe, expect, test } from 'vitest';
import { todayPlan, weekCells, type PlanInput } from '../../src/shared/schedule';
import { parseState } from '../../src/data/repos/schedule';

const days = [
  { id: 'push', name: 'Push', targetMuscles: [] },
  { id: 'pull', name: 'Pull', targetMuscles: [] },
  { id: 'legs', name: 'Legs', targetMuscles: [] },
];
// 2026-11-23 is a Monday. Mon / Wed / Fri training.
const base: PlanInput = { schedule: { mode: 'weekdays', weekdays: [0, 2, 4] }, days, pointer: 0, today: '2026-11-23', weekStart: 'mon' };
const names = (i: PlanInput) => weekCells(i, 7).map((c) => (c.kind === 'T' && c.dayIndex !== undefined ? days[c.dayIndex]!.id : c.kind));

describe('dayPicks', () => {
  test('no picks: the rotation is exactly as before', () => {
    expect(names(base)).toEqual(['push', 'R', 'pull', 'R', 'legs', 'R', 'R']);
    expect(names({ ...base, dayPicks: {} })).toEqual(names(base));
  });
  test('a pick on a training date replaces only that date; the others keep their Day', () => {
    expect(names({ ...base, dayPicks: { '2026-11-23': 'legs' } })).toEqual(['legs', 'R', 'pull', 'R', 'legs', 'R', 'R']);
    expect(names({ ...base, dayPicks: { '2026-11-23': 'legs', '2026-11-27': 'push' } })).toEqual(['legs', 'R', 'pull', 'R', 'push', 'R', 'R']);
  });
  test('a pick on a rest date is an extra workout and moves nothing else', () => {
    expect(names({ ...base, dayPicks: { '2026-11-24': 'legs' } })).toEqual(['push', 'legs', 'pull', 'R', 'legs', 'R', 'R']);
  });
  test('an unknown Day id is ignored', () => {
    expect(names({ ...base, dayPicks: { '2026-11-23': 'gone' } })).toEqual(names(base));
  });
  test('today: the picked Day is offered, in any mode, and a chosen rest still wins', () => {
    expect(todayPlan({ ...base, dayPicks: { '2026-11-23': 'legs' } })).toMatchObject({ kind: 'train', dayIndex: 2 });
    expect(todayPlan({ ...base, schedule: { mode: 'floating', maxPerWeek: 3 }, dayPicks: { '2026-11-23': 'pull' } })).toMatchObject({ kind: 'train', dayIndex: 1 });
    expect(todayPlan({ ...base, restChosen: true, dayPicks: { '2026-11-23': 'legs' } }).kind).toBe('rest');
  });
  test('stored state: picks round-trip, junk is dropped, old state without picks parses', () => {
    expect(parseState({ dayPicks: { '2026-11-23': 'legs', bad: 5 } }).dayPicks).toEqual({ '2026-11-23': 'legs' });
    expect(parseState({ pointer: 2 }).dayPicks).toEqual({});
    expect(parseState(undefined).dayPicks).toEqual({});
  });
});

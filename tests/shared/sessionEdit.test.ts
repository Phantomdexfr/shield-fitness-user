import { describe, expect, it } from 'vitest';
import { addSetTo, duplicateSet, editSet, removeExercise, removeSetAt, timesOf, withTimes } from '../../src/shared/sessionEdit';
import { summaryOf, dayOfSession } from '../../src/shared/history';
import type { Session, SetLog } from '../../src/shared/session';

const set = (kg: number | null, reps: number): SetLog => ({ weightKg: kg, reps, tag: 'normal', doneAt: '2026-11-20T06:00:00.000Z' });
const base = (): Session => ({
  id: 'a', clientId: 'a', startedAt: '2026-11-20T06:00:00.000Z', endedAt: '2026-11-20T07:00:00.000Z',
  items: [
    { ref: { kind: 'lib', slug: 'bench-press' }, status: 'done', order: 0, sets: [set(60, 10), set(60, 8)] },
    { ref: { kind: 'lib', slug: 'curl' }, status: 'done', order: 1, sets: [set(20, 10)] },
  ],
});

describe('sessionEdit', () => {
  it('edits weight and reps; weight 0 is bodyweight; input is untouched', () => {
    const s = base();
    const n = editSet(s, 0, 0, { weightKg: 70, reps: 12 });
    expect(n.items[0]!.sets[0]).toMatchObject({ weightKg: 70, reps: 12 });
    expect(s.items[0]!.sets[0]!.weightKg).toBe(60);
    expect(editSet(s, 0, 1, { weightKg: 0 }).items[0]!.sets[1]!.weightKg).toBeNull();
    expect(editSet(s, 0, 1, { reps: -3 }).items[0]!.sets[1]!.reps).toBe(0);
    expect(summaryOf(n).volume).toBe(70 * 12 + 60 * 8 + 200);
  });
  it('adds a set copying the last one and removes sets', () => {
    const n = addSetTo(base(), 0, 'x');
    expect(n.items[0]!.sets).toHaveLength(3);
    expect(n.items[0]!.sets[2]).toMatchObject({ weightKg: 60, reps: 8 });
    expect(removeSetAt(n, 0, 0).items[0]!.sets).toHaveLength(2);
  });
  it('an exercise emptied of sets goes back to todo; adding a set makes it done', () => {
    const n = removeSetAt(base(), 1, 0);
    expect(n.items[1]!.status).toBe('todo');
    expect(addSetTo(n, 1, 'x').items[1]!.status).toBe('done');
  });
  it('copies a set right after itself', () => {
    const n = duplicateSet(base(), 0, 0);
    expect(n.items[0]!.sets.map((x) => x.reps)).toEqual([10, 10, 8]);
  });
  it('removes an exercise and renumbers', () => {
    const n = removeExercise(base(), 0);
    expect(n.items).toHaveLength(1);
    expect(n.items[0]!.order).toBe(0);
  });
  it('changes date, time and duration (IST) and the day follows', () => {
    const n = withTimes(base(), '2026-11-18', 7, 30, 45);
    expect(dayOfSession(n)).toBe('2026-11-18');
    expect(timesOf(n)).toEqual({ day: '2026-11-18', hour: 7, minute: 30, durationMin: 45 });
    expect(summaryOf(n).minutes).toBe(45);
  });
});

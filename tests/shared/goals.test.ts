import { describe, expect, it } from 'vitest';
import { bmi, bmiBand, bodySeries, goalProblem, goalProgress, latestOf, mergeEntry, milestones, parseEntries, parseGoal, parseNumber, progressFraction, sessionsSince, toCelebrate, type Goal } from '../../src/shared/goals';

const TODAY = '2026-11-20';
const g = (o: Partial<Goal>): Goal => ({ id: 'g', kind: 'weight', target: 75, start: 85, startDay: '2026-11-01', ...o });

describe('progressFraction', () => {
  it('loss goal: 85 -> 75 is 50 % at 80; clamps below 0 and above 1; unknown current is 0', () => {
    expect(progressFraction(85, 75, 80)).toBe(0.5);
    expect(progressFraction(85, 75, 90)).toBe(0);
    expect(progressFraction(85, 75, 70)).toBe(1);
    expect(progressFraction(85, 75, null)).toBe(0);
  });
  it('gain goal and equal start/target never divide by zero', () => {
    expect(progressFraction(60, 100, 70)).toBe(0.25);
    expect(progressFraction(80, 80, 80)).toBe(1);
    expect(progressFraction(80, 80, 81)).toBe(0);
    expect(progressFraction(80, 100, Number.NaN)).toBe(0);
  });
});

describe('goalProgress', () => {
  it('weight loss: halfway, remaining, no deadline = open', () => {
    expect(goalProgress(g({}), 80, TODAY)).toMatchObject({ fraction: 0.5, pct: 50, reached: false, remaining: 5, daysLeft: null, status: 'open' });
  });
  it('reached when at or past the target in the right direction, either way', () => {
    expect(goalProgress(g({}), 75, TODAY)).toMatchObject({ reached: true, remaining: 0, pct: 100, status: 'reached' });
    expect(goalProgress(g({}), 74, TODAY).reached).toBe(true);
    expect(goalProgress(g({ kind: 'lift', start: 100, target: 140 }), 140, TODAY).reached).toBe(true);
    expect(goalProgress(g({ kind: 'lift', start: 100, target: 140 }), 139, TODAY).reached).toBe(false);
  });
  it('deadline: ahead, on track, behind, overdue by comparing progress with time used', () => {
    const base = g({ startDay: '2026-11-10', deadline: '2026-11-30' }); // today is halfway
    expect(goalProgress(base, 79, TODAY)).toMatchObject({ status: 'ahead', daysLeft: 10 });
    expect(goalProgress(base, 80, TODAY).status).toBe('on_track');
    expect(goalProgress(base, 84, TODAY).status).toBe('behind');
    expect(goalProgress(g({ startDay: '2026-10-01', deadline: '2026-11-10' }), 80, TODAY)).toMatchObject({ status: 'overdue', daysLeft: -10 });
    expect(goalProgress(g({ startDay: '2026-10-01', deadline: '2026-11-10' }), 74, TODAY).status).toBe('reached');
  });
  it('a deadline the same day as the start does not divide by zero', () => {
    const r = goalProgress(g({ startDay: TODAY, deadline: TODAY }), 80, TODAY);
    expect(Number.isFinite(r.fraction)).toBe(true);
  });
  it('unknown current (no readings yet): 0 %, remaining unknown', () => {
    expect(goalProgress(g({}), null, TODAY)).toMatchObject({ fraction: 0, remaining: null, reached: false });
  });
  it('attendance counts sessions since the start', () => {
    const a = g({ kind: 'attendance', start: 0, target: 12, startDay: '2026-11-01' });
    const n = sessionsSince(['2026-10-30', '2026-11-01', '2026-11-05', '2026-11-19'], a.startDay);
    expect(n).toBe(3);
    expect(goalProgress(a, n, TODAY)).toMatchObject({ pct: 25, remaining: 9 });
    expect(goalProgress(a, 12, TODAY).reached).toBe(true);
  });
  it('event goals fill with time and are reached on the day', () => {
    const e = g({ kind: 'event', title: 'Trek', start: 0, target: 0, startDay: '2026-11-10', deadline: '2026-11-30' });
    expect(goalProgress(e, null, TODAY)).toMatchObject({ pct: 50, reached: false, daysLeft: 10 });
    expect(goalProgress(e, null, '2026-11-30')).toMatchObject({ pct: 100, reached: true });
    expect(goalProgress(e, null, '2026-12-02').reached).toBe(true);
  });
});

describe('milestones', () => {
  it('quarter marks from start to target for a loss goal, marked reached as the value passes', () => {
    const m = milestones(g({}), 80);
    expect(m.map((x) => x.value)).toEqual([82.5, 80, 77.5, 75]);
    expect(m.map((x) => x.reached)).toEqual([true, true, false, false]);
  });
  it('attendance milestones are whole sessions; events have none', () => {
    expect(milestones(g({ kind: 'attendance', start: 0, target: 10 }), 3).map((x) => x.value)).toEqual([3, 5, 8, 10]);
    expect(milestones(g({ kind: 'event' }), null)).toEqual([]);
  });
});

describe('celebrate', () => {
  it('only reached goals without an achievedOn day', () => {
    const a = g({ id: 'a' });
    const b = g({ id: 'b', achievedOn: '2026-11-01' });
    const c = g({ id: 'c' });
    const p = new Map([['a', goalProgress(a, 70, TODAY)], ['b', goalProgress(b, 70, TODAY)], ['c', goalProgress(c, 80, TODAY)]]);
    expect(toCelebrate([a, b, c], p).map((x) => x.id)).toEqual(['a']);
  });
});

describe('goalProblem', () => {
  const ok = { kind: 'weight' as const, target: 75, start: 85, startDay: '2026-11-01' };
  it('accepts a good goal and names the first problem otherwise', () => {
    expect(goalProblem(ok, TODAY)).toBeNull();
    expect(goalProblem({ ...ok, target: 10 }, TODAY)).toBe('target');
    expect(goalProblem({ ...ok, target: 85 }, TODAY)).toBe('same_as_start');
    expect(goalProblem({ ...ok, deadline: '2026-11-10' }, TODAY)).toBe('deadline_past');
    expect(goalProblem({ ...ok, deadline: '2026-10-01' }, TODAY)).toBe('deadline_order');
    expect(goalProblem({ ...ok, kind: 'lift', target: 100, start: 80 }, TODAY)).toBe('slug');
    expect(goalProblem({ kind: 'attendance', target: 2.5, start: 0, startDay: TODAY }, TODAY)).toBe('target');
    expect(goalProblem({ kind: 'event', target: 0, start: 0, startDay: TODAY, title: 'Trek' }, TODAY)).toBe('event_date');
    expect(goalProblem({ kind: 'event', target: 0, start: 0, startDay: TODAY, title: ' ', deadline: '2026-12-01' }, TODAY)).toBe('title');
    expect(goalProblem({ kind: 'event', target: 0, start: 0, startDay: TODAY, title: 'Trek', deadline: '2026-12-01' }, TODAY)).toBeNull();
  });
});

describe('body entries', () => {
  it('parse: bad numbers drop to null, deleted rows go, one per day, sorted', () => {
    const e = parseEntries([
      { day: '2026-11-05', kg: 81, fat: 20, cm: { waist: 90, chest: 5 } },
      { day: '2026-11-01', kg: 82.5 },
      { day: '2026-11-03', kg: 9999, fat: 'x', deleted_at: null },
      { day: '2026-11-04', kg: 70, deleted_at: 5 },
      { kg: 70 },
    ]);
    expect(e.map((x) => x.day)).toEqual(['2026-11-01', '2026-11-03', '2026-11-05']);
    expect(e[1]).toMatchObject({ kg: null, fat: null });
    expect(e[2]?.cm).toEqual({ waist: 90 });
  });
  it('series leaves gaps out; latest picks the newest value', () => {
    const e = parseEntries([{ day: '2026-11-01', kg: 82 }, { day: '2026-11-02', fat: 20 }, { day: '2026-11-03', kg: 81, fat: 19.5, cm: { arm: 36 } }]);
    expect(bodySeries(e, 'kg')).toEqual([{ x: '2026-11-01', y: 82 }, { x: '2026-11-03', y: 81 }]);
    expect(bodySeries(e, 'arm')).toEqual([{ x: '2026-11-03', y: 36 }]);
    expect(latestOf(e, 'fat')).toBe(19.5);
    expect(latestOf([], 'kg')).toBeNull();
  });
  it('merge keeps what was not typed', () => {
    const prev = { day: TODAY, kg: 80, fat: 20, cm: { waist: 90 } };
    expect(mergeEntry(prev, { day: TODAY, kg: 79.5, cm: { hips: 100 } })).toEqual({ day: TODAY, kg: 79.5, fat: 20, cm: { waist: 90, hips: 100 } });
    expect(mergeEntry(undefined, { day: TODAY, fat: 18 })).toEqual({ day: TODAY, kg: null, fat: 18, cm: {} });
  });
  it('parseNumber: comma decimals, empty, out of range', () => {
    expect(parseNumber('82,5', 25, 400)).toBe(82.5);
    expect(parseNumber(' ', 25, 400)).toBeNull();
    expect(parseNumber('abc', 25, 400)).toBeNull();
    expect(parseNumber('5', 25, 400)).toBeNull();
  });
});

describe('BMI', () => {
  it('kg / m^2 to one decimal; bands at 18.5, 25, 30; null without height or weight', () => {
    expect(bmi(80, 180)).toBe(24.7);
    expect(bmi(null, 180)).toBeNull();
    expect(bmi(80, null)).toBeNull();
    expect(bmi(80, 10)).toBeNull();
    expect([18.4, 18.5, 24.9, 25, 29.9, 30].map(bmiBand)).toEqual(['under', 'healthy', 'healthy', 'over', 'over', 'high']);
  });
});

describe('parseGoal', () => {
  it('reads a good row and drops malformed or deleted ones', () => {
    expect(parseGoal({ client_id: 'x', kind: 'lift', target: 140, start: 100, startDay: '2026-11-01', slug: 'squat', deadline: '2026-12-01' })).toEqual({ id: 'x', kind: 'lift', target: 140, start: 100, startDay: '2026-11-01', slug: 'squat', deadline: '2026-12-01' });
    expect(parseGoal({ client_id: 'x', kind: 'nope', target: 1, start: 0, startDay: '2026-11-01' })).toBeNull();
    expect(parseGoal({ client_id: 'x', kind: 'weight', target: 'a', start: 0, startDay: '2026-11-01' })).toBeNull();
    expect(parseGoal({ client_id: 'x', kind: 'weight', target: 70, start: 80, startDay: '2026-11-01', deleted_at: 3 })).toBeNull();
  });
});

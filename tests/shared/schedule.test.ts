import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CYCLE_PRESETS, DEFAULT_SETTINGS, deloadIsDefault, deloadLoad, deloadSets, effectiveSchedule, isDefaultSettings, isDeloadWeek, missedDays, nextTile,
  parseMeta, parseSchedule, parseSettings, pointerAfter, rankDays, readiness, recoveryPicks, restHint, scheduleProblem, todayPlan, toggleDeloadWeek,
  weekCells, weekStartOf, cycleTiles, type PlanInput, type Schedule, type TodayInput,
} from '../../src/shared/schedule';

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../contract/fixtures/${name}`, import.meta.url), 'utf8'));
type Fx = Record<string, any>;
/** Plan fixtures list Day names; build PlanDay objects. */
const asDays = (d: any[]) => d.map((x, i) => (typeof x === 'string' ? { id: `d${i}`, name: x, targetMuscles: [] } : x));

const label = (c: { kind: string; dayIndex?: number }, days: { name: string }[]) =>
  c.kind === 'T' && c.dayIndex !== undefined ? `T:${days[c.dayIndex]!.name}` : c.kind;

describe('schedule_plan.json (ex. 1-5, 7, 11-13)', () => {
  for (const c of load('schedule_plan.json').cases as Fx[]) {
    it(c.id, () => {
      const days = asDays(c.days);
      const input: PlanInput = {
        ...(c.schedule ? { schedule: c.schedule as Schedule } : {}),
        days, pointer: c.pointer, today: c.today,
        ...(c.weekStart ? { weekStart: c.weekStart } : {}), ...(c.meta ? { meta: c.meta } : {}),
        ...(c.sessionDates ? { sessionDates: c.sessionDates } : {}), ...(c.overrides ? { overrides: c.overrides } : {}),
      };
      expect(weekCells(input, c.count).map((x) => label(x, days))).toEqual(c.expect);
    });
  }
});

describe('schedule_today.json (todayPlan)', () => {
  for (const c of load('schedule_today.json').cases as Fx[]) {
    it(c.id, () => {
      const input: TodayInput = {
        ...(c.schedule ? { schedule: c.schedule as Schedule } : {}),
        days: c.days, pointer: c.pointer, today: c.today, sessionDates: c.sessionDates, recovery: c.recovery,
        ...(c.overrides ? { overrides: c.overrides } : {}), ...(c.restChosen ? { restChosen: true } : {}),
      };
      const got = todayPlan(input) as unknown as Fx;
      for (const [k, v] of Object.entries(c.expect)) expect(got[k], k).toEqual(v);
      if (c.scores) expect(c.days.map((d: any) => readiness(d, c.recovery))).toEqual(c.scores);
    });
  }
  it('a rest date never blocks: another Day can still be asked for (hints never block)', () => {
    const c = (load('schedule_today.json').cases as Fx[]).find((x) => x.id === 'ex1-rest-day-next')!;
    const got = todayPlan({ schedule: c.schedule, days: c.days, pointer: c.pointer, today: c.today });
    expect(got.dayIndex).toBeDefined();
  });
});

describe('schedule_missed.json (ex. 8, 13)', () => {
  for (const c of load('schedule_missed.json').cases as Fx[]) {
    it(c.id, () => {
      const input: PlanInput = {
        ...(c.schedule ? { schedule: c.schedule as Schedule } : {}),
        days: c.days, pointer: c.pointer, today: c.today, sessionDates: c.sessionDates ?? [], decided: c.decided ?? [],
      };
      if (c.expect.cells) expect(weekCells(input, c.count).map((x) => label(x, c.days))).toEqual(c.expect.cells);
      else expect(missedDays(input, c.since)).toEqual(c.expect);
      if (c.pointerAfterSkip) expect(pointerAfter(c.pointerAfterSkip.index, c.pointerAfterSkip.count)).toBe(c.pointerAfterSkip.pointer);
    });
  }
});

describe('schedule_deload.json (ex. 9)', () => {
  const fx = load('schedule_deload.json');
  it('sets x0.6, round, minimum 1', () => {
    for (const [from, to] of fx.sets) expect(deloadSets(from)).toBe(to);
  });
  it('loads x0.9 to 2 dp', () => {
    for (const [from, to] of fx.loads) expect(deloadLoad(from)).toBe(to);
  });
  it('week membership', () => {
    const meta = parseMeta({ deloadWeeks: fx.weeks.deloadWeeks });
    for (const [date, yes] of fx.weeks.checks) expect(isDeloadWeek(meta, date), date).toBe(yes);
  });
  it('mark and unmark from any date in the week', () => {
    const meta = parseMeta({ deloadWeeks: fx.toggle.from });
    expect(toggleDeloadWeek(meta, fx.toggle.date).deloadWeeks).toEqual(fx.toggle.after);
    expect(toggleDeloadWeek({ deloadWeeks: [] }, '2026-11-25').deloadWeeks).toEqual(['2026-11-23']);
  });
  it('custom percentages are honoured and the deload week shows on the Today plan', () => {
    expect(deloadSets(10, 50)).toBe(5);
    const plan = todayPlan({ schedule: { mode: 'weekdays', weekdays: [0] }, days: [{ id: 'a', name: 'A', targetMuscles: [] }], pointer: 0, today: '2026-11-23', meta: { deloadWeeks: ['2026-11-23'] } });
    expect(plan.deload).toBe(true);
  });
});

describe('schedule_hint.json (ex. 10)', () => {
  for (const c of load('schedule_hint.json').cases as Fx[]) {
    it(c.id, () => {
      const got = restHint({ id: 'd', name: 'D', targetMuscles: c.targets }, c.recovery, c.enabled);
      expect(got?.muscles ?? null).toEqual(c.expect);
    });
  }
  it('swap list ranks by readiness (ex. 11)', () => {
    const days = [{ id: 'a', name: 'Push', targetMuscles: ['chest'] }, { id: 'b', name: 'Legs', targetMuscles: ['quads'] }];
    expect(rankDays(days, 0, { chest: 'fatigued', quads: 'fresh' }).map((r) => r.index)).toEqual([1, 0]);
    expect(rankDays(days, 0, {})).toEqual([]);
  });
});

describe('validation and parsing', () => {
  it('cycle: length 2-14 and at least one T', () => {
    expect(scheduleProblem({ mode: 'cycle', pattern: ['R', 'R', 'R'], startDate: '2026-11-16' })).toBe('no_training_day');
    expect(scheduleProblem({ mode: 'cycle', pattern: ['T'], startDate: '2026-11-16' })).toBe('cycle_length');
    expect(scheduleProblem({ mode: 'cycle', pattern: Array(15).fill('T'), startDate: '2026-11-16' })).toBe('cycle_length');
    expect(scheduleProblem({ mode: 'cycle', pattern: CYCLE_PRESETS.TTTRTTR!, startDate: '2026-11-16' })).toBeNull();
  });
  it('other modes', () => {
    expect(scheduleProblem({ mode: 'every_n', n: 0 })).toBe('every_n_range');
    expect(scheduleProblem({ mode: 'every_n', n: 14 })).toBeNull();
    expect(scheduleProblem({ mode: 'floating', maxPerWeek: 8 })).toBe('floating_range');
    expect(scheduleProblem({ mode: 'floating', maxPerWeek: 4, minRestDays: 4 })).toBe('floating_range');
    expect(scheduleProblem({ mode: 'weekdays', weekdays: [] })).toBeNull();
    expect(scheduleProblem({ mode: 'weekdays', weekdays: [7] })).toBe('weekday_range');
  });
  it('A/B allows only weekdays or cycle, no nesting', () => {
    const wk: Schedule = { mode: 'weekdays', weekdays: [0] };
    expect(scheduleProblem({ mode: 'ab_weeks', weekA: wk, weekB: { mode: 'every_n', n: 2 } })).toBe('nested');
    expect(scheduleProblem({ mode: 'ab_weeks', weekA: wk, weekB: { mode: 'ab_weeks', weekA: wk, weekB: wk } })).toBe('nested');
    expect(scheduleProblem({ mode: 'ab_weeks', weekA: wk, weekB: wk })).toBeNull();
  });
  it('parseSchedule drops bad stored data and keeps good data', () => {
    expect(parseSchedule(null)).toBeUndefined();
    expect(parseSchedule({ mode: 'nope' })).toBeUndefined();
    expect(parseSchedule({ mode: 'every_n', n: 99 })).toBeUndefined();
    expect(parseSchedule({ mode: 'every_n', n: 3 })).toEqual({ mode: 'every_n', n: 3 });
  });
  it('effectiveSchedule: older weekdays list works as a schedule (ex. 13)', () => {
    expect(effectiveSchedule({ weekdays: [0, 2, 4] })).toEqual({ mode: 'weekdays', weekdays: [0, 2, 4] });
    expect(effectiveSchedule({ weekdays: [] })).toBeUndefined();
    expect(effectiveSchedule({ schedule: { mode: 'every_n', n: 2 }, weekdays: [1] })).toEqual({ mode: 'every_n', n: 2 });
  });
  it('tiles cycle T -> A -> M -> R -> T and the cycle view marks today', () => {
    expect(['T', 'A', 'M', 'R'].map((t) => nextTile(t as 'T'))).toEqual(['A', 'M', 'R', 'T']);
    const tiles = cycleTiles({ mode: 'cycle', pattern: ['T', 'T', 'R'], startDate: '2026-11-16' }, '2026-11-19');
    expect(tiles.map((x) => x.tile).join('')).toBe('TTR');
    expect(tiles.findIndex((x) => x.today)).toBe(0);
  });
  it('week start only moves the display week', () => {
    expect(weekStartOf('2026-11-19', 'mon')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-22', 'mon')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-22', 'sun')).toBe('2026-11-22');
    expect(weekStartOf('2026-11-21', 'sun')).toBe('2026-11-15');
  });
});

describe('settings', () => {
  it('defaults, clamping, steps of 5', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ setsPct: 10, loadPct: 500, missed: 'skip', weekStart: 'sun', hints: false })).toEqual({ hints: false, missed: 'skip', weekStart: 'sun', setsPct: 40, loadPct: 100 });
    expect(parseSettings({ setsPct: 62 }).setsPct).toBe(60);
    expect(isDefaultSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(deloadIsDefault({ ...DEFAULT_SETTINGS, setsPct: 70 })).toBe(false);
  });
});

describe('active recovery and mobility picks (ex. 12)', () => {
  const rows = [
    { slug: 'childs-pose', category: 'recovery', subCategory: 'mobility' },
    { slug: 'foam-roller-calf-roll', category: 'recovery', subCategory: 'foam_rolling' },
    { slug: 'hip-switch', category: 'warmup', subCategory: 'mobility' },
    { slug: 'bike', category: 'other', subCategory: 'cardio_machine' },
    { slug: 'squat', category: 'compound', subCategory: 'legs' },
  ];
  it('only real light categories, 2-3 items, stable per date', () => {
    const m = recoveryPicks('mobility', rows, '2026-11-20');
    expect(m).toHaveLength(3);
    expect(m).not.toContain('squat');
    expect(m).not.toContain('bike');
    expect(recoveryPicks('mobility', rows, '2026-11-20')).toEqual(m);
    expect(recoveryPicks('active', rows, '2026-11-18').every((s) => s !== 'squat')).toBe(true);
    expect(recoveryPicks('active', [{ slug: 'squat', category: 'compound', subCategory: 'x' }], '2026-11-18')).toEqual([]);
  });
});

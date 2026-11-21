// Phase 61 verify: card maths on fixtures, week-seed determinism.
import { describe, expect, it } from 'vitest';
import { computeRecap, isoWeekOf, lastDaysRange, longestRun, muscleOfWeek, recapCards, validRange, yearRange, type RecapDeps } from '../../src/shared/recap';
import type { Session, SessionItem, SetLog } from '../../src/shared/session';
import { ATLAS } from '../../src/atlas/logic';

const w = (kg: number | null, reps: number, extra: Partial<SetLog> = {}): SetLog => ({ weightKg: kg, reps, tag: 'normal', doneAt: '2026-01-10T06:00:00.000Z', ...extra });
const item = (slug: string, sets: SetLog[], order = 0, status: SessionItem['status'] = 'done'): SessionItem => ({ ref: { kind: 'lib', slug }, status, sets, order });
const sess = (id: string, startedAt: string, items: SessionItem[]): Session => ({ id, clientId: id, startedAt, endedAt: new Date(Date.parse(startedAt) + 3_600_000).toISOString(), items });

const MAPS: Record<string, ReadonlyArray<readonly [string, string, string]>> = {
  bench: [['chest', 'p', 'h'], ['triceps', 's', 'm']],
  squat: [['quads', 'p', 'h'], ['glutes', 'p', 'm']],
};
const deps: RecapDeps = { slugOf: (r) => (r.kind === 'lib' ? r.slug : r.id), musclesOf: (slug) => MAPS[slug] ?? [] };

const A = sess('a', '2026-01-10T06:00:00.000Z', [item('bench', [w(20, 8, { tag: 'warmup' }), w(60, 10), w(60, 9)]), item('squat', [w(100, 5)], 1)]);
const B = sess('b', '2026-01-11T06:00:00.000Z', [item('bench', [w(65, 8)])]);
const C = sess('c', '2026-01-12T06:00:00.000Z', [item('squat', [w(120, 3)])]);
const D = sess('d', '2026-01-20T06:00:00.000Z', [item('bench', [w(62.5, 5)]), item('curl', [], 1, 'skipped')]);
const E = sess('e', '2025-12-31T06:00:00.000Z', [item('squat', [w(200, 1)])]);
const YEAR = yearRange(2026);

describe('computeRecap', () => {
  it('adds up sessions, working sets, volume (warm-ups never count)', () => {
    const r = computeRecap([A, B, C, D], YEAR, deps);
    expect(r.sessions).toBe(4);
    expect(r.workingSets).toBe(6);
    expect(r.volume).toBe(600 + 540 + 500 + 520 + 360 + 312.5);
  });
  it('heaviest lift, favourite exercise, longest streak', () => {
    const r = computeRecap([A, B, C, D], YEAR, deps);
    expect(r.heaviest).toEqual({ slug: 'squat', kg: 120, day: '2026-01-12' });
    expect(r.favourite).toEqual({ slug: 'bench', sessions: 3 });
    expect(r.longestStreakDays).toBe(3);
  });
  it('most and least trained muscle count primary working sets only', () => {
    const r = computeRecap([A, B, C, D], YEAR, deps);
    expect(r.mostTrained).toEqual({ id: 'chest', sets: 4 });
    expect(r.leastTrained).toEqual({ id: 'quads', sets: 2 });
    const one = computeRecap([B], YEAR, deps);
    expect(one.mostTrained).toEqual({ id: 'chest', sets: 1 });
    expect(one.leastTrained).toBeNull();
  });
  it('biggest PR is the weight record with the biggest gain over its earlier value', () => {
    const r = computeRecap([A, B, C, D], YEAR, deps);
    expect(r.biggestPr).toEqual({ slug: 'squat', metric: 'weight', value: 120, previous: 100, day: '2026-01-12' });
  });
  it('sessions before the range still count as history for PRs, but not in the totals', () => {
    const r = computeRecap([E, A, B, C, D], YEAR, deps);
    expect(r.sessions).toBe(4);
    expect(r.heaviest?.kg).toBe(120);
    expect(r.biggestPr).toMatchObject({ slug: 'bench', value: 65, previous: 60 });
  });
  it('the range is by IST day: 00:30 IST is the next day', () => {
    const late = sess('l', '2026-01-12T19:00:00.000Z', [item('bench', [w(50, 5)])]); // 13 Jan 00:30 IST
    expect(computeRecap([late], { from: '2026-01-01', to: '2026-01-12' }, deps).sessions).toBe(0);
    expect(computeRecap([late], { from: '2026-01-13', to: '2026-01-13' }, deps).sessions).toBe(1);
  });
  it('open sessions and empty ranges give no cards', () => {
    const open: Session = { ...A, endedAt: undefined as never };
    delete (open as { endedAt?: string }).endedAt;
    const r = computeRecap([open], YEAR, deps);
    expect(r.sessions).toBe(0);
    expect(recapCards(r)).toEqual([]);
    expect(computeRecap([], YEAR, deps).biggestPr).toBeNull();
  });
  it('bodyweight-only history has no heaviest lift or PR card', () => {
    const r = computeRecap([sess('p', '2026-01-10T06:00:00.000Z', [item('pull-up', [w(null, 10)])])], YEAR, deps);
    expect(r.heaviest).toBeNull();
    expect(recapCards(r)).toEqual(['totals', 'streak', 'favourite']);
  });
  it('card list follows the data', () => {
    expect(recapCards(computeRecap([A, B, C, D], YEAR, deps))).toEqual(['totals', 'heaviest', 'muscles', 'streak', 'favourite', 'pr']);
  });
});

describe('ranges and streak helper', () => {
  it('longestRun counts consecutive days and ignores duplicates', () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(['2026-01-01'])).toBe(1);
    expect(longestRun(['2026-01-03', '2026-01-01', '2026-01-02', '2026-01-02', '2026-01-09', '2026-01-10'])).toBe(3);
    expect(longestRun(['2026-02-28', '2026-03-01'])).toBe(2);
  });
  it('a run crosses IST midnight correctly', () => {
    const s1 = sess('s1', '2026-03-01T17:00:00.000Z', [item('bench', [w(50, 5)])]); // 1 Mar 22:30 IST
    const s2 = sess('s2', '2026-03-01T19:00:00.000Z', [item('bench', [w(50, 5)])]); // 2 Mar 00:30 IST
    expect(computeRecap([s1, s2], yearRange(2026), deps).longestStreakDays).toBe(2);
  });
  it('year, last-days and validity', () => {
    expect(yearRange(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(lastDaysRange('2026-11-20', 30)).toEqual({ from: '2026-10-22', to: '2026-11-20' });
    expect(lastDaysRange('2026-11-20', 1)).toEqual({ from: '2026-11-20', to: '2026-11-20' });
    expect(validRange({ from: '2026-01-02', to: '2026-01-01' })).toBe(false);
    expect(validRange({ from: '2026-02-30', to: '2026-03-01' })).toBe(false);
    expect(validRange({ from: '', to: '2026-03-01' })).toBe(false);
    expect(validRange({ from: '2026-01-01', to: '2026-01-01' })).toBe(true);
  });
});

describe('muscle of the week', () => {
  it('ISO weeks: Thursday rule, year edges', () => {
    expect(isoWeekOf('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2025-12-29')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2027-01-03')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2027-01-04')).toEqual({ year: 2027, week: 1 });
    expect(isoWeekOf('2026-11-20')).toEqual({ year: 2026, week: 47 });
  });
  it('same muscle all week (Monday to Sunday), a new one on the next Monday', () => {
    const mon = muscleOfWeek('2026-11-16', ATLAS)!;
    for (const d of ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']) expect(muscleOfWeek(d, ATLAS)!.row.muscleId).toBe(mon.row.muscleId);
    expect(muscleOfWeek('2026-11-23', ATLAS)!.row.muscleId).not.toBe(mon.row.muscleId);
  });
  it('deterministic: the same day always gives the same answer', () => {
    expect(muscleOfWeek('2026-11-20', ATLAS)).toEqual(muscleOfWeek('2026-11-20', ATLAS));
  });
  it('walks through every muscle before repeating (consecutive weeks)', () => {
    const seen = new Set<string>();
    let day = '2026-02-02';
    for (let i = 0; i < ATLAS.length; i++) {
      seen.add(muscleOfWeek(day, ATLAS)!.row.muscleId);
      const d = new Date(Date.parse(`${day}T00:00:00Z`) + 7 * 86_400_000);
      day = d.toISOString().slice(0, 10);
    }
    expect(seen.size).toBe(ATLAS.length);
  });
  it('the fact is the first daily-life line, and rows without one are skipped', () => {
    const w = muscleOfWeek('2026-11-20', ATLAS)!;
    expect(w.fact).toBe(w.row.inDailyLife[0]);
    const rows = [{ id: 'x', inDailyLife: [] as string[] }, { id: 'y', inDailyLife: ['  '] }, { id: 'z', inDailyLife: ['Carrying shopping'] }];
    expect(muscleOfWeek('2026-11-20', rows)).toMatchObject({ row: { id: 'z' }, fact: 'Carrying shopping' });
    expect(muscleOfWeek('2026-11-20', [])).toBeNull();
  });
});

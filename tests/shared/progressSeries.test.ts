import { describe, expect, it } from 'vitest';
import { consistency, exerciseList, exercisePoints, exerciseSummary, gridCells, gridRange, metricPoints, plateauHint, scheduledTarget, topWeekIndex, weeklyTarget, weeklyVolume } from '../../src/shared/progressSeries';
import type { Session, SessionItem, SetLog } from '../../src/shared/session';
import { downsample } from '../../src/shared/chartMath';

const w = (kg: number | null, reps: number, tag: SetLog['tag'] = 'normal'): SetLog => ({ weightKg: kg, reps, tag, doneAt: '2026-11-20T06:00:00.000Z' });
const item = (slug: string, sets: SetLog[]): SessionItem => ({ ref: { kind: 'lib', slug }, status: 'done', sets, order: 0 });
// 06:00 UTC = 11:30 IST, so the IST day equals the date given.
const sess = (day: string, items: SessionItem[], id = day, ended = true): Session => ({ id, clientId: id, startedAt: `${day}T06:00:00.000Z`, ...(ended ? { endedAt: `${day}T07:00:00.000Z` } : {}), items });

describe('exercisePoints', () => {
  it('one point per day, warm-ups ignored, gaps between sessions stay gaps', () => {
    const s = [sess('2026-11-02', [item('bench', [w(20, 10, 'warmup'), w(60, 8), w(62.5, 6)])]), sess('2026-11-16', [item('bench', [w(65, 5)])])];
    const p = exercisePoints(s, 'bench');
    expect(p.map((x) => x.day)).toEqual(['2026-11-02', '2026-11-16']);
    expect(p[0]).toMatchObject({ weight: 62.5, reps: 8, sets: 2 });
    expect(p[0]?.e1rm).toBeGreaterThan(70);
  });
  it('single session is one point and a summary of one', () => {
    const p = exercisePoints([sess('2026-11-02', [item('bench', [w(60, 8)])])], 'bench');
    expect(p).toHaveLength(1);
    expect(exerciseSummary(p)).toMatchObject({ sessions: 1, bestWeight: 60, bestReps: 8, lastDay: '2026-11-02' });
  });
  it('bodyweight sets give reps and no weight; a missing metric is null, never NaN', () => {
    const p = exercisePoints([sess('2026-11-02', [item('pull-up', [w(null, 10)])])], 'pull-up');
    expect(p[0]).toMatchObject({ weight: null, reps: 10 });
    expect(metricPoints(p, 'weight')).toEqual([{ x: '2026-11-02', y: null }]);
  });
  it('same-day sessions merge to the best; open sessions and other exercises are ignored', () => {
    const s = [sess('2026-11-02', [item('bench', [w(60, 8)])], 'a'), sess('2026-11-02', [item('bench', [w(70, 3)])], 'b'), sess('2026-11-03', [item('bench', [w(99, 1)])], 'c', false), sess('2026-11-04', [item('squat', [w(100, 5)])], 'd')];
    const p = exercisePoints(s, 'bench');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ weight: 70, reps: 8, sets: 2 });
  });
  it('custom exercises resolve through the slug lookup', () => {
    const s: Session = { ...sess('2026-11-02', []), items: [{ ref: { kind: 'custom', id: 'c1' }, status: 'done', sets: [w(10, 10)], order: 0 }] };
    expect(exercisePoints([s], 'my-curl', (id) => (id === 'c1' ? 'my-curl' : undefined))).toHaveLength(1);
    expect(exercisePoints([s], 'my-curl')).toHaveLength(0);
  });
  it('a large history downsamples to the chart limit', () => {
    const many = Array.from({ length: 1000 }, (_, i) => sess(new Date(Date.UTC(2023, 0, 1) + i * 86400000).toISOString().slice(0, 10), [item('bench', [w(50 + (i % 40), 5)])]));
    const p = exercisePoints(many, 'bench');
    expect(p).toHaveLength(1000);
    const pts = p.map((x, i) => ({ x: i, y: x.weight as number }));
    expect(downsample(pts, 400).length).toBeLessThanOrEqual(400);
  });
});

describe('plateau and list', () => {
  const flat = (n: number) => Array.from({ length: n }, (_, i) => sess(`2026-10-${String(i + 1).padStart(2, '0')}`, [item('bench', [w(60, 8)])]));
  it('flat last 4 sessions after enough history is a plateau; fewer than 5 sessions is not', () => {
    expect(plateauHint(flat(6), 'bench')).toBe(true);
    expect(plateauHint(flat(4), 'bench')).toBe(false);
  });
  it('lists exercises newest first with counts', () => {
    const l = exerciseList([sess('2026-11-01', [item('bench', [w(60, 8)])]), sess('2026-11-05', [item('squat', [w(80, 5)])]), sess('2026-11-08', [item('bench', [w(62, 8)])]), sess('2026-11-09', [item('curl', [])])]);
    expect(l.map((e) => [e.slug, e.sessions])).toEqual([['bench', 2], ['squat', 1]]);
  });
  it('no sessions gives empty results everywhere', () => {
    expect(exerciseList([])).toEqual([]);
    expect(exercisePoints([], 'x')).toEqual([]);
    expect(exerciseSummary([])).toEqual({ sessions: 0, bestWeight: null, bestE1rm: null, bestReps: null, lastDay: null });
  });
});

describe('weeklyVolume, grid', () => {
  // 2026-11-20 is a Friday; its IST week starts Monday 2026-11-16.
  const today = '2026-11-20';
  it('12 weeks ending this week with zeros, IST week boundaries, warm-ups out', () => {
    const s = [sess('2026-11-16', [item('bench', [w(60, 10), w(20, 10, 'warmup')])]), sess('2026-11-15', [item('bench', [w(50, 10)])]), sess('2026-11-18', [item('squat', [w(100, 5)])])];
    const v = weeklyVolume(s, today, 12);
    expect(v).toHaveLength(12);
    expect(v[11]).toEqual({ weekStart: '2026-11-16', volume: 600 + 500, sessions: 2 });
    expect(v[10]).toEqual({ weekStart: '2026-11-09', volume: 500, sessions: 1 });
    expect(v[0]?.weekStart).toBe('2026-08-31');
    expect(topWeekIndex(v)).toBe(11);
    expect(topWeekIndex(weeklyVolume([], today))).toBe(-1);
  });
  it('a session late at night UTC belongs to the next IST day', () => {
    const late: Session = { id: 'l', clientId: 'l', startedAt: '2026-11-15T19:00:00.000Z', endedAt: '2026-11-15T20:00:00.000Z', items: [item('bench', [w(10, 10)])] };
    expect(weeklyVolume([late], today, 2)[1]?.sessions).toBe(1); // 00:30 IST on Monday the 16th
  });
  it('grid range starts on a Monday and cells count sessions per day inside it', () => {
    const r = gridRange(today, 12);
    expect(r).toEqual({ from: '2026-08-31', to: today });
    const c = gridCells([sess('2026-11-16', [item('a', [w(1, 1)])], 'x'), sess('2026-11-16', [item('a', [w(1, 1)])], 'y'), sess('2026-08-01', [item('a', [w(1, 1)])], 'z')], r);
    expect(c).toEqual([{ day: '2026-11-16', value: 2 }]);
  });
});

describe('targets', () => {
  it('schedule modes map to sessions per week; none = 3; own number wins', () => {
    expect(scheduledTarget(undefined)).toBe(3);
    expect(scheduledTarget({ mode: 'weekdays', weekdays: [0, 2, 4, 5] })).toBe(4);
    expect(scheduledTarget({ mode: 'weekdays', weekdays: [] })).toBe(3);
    expect(scheduledTarget({ mode: 'cycle', pattern: ['T', 'T', 'R'], startDate: '2026-11-01' })).toBe(5);
    expect(scheduledTarget({ mode: 'every_n', n: 2 })).toBe(4);
    expect(scheduledTarget({ mode: 'floating', maxPerWeek: 3 })).toBe(3);
    expect(weeklyTarget(5, undefined)).toBe(5);
    expect(weeklyTarget(null, { mode: 'floating', maxPerWeek: 2 })).toBe(2);
  });
});

describe('consistency', () => {
  const today = '2026-11-20'; // week of 2026-11-16
  const wk = (monday: string, n: number) => Array.from({ length: n }, (_, i) => sess(monday, [item('a', [w(1, 1)])], `${monday}-${i}`));
  it('no sessions: empty ring, streak 0, no NaN', () => {
    expect(consistency([], today, 3)).toEqual({ target: 3, thisWeek: 0, fill: 0, keptNow: false, streak: 0, graceUsed: false });
  });
  it('ring fill is sessions / target, capped at 1; this week counts once kept', () => {
    expect(consistency(wk('2026-11-16', 2), today, 3)).toMatchObject({ thisWeek: 2, fill: 2 / 3, keptNow: false, streak: 0 });
    expect(consistency(wk('2026-11-16', 5), today, 3)).toMatchObject({ fill: 1, keptNow: true, streak: 1 });
  });
  it('the week in progress never breaks a streak', () => {
    const s = [...wk('2026-11-09', 3), ...wk('2026-11-02', 3)];
    expect(consistency(s, today, 3)).toMatchObject({ streak: 2, graceUsed: false });
    expect(consistency([...s, ...wk('2026-11-16', 3)], today, 3).streak).toBe(3);
  });
  it('one missed week is forgiven by the grace week and is not counted', () => {
    const s = [...wk('2026-11-09', 3), ...wk('2026-10-26', 3), ...wk('2026-10-19', 3)]; // 11-02 missed
    expect(consistency(s, today, 3)).toMatchObject({ streak: 3, graceUsed: true });
  });
  it('a second miss within 8 weeks ends the streak', () => {
    const s = [...wk('2026-11-09', 3), ...wk('2026-10-26', 3), ...wk('2026-10-12', 3)]; // 11-02 and 10-19 missed
    expect(consistency(s, today, 3)).toMatchObject({ streak: 2, graceUsed: true });
  });
  it('a second grace is allowed after 8 weeks', () => {
    // kept: 11-09; missed 11-02 (grace); kept 10-26..09-14 (7 weeks); missed 09-07; kept 08-31
    const kept = ['2026-11-09', '2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14', '2026-08-31'];
    const s = kept.flatMap((m) => wk(m, 3));
    expect(consistency(s, today, 3)).toMatchObject({ streak: 9, graceUsed: true });
  });
  it('weeks before the first session are not misses; a miss with nothing earlier ends it', () => {
    expect(consistency(wk('2026-11-09', 3), today, 3).streak).toBe(1);
    expect(consistency([...wk('2026-11-02', 3)], today, 3).streak).toBe(1); // 11-09 missed, grace carries to 11-02
  });
  it('a rest week the user sets nothing against: lower target keeps more weeks', () => {
    const s = [...wk('2026-11-09', 1), ...wk('2026-11-02', 1)];
    expect(consistency(s, today, 1).streak).toBe(2);
    expect(consistency(s, today, 3).streak).toBe(0);
  });
});

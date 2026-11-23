import { describe, expect, it } from 'vitest';
import { countByDay, dayOfSession, finishedSessions, groupByDay, monthGrid, monthOfDay, musclesHit, prWall, shiftMonth, summaryOf, volumeText } from '../../src/shared/history';
import { buildBoard, sessionPRs } from '../../src/shared/pr';
import { repeatOf, type Session, type SessionItem, type SetLog } from '../../src/shared/session';

const w = (kg: number | null, reps: number, extra: Partial<SetLog> = {}): SetLog => ({ weightKg: kg, reps, tag: 'normal', doneAt: '2026-11-20T06:00:00.000Z', ...extra });
const item = (slug: string, sets: SetLog[], order = 0, status: SessionItem['status'] = 'done', extra: Partial<SessionItem> = {}): SessionItem => ({ ref: { kind: 'lib', slug }, status, sets, order, ...extra });
const sess = (id: string, startedAt: string, items: SessionItem[], endedAt?: string): Session => ({ id, clientId: id, startedAt, ...(endedAt ? { endedAt } : {}), items });

describe('summaryOf', () => {
  it('duration, volume, sets, exercises, skipped, top weight; warm-ups never count', () => {
    const s = sess('a', '2026-11-20T06:00:00.000Z', [
      item('bench-press', [w(20, 8, { tag: 'warmup' }), w(60, 10), w(60, 9)]),
      item('squat', [w(100, 5)], 1),
      item('curl', [], 2, 'skipped'),
    ], '2026-11-20T06:50:30.000Z');
    expect(summaryOf(s)).toEqual({ minutes: 51, workingSets: 3, volume: 60 * 10 + 60 * 9 + 500, totalReps: 24, exercises: 2, skipped: 1, topWeight: 100 });
  });
  it('an empty or open session is all zeros and never negative', () => {
    expect(summaryOf(sess('b', '2026-11-20T06:00:00.000Z', [item('x', [], 0, 'todo')]))).toMatchObject({ minutes: 0, workingSets: 0, volume: 0, exercises: 0 });
    expect(summaryOf(sess('c', '2026-11-20T06:00:00.000Z', [], '2026-11-20T05:00:00.000Z')).minutes).toBe(0);
    expect(summaryOf(sess('d', 'not a date', [])).minutes).toBe(0);
  });
  it('bodyweight sets add reps but no volume', () => {
    const s = summaryOf(sess('e', '2026-11-20T06:00:00.000Z', [item('pull-up', [w(null, 10), w(null, 8)])], '2026-11-20T06:30:00.000Z'));
    expect(s).toMatchObject({ workingSets: 2, volume: 0, totalReps: 18, topWeight: 0 });
  });
  it('volume text is whole kg with Indian grouping', () => {
    expect(volumeText(12450.4)).toBe('12,450 kg');
    expect(volumeText(0)).toBe('0 kg');
    expect(volumeText(123456)).toBe('1,23,456 kg');
  });
});

describe('musclesHit', () => {
  it('primary beats secondary, stabilisers count as secondary, unknown roles are ignored', () => {
    const squat = [['quads', 'p', 'h'], ['glutes', 's', 'm'], ['core', 't', 'l']] as const;
    const lunge = [['glutes', 'p', 'h'], ['quads', 's', 'm'], ['x', 'z', 'm']] as const;
    expect(musclesHit([squat, lunge])).toEqual({ quads: 'primary', glutes: 'primary', core: 'secondary' });
    expect(musclesHit([lunge, squat])).toEqual({ quads: 'primary', glutes: 'primary', core: 'secondary' });
    expect(musclesHit([])).toEqual({});
  });
});

describe('history grouping by IST day', () => {
  // 2026-11-20 23:59:59 IST = 18:29:59Z; 00:00:00 IST on the 21st = 18:30:00Z.
  const late = sess('late', '2026-11-20T18:29:59.000Z', [item('a', [w(1, 1)])], '2026-11-20T19:00:00.000Z');
  const early = sess('early', '2026-11-20T18:30:00.000Z', [item('a', [w(1, 1)])], '2026-11-20T19:10:00.000Z');
  const morning = sess('morning', '2026-11-20T01:00:00.000Z', [item('a', [w(1, 1)])], '2026-11-20T02:00:00.000Z');
  it('the IST midnight boundary decides the day', () => {
    expect(dayOfSession(late)).toBe('2026-11-20');
    expect(dayOfSession(early)).toBe('2026-11-21');
  });
  it('groups newest day first, newest session first inside a day', () => {
    const g = groupByDay([morning, early, late]);
    expect(g.map((x) => x.day)).toEqual(['2026-11-21', '2026-11-20']);
    expect(g[1]!.sessions.map((s) => s.id)).toEqual(['late', 'morning']);
  });
  it('open and empty sessions are not history', () => {
    const open = sess('open', '2026-11-22T01:00:00.000Z', [item('a', [])]);
    const empty = sess('empty', '2026-11-22T01:00:00.000Z', [], '2026-11-22T02:00:00.000Z');
    expect(finishedSessions([open, empty, morning]).map((s) => s.id)).toEqual(['morning']);
    expect(groupByDay([open, empty])).toEqual([]);
  });
  it('counts per day for the calendar dots', () => {
    const m = countByDay([morning, early, late]);
    expect(m.get('2026-11-20')).toBe(2);
    expect(m.get('2026-11-21')).toBe(1);
    expect(m.get('2026-11-22')).toBeUndefined();
  });
});

describe('monthGrid', () => {
  it('Monday-first; Nov 2026 starts on a Sunday so it has 6 leading blanks and 6 whole weeks', () => {
    const g = monthGrid('2026-11', new Map([['2026-11-20', 2]]));
    expect(g).toHaveLength(6);
    expect(g.every((wk) => wk.length === 7)).toBe(true);
    expect(g[0]!.slice(0, 6).every((c) => c.day === null)).toBe(true);
    expect(g[0]![6]).toEqual({ day: '2026-11-01', n: 1, count: 0 });
    expect(g.flat().filter((c) => c.day).length).toBe(30);
    expect(g.flat().find((c) => c.day === '2026-11-20')).toEqual({ day: '2026-11-20', n: 20, count: 2 });
    expect(g[5]!.slice(1).every((c) => c.day === null)).toBe(true);
  });
  it('Feb 2027 starts on a Monday and has exactly 4 weeks', () => {
    const g = monthGrid('2027-02', new Map());
    expect(g).toHaveLength(4);
    expect(g[0]![0]!.day).toBe('2027-02-01');
    expect(g[3]![6]!.day).toBe('2027-02-28');
  });
  it('leap February has 29 days', () => {
    expect(monthGrid('2028-02', new Map()).flat().filter((c) => c.day).length).toBe(29);
  });
  it('shiftMonth crosses years both ways', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-11', 14)).toBe('2028-01');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
    expect(monthOfDay('2026-11-20')).toBe('2026-11');
  });
});

describe('repeat a session (cloning)', () => {
  const src = sess('old', '2026-11-10T06:00:00.000Z', [
    item('squat', [w(100, 5)], 2, 'done', { plan: { sets: 3, repMin: 5, repMax: 5 } as never }),
    item('curl', [], 0, 'skipped', { skipReason: 'pain' as never }),
    item('bench-press', [w(60, 10)], 1, 'later'),
  ], '2026-11-10T07:00:00.000Z');
  const src2: Session = { ...src, routineId: 'r1', dayId: 'd1', dayName: 'Push' };
  it('same exercises in the same order, all todo, no sets, no skip reason, new id and start', () => {
    const c = repeatOf(src2, 'new', Date.parse('2026-11-20T06:00:00.000Z'));
    expect(c.id).toBe('new');
    expect(c.clientId).toBe('new');
    expect(c.startedAt).toBe('2026-11-20T06:00:00.000Z');
    expect(c.endedAt).toBeUndefined();
    expect(c.items.map((i) => (i.ref as { slug: string }).slug)).toEqual(['curl', 'bench-press', 'squat']);
    expect(c.items.map((i) => i.order)).toEqual([0, 1, 2]);
    expect(c.items.every((i) => i.status === 'todo' && i.sets.length === 0 && i.skipReason === undefined)).toBe(true);
    expect(c.items[2]!.plan).toBeDefined();
    expect([c.routineId, c.dayId, c.dayName]).toEqual(['r1', 'd1', 'Push']);
  });
  it('does not touch the original and a free session stays free', () => {
    const before = JSON.stringify(src);
    const c = repeatOf(src, 'n2', 0);
    expect(JSON.stringify(src)).toBe(before);
    expect(c.routineId).toBeUndefined();
    expect(c.dayName).toBeUndefined();
  });
});

describe('PR integration (summary reads Phase 37 PRs)', () => {
  const a = sess('a', '2026-11-03T06:00:00.000Z', [item('bench-press', [w(60, 10), w(60, 9)])], '2026-11-03T07:00:00.000Z');
  const b = sess('b', '2026-11-10T06:00:00.000Z', [item('bench-press', [w(65, 8), w(60, 10)])], '2026-11-10T07:00:00.000Z');
  it('the very first log is a baseline, not a PR (Phase 37 rule)', () => {
    expect(sessionPRs(a, [a, b])).toEqual([]);
  });
  it('a later session beats the earlier one and names the old record', () => {
    const prs = sessionPRs(b, [a, b]);
    const weight = prs[0]!.hits.find((h) => h.metric === 'weight');
    expect(weight).toMatchObject({ value: 65, previous: 60 });
  });
  it('a session that does not beat anything has no PRs, and later sessions are never history for an earlier one', () => {
    const c = sess('c', '2026-11-17T06:00:00.000Z', [item('bench-press', [w(55, 8)])], '2026-11-17T07:00:00.000Z');
    expect(sessionPRs(c, [a, b, c])).toEqual([]);
    expect(sessionPRs(a, [a, b, c])).toEqual([]);
  });
});

describe('prWall', () => {
  const a = sess('a', '2026-11-03T06:00:00.000Z', [item('bench-press', [w(60, 10)]), item('squat', [w(100, 5)], 1)], '2026-11-03T07:00:00.000Z');
  const b = sess('b', '2026-11-10T06:00:00.000Z', [item('bench-press', [w(65, 8)])], '2026-11-10T07:00:00.000Z');
  it('lists every current record, newest first, each with the day it was set', () => {
    const wall = prWall(buildBoard([a, b]));
    expect(wall.length).toBeGreaterThan(0);
    const days = wall.map((e) => e.day);
    expect([...days].sort().reverse()).toEqual(days);
    expect(wall.find((e) => e.slug === 'bench-press' && e.metric === 'weight')).toMatchObject({ value: 65, day: '2026-11-10' });
    expect(wall.find((e) => e.slug === 'squat' && e.metric === 'weight')).toMatchObject({ value: 100, day: '2026-11-03' });
  });
  it('an empty board gives an empty wall', () => {
    expect(prWall([])).toEqual([]);
  });
});

describe('assisted exercises', () => {
  const s = sess('as', '2026-11-20T06:00:00.000Z', [item('assisted-pull-up', [w(20, 10), w(null, 5)])], '2026-11-20T06:30:00.000Z');
  it('lift = bodyweight minus assist; no assist = full bodyweight; default 70 kg', () => {
    expect(summaryOf(s).volume).toBe(50 * 10 + 70 * 5);
    expect(summaryOf(s, 80).volume).toBe(60 * 10 + 80 * 5);
  });
  it('never below 0 and other exercises are untouched', () => {
    expect(summaryOf(sess('b', '2026-11-20T06:00:00.000Z', [item('assisted-dip', [w(90, 10)])])).volume).toBe(0);
    expect(summaryOf(sess('c', '2026-11-20T06:00:00.000Z', [item('bench-press', [w(60, 10)])]), 99).volume).toBe(600);
  });
});

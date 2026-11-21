import { describe, expect, it } from 'vitest';
import { classifyPrograms, copyProgram, followProgram, followedId, itemAvailable, parsePrograms, programChanged, visiblePrograms, emptyProgramState } from '../../src/shared/gymPrograms';
import { toServerOps } from '../../src/shared/sync';

const programs = [
  { id: 'p1', slug: 'fat-burn', name: 'Fat burn', days_per_week: 3, weeks: 8, goal: 'Lose fat', status: 'approved' },
  { id: 'p2', slug: 'strength', name: 'Strength', days_per_week: 4, status: 'approved' },
  { id: 'p3', slug: 'draft', name: 'Draft', status: 'draft' },
  { id: 'p4', slug: 'gone', name: 'Gone', status: 'approved', deleted_at: '2026-01-01T00:00:00Z' },
];
const days = [
  { id: 'd2', program_id: 'p1', position: 2, name: 'Pull', target_muscles: ['lats'] },
  { id: 'd1', program_id: 'p1', position: 1, name: 'Push', target_muscles: ['chest'] },
  { id: 'd3', program_id: 'p2', position: 1, name: 'Squat day', target_muscles: [] },
];
const items = [
  { id: 'i2', day_id: 'd1', position: 2, exercise_ref: 'dumbbell-press', sets: 3, rep_min: 10, rep_max: 12, rest_sec: 60 },
  { id: 'i1', day_id: 'd1', position: 1, exercise_ref: 'bench-press', sets: 4, rep_min: 6, rep_max: 8, rest_sec: 120, note: 'Slow' },
  { id: 'i3', day_id: 'd2', position: 1, exercise_ref: 'row', sets: 3, rep_min: 8, rep_max: 8, rest_sec: 90 },
  { id: 'i4', day_id: 'd1', position: 3, exercise_ref: '', sets: 3 },
];
const all = parsePrograms(programs, days, items, [{ program_id: 'p2' }]);
let n = 0;
const mk = () => `id${++n}`;

describe('gym programs', () => {
  it('parses approved, live programs with ordered days and items', () => {
    expect(all.map((p) => p.slug)).toEqual(['fat-burn', 'strength']);
    const f = all[0]!;
    expect(f.days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    expect(f.days[0]!.items.map((i) => i.ref)).toEqual(['bench-press', 'dumbbell-press']);
    expect(f.days[0]!.items[0]).toMatchObject({ sets: 4, repMin: 6, repMax: 8, restSec: 120, note: 'Slow' });
    expect(f.weeks).toBe(8);
    expect(all[1]!.assigned).toBe(true);
  });

  it('shows published plus assigned only', () => {
    expect(visiblePrograms(all, []).map((p) => p.slug)).toEqual(['strength']);
    expect(visiblePrograms(all, ['fat-burn']).map((p) => p.slug)).toEqual(['fat-burn', 'strength']);
  });

  it('copy to mine is an editable snapshot with source gym:<slug> and a free name', () => {
    const r = copyProgram(all[0]!, mk, ['Fat burn']);
    expect(r.source).toBe('gym:fat-burn');
    expect(r.followed).toBeUndefined();
    expect(r.name).toBe('Fat burn 2');
    expect(r.days).toHaveLength(2);
    expect(r.days[0]!.items[0]!.ref).toEqual({ kind: 'lib', slug: 'bench-press' });
    expect(r.days[0]!.items[0]).toMatchObject({ sets: 4, repMin: 6, repMax: 8, restSec: 120 });
  });

  it('follow makes a read-only mirror; a refresh keeps day ids, active and schedule', () => {
    const first = followProgram(all[0]!, mk);
    expect(first).toMatchObject({ id: followedId('fat-burn'), source: 'gym', followed: true });
    const mine = { ...first, active: true, schedule: { x: 1 } };
    const changed = { ...all[0]!, days: [{ ...all[0]!.days[0]!, name: 'Push A' }, all[0]!.days[1]!] };
    expect(programChanged(mine, all[0]!)).toBe(false);
    expect(programChanged(mine, changed)).toBe(true);
    const next = followProgram(changed, mk, mine);
    expect(next.days.map((d) => d.id)).toEqual(mine.days.map((d) => d.id));
    expect(next.days[0]!.name).toBe('Push A');
    expect(next.active).toBe(true);
    expect(next.schedule).toEqual({ x: 1 });
  });

  it('a followed routine is never sent to the gym', () => {
    const r = followProgram(all[0]!, mk);
    expect(toServerOps('routines', 'put', { ...(r as unknown as Record<string, unknown>), client_id: r.id, updated_at: 1 })).toEqual([]);
    expect(toServerOps('routines', 'remove', { ...(r as unknown as Record<string, unknown>), client_id: r.id, updated_at: 1, deleted_at: 2 })).toEqual([]);
    const copy = copyProgram(all[0]!, mk, []);
    expect(toServerOps('routines', 'put', { ...(copy as unknown as Record<string, unknown>), client_id: copy.id, updated_at: 1 })).toHaveLength(1);
  });

  it('classifies cards, ignored and ended', () => {
    const vis = visiblePrograms(all, ['fat-burn']);
    const st = { followed: { 'strength': all[1]!, 'old-one': { ...all[0]!, slug: 'old-one', name: 'Old' } }, ignored: ['fat-burn', 'strength'] };
    const l = classifyPrograms(vis, st);
    expect(l.cards.map((c) => [c.program.slug, c.followed])).toEqual([['strength', true]]); // a followed program is never hidden by Ignore
    expect(l.ignored.map((p) => p.slug)).toEqual(['fat-burn']);
    expect(l.ended.map((p) => p.slug)).toEqual(['old-one']);
    expect(classifyPrograms(vis, emptyProgramState()).cards).toHaveLength(2);
  });

  it('an item is not available when unknown or hidden by the gym', () => {
    expect(itemAvailable('row', new Set(['row']), new Set())).toBe(true);
    expect(itemAvailable('row', new Set(['row']), new Set(['row']))).toBe(false);
    expect(itemAvailable('nope', new Set(['row']), new Set())).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import type { MapRowTuple } from '../../src/shared/weights';
import {
  AXES, balance, neglectedMuscles, readyMuscles, recoveryMap, recoveryState, recoveryStates, sizeOf, TARGET_HOURS,
  type AxisId, type RecoveryEntry, type SizeClass,
} from '../../src/shared/recovery';
import { avoidFilter, markOf, parseMarks, setMark, withoutAvoided, type MuscleMark } from '../../src/shared/avoid';

const fx = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const clock = fx('recovery_clock');
const map = fx('recovery_map');
const bal = fx('recovery_balance');
const marks = fx('recovery_marks');

const MIN = 60_000;
const NOW = Date.parse(map.now);

describe('recovery clock (engines.md 5)', () => {
  for (const c of clock.cases) {
    it(`${c.size} ${c.minutesAgo === null ? 'never trained' : `${c.minutesAgo} min ago`} -> ${c.state}`, () => {
      const last = c.minutesAgo === null ? null : NOW - c.minutesAgo * MIN;
      expect(recoveryState(last, c.size as SizeClass, NOW)).toBe(c.state);
    });
  }
  it('target hours are 72 / 48 / 36', () => expect(TARGET_HOURS).toEqual({ large: 72, medium: 48, small: 36 }));
  it('every muscle in the fixture size lists has the size, and the "none" ids have no clock', () => {
    for (const size of ['large', 'medium', 'small'] as const) for (const id of clock.sizes[size]) expect(sizeOf(id)).toBe(size);
    for (const id of clock.sizes.none) expect(sizeOf(id)).toBeUndefined();
  });
  it('every muscle in the real taxonomy except full_body and cardio has a size', () => {
    const lines = readFileSync('contract/dataset/detailed_muscles/muscle_taxonomy_detailed.csv', 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
    const ids = lines.map((l) => l.split(',')[0]!);
    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) if (id !== 'full_body' && id !== 'cardio') expect(sizeOf(id), id).toBeDefined();
  });
});

describe('recovery map, ready list and neglected muscles', () => {
  const tax = buildTaxonomy(map.taxonomy);
  const entries: RecoveryEntry[] = map.entries.map((e: { minutesAgo: number; weights: Record<string, number> }) => ({ at: NOW - e.minutesAgo * MIN, weights: e.weights }));
  const rec = recoveryMap(entries, tax, NOW);

  for (const [id, want] of Object.entries<Record<string, unknown>>(map.map)) {
    it(`${id}: ${want.state}`, () => {
      const i = rec[id]!;
      expect(i.state).toBe(want.state);
      expect(i.size).toBe(want.size);
      expect(i.lastTrainedAt).toBe(want.minutesAgo === null ? null : NOW - (want.minutesAgo as number) * MIN);
      expect(i.hoursSince).toBe(want.hoursSince);
      expect(i.hoursLeft).toBe(want.hoursLeft);
    });
  }
  it('muscles with no clock are absent', () => {
    for (const id of map.absent) expect(rec[id]).toBeUndefined();
  });
  it('recoveryStates gives the id -> state record the scheduler reads', () => {
    expect(recoveryStates(rec).upper_chest).toBe('fatigued');
    expect(recoveryStates(rec).lats).toBe('recovering');
    expect(Object.keys(recoveryStates(rec))).toHaveLength(Object.keys(map.map).length);
  });
  it('ready list', () => expect(readyMuscles(rec, tax)).toEqual(map.ready));
  for (const c of map.neglected) {
    it(`neglected: ${c.name}`, () => expect(neglectedMuscles(c.raw, rec, tax, NOW)).toEqual(c.expect));
  }
  it('the same input always gives the same result, and the input is not changed', () => {
    const copy = JSON.stringify(entries);
    expect(recoveryMap(entries, tax, NOW)).toEqual(rec);
    expect(JSON.stringify(entries)).toBe(copy);
  });
});

describe('balance metrics', () => {
  for (const c of bal.cases) {
    it(c.name, () => {
      const out = balance(c.raw);
      for (const axis of Object.keys(AXES) as AxisId[]) expect(out[axis]).toEqual({ axis, ...c[axis] });
    });
  }
});

describe('avoid and sore marks (engines.md 6)', () => {
  const tax = buildTaxonomy(marks.taxonomy);
  for (const c of marks.filter) {
    it(c.name, () => {
      expect(avoidFilter(c.rows as MapRowTuple[], c.marks as MuscleMark[], tax)).toEqual({ excluded: c.excluded, sore: c.sore, penalty: c.penalty });
    });
  }
  it('avoid excludes and sore does not: withoutAvoided keeps sore items and the order', () => {
    const items = [
      { slug: 'a', rows: [['upper_chest', 'p', 'h']] },
      { slug: 'b', rows: [['biceps', 'p', 'h']] },
      { slug: 'c', rows: [['triceps', 'p', 'm']] },
    ];
    const rowsOf = (i: { rows: string[][] }) => i.rows as unknown as MapRowTuple[];
    expect(withoutAvoided(items, rowsOf, [{ muscle: 'chest', kind: 'avoid' }, { muscle: 'biceps', kind: 'sore' }], tax).map((i) => i.slug)).toEqual(['b', 'c']);
    expect(withoutAvoided(items, rowsOf, [], tax).map((i) => i.slug)).toEqual(['a', 'b', 'c']);
  });
  for (const c of marks.setMark) {
    it(`setMark: ${c.name}`, () => {
      const before = JSON.stringify(c.from);
      expect(setMark(c.from, c.muscle, c.kind)).toEqual(c.to);
      expect(JSON.stringify(c.from)).toBe(before);
    });
  }
  for (const c of marks.parse) it(`parseMarks: ${c.name}`, () => expect(parseMarks(c.rows)).toEqual(c.to));
  for (const c of marks.markOf) {
    it(`markOf: ${c.name}`, () => expect(markOf(c.marks, c.muscle, tax) ?? null).toBe(c.kind));
  }
});

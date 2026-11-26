import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import Papa from 'papaparse';
import { buildLadderIndex, computeBadges, groupsOf, ladderFromRecord, mapRowFromRecord, tierFromRecord, withCore, type BadgeData, type BadgeInput, type BadgeResult } from '../../src/shared/badges';
import { CORE_LADDERS, CORE_MAP, maxRepsOf, repsFor } from '../../src/shared/badges/core';

const csv = (p: string): Array<Record<string, string>> => Papa.parse<Record<string, string>>(readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'), { header: true, skipEmptyLines: true }).data;
const base: BadgeData = {
  ladders: csv('contract/dataset/strength_ladders.csv').map(ladderFromRecord),
  map: csv('contract/dataset/strength_ladder_map.csv').map(mapRowFromRecord).filter((r): r is NonNullable<typeof r> => r != null),
  tiers: csv('contract/dataset/tier_fractions.csv').map(tierFromRecord),
};
const data = withCore(base);
const taxonomy = csv('contract/dataset/detailed_muscles/muscle_taxonomy_detailed.csv');
const groups = groupsOf(taxonomy.map((r) => ({ id: r.id!, parentGroup: r.parent_group! })));

const run = (slug: string, set: { weightKg: number | null; reps: number | null; seconds?: number }, sex: 'm' | 'f' = 'm'): BadgeResult => {
  const input: BadgeInput = {
    sessions: [{ id: 's1', day: '2026-11-20', exercises: [{ slug, weights: { abs: 1 }, sets: [{ ...set, tag: 'normal' }] }] }],
    bodyStats: [{ day: '2026-11-01', kg: 80 }], sex, asOf: '2026-11-25', groups,
  };
  const r = computeBadges(data, input);
  if (r.status !== 'ok') throw new Error('not ok');
  return r;
};

describe('core ladders', () => {
  it('rows are valid: muscles in the taxonomy, every mapped ladder exists, no clash with published slugs', () => {
    const ids = new Set(taxonomy.map((r) => r.id));
    for (const l of CORE_LADDERS) for (const m of Object.keys(l.muscles)) expect(ids.has(m), `${l.ladderId}:${m}`).toBe(true);
    const idx = buildLadderIndex(data);
    for (const m of CORE_MAP) expect(idx.ladder(m.ladderId), m.slug).toBeDefined();
    const published = new Set(base.map.map((m) => m.slug));
    for (const m of CORE_MAP) expect(published.has(m.slug), m.slug).toBe(false);
  });
  it('every core slug is a real library exercise', () => {
    const slugs = new Set<string>();
    for (const f of readdirSync('src/dataset/generated').filter((x) => x.startsWith('exercises.detail.'))) for (const k of Object.keys(JSON.parse(readFileSync(`src/dataset/generated/${f}`, 'utf8')))) slugs.add(k);
    for (const m of CORE_MAP) expect(slugs.has(m.slug), m.slug).toBe(true);
  });
  it('withCore twice adds nothing more', () => {
    expect(withCore(data).ladders).toHaveLength(data.ladders.length);
    expect(withCore(data).map).toHaveLength(data.map.length);
  });
});

describe('high reps', () => {
  it('60 kg x 16 kneeling cable crunch now ranks abs (it used to be skipped above 12 reps)', () => {
    const r = run('kneeling-cable-crunch', { weightKg: 60, reps: 16 });
    expect(r.muscles.abs!.tier).toBeGreaterThanOrEqual(5);
  });
  it('only core ladders get the 30-rep cap; others keep 12', () => {
    expect(maxRepsOf('cable_crunch')).toBe(30);
    expect(maxRepsOf('crunch')).toBe(30);
    expect(maxRepsOf('bench_press')).toBe(12);
    const r = run('kneeling-cable-crunch', { weightKg: 60, reps: 31 });
    expect(r.muscles.abs?.tier ?? null).toBeNull();
  });
  it('bodyweight crunch and a sit-up rank abs', () => {
    expect(run('crunch', { weightKg: null, reps: 25 }).muscles.abs!.tier).not.toBeNull();
    expect(run('sit-up', { weightKg: null, reps: 20 }).muscles.abs!.tier).not.toBeNull();
  });
});

describe('plank by time', () => {
  it('seconds become reps on the plank ladder only', () => {
    expect(repsFor('plank', null, 60)).toBe(20);
    expect(repsFor('plank', null, 2)).toBeNull();
    expect(repsFor('bench_press', null, 60)).toBeNull();
    expect(repsFor('plank', 12, 60)).toBe(12);
    expect(repsFor('plank', null, 600)).toBe(30);
  });
  it('a 60 s plank ranks abs; longer is not lower', () => {
    const a = run('plank', { weightKg: null, reps: null, seconds: 60 }).muscles.abs!.tier!;
    const b = run('plank', { weightKg: null, reps: null, seconds: 120 }).muscles.abs!.tier!;
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeGreaterThanOrEqual(a);
  });
});

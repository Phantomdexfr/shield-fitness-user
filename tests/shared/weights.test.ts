import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import {
  applyVariation, exerciseWeights, fallbackRows, muscleWeight, rowsToWeights, shiftFor, type MapRowTuple,
} from '../../src/shared/weights';

/** Minimal CSV reader (quotes, doubled quotes, commas and newlines inside quotes) so the test needs no extra package. */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  const head = (rows.shift() ?? []).map((h) => h.replace(/^\uFEFF/, ''));
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// Rows below are copied from the real compiled files (src/dataset/generated/muscle_map + variation_shift).
const CABLE_BENCH_PRESS: MapRowTuple[] = [['lower_chest', 'p', 'h', 0], ['upper_chest', 'p', 'm', 0], ['triceps', 's', 'h', 0], ['front_delts', 's', 'm', 0]];
const CABLE_BENCH_PRESS_SHIFT = { 'Incline bench': [['upper_chest', 'm'], ['front_delts', 'm']] } as const;
const INCLINE_BARBELL: MapRowTuple[] = [['upper_chest', 'p', 'h', 0], ['lower_chest', 'p', 'm', 0], ['front_delts', 's', 'h', 0], ['triceps', 's', 'm', 0]];
const INCLINE_BARBELL_SHIFT = { 'Low incline angle': [['upper_chest', 'l'], ['lower_chest', 'm'], ['front_delts', 'l']] } as const;
const CABLE_BENCH_FLY: MapRowTuple[] = [['lower_chest', 'p', 'h', 0], ['upper_chest', 'p', 'm', 0], ['front_delts', 's', 'l', 0], ['biceps', 't', 'l', 0]];
const CABLE_BENCH_FLY_SHIFT = { 'Incline bench': [['upper_chest', 'm'], ['front_delts', 'm']] } as const;
const ASSISTED_PULL_UP: MapRowTuple[] = [['lats', 'p', 'h', 0], ['rhomboids_teres', 'p', 'm', 0], ['biceps', 's', 'm', 0], ['mid_lower_traps', 's', 'm', 0], ['forearms', 's', 'm', 0], ['abs', 't', 'l', 0]];
const HIP_SWITCH: MapRowTuple[] = [['glutes', 'm', 'm', 0], ['abductors', 'm', 'm', 0], ['adductors', 'm', 'm', 0], ['hip_flexors', 'm', 'l', 0]];
const AB_ROLLOUT: MapRowTuple[] = [['abs', 'p', 'h', 0], ['front_delts', 's', 'm', 0], ['lower_back', 't', 'm', 0]];

describe('muscleWeight (engines.md 2)', () => {
  it('uses emphasis factors, stabiliser x0.5, mobility 0', () => {
    expect(muscleWeight('p', 'h')).toBe(1);
    expect(muscleWeight('p', 'm')).toBe(0.6);
    expect(muscleWeight('s', 'l')).toBe(0.3);
    expect(muscleWeight('t', 'm')).toBe(0.3);
    expect(muscleWeight('t', 'l')).toBe(0.15);
    expect(muscleWeight('t', 'h')).toBe(0.5);
    expect(muscleWeight('m', 'h')).toBe(0);
  });
  it('accepts the long names custom exercises use, and rejects unknowns', () => {
    expect(muscleWeight('primary', 'high')).toBe(1);
    expect(muscleWeight('stabiliser', 'medium')).toBe(0.3);
    expect(muscleWeight('mobility', 'high')).toBe(0);
    expect(muscleWeight('x', 'h')).toBe(0);
    expect(muscleWeight('p', 'x')).toBe(0);
  });
  it('turns real rows into weights; mobility-only rows give none', () => {
    expect(rowsToWeights(ASSISTED_PULL_UP)).toEqual({ lats: 1, rhomboids_teres: 0.6, biceps: 0.6, mid_lower_traps: 0.6, forearms: 0.6, abs: 0.15 });
    expect(rowsToWeights(HIP_SWITCH)).toEqual({});
    expect(rowsToWeights(AB_ROLLOUT)).toEqual({ abs: 1, front_delts: 0.6, lower_back: 0.3 });
  });
});

describe('applyVariation (engines.md 3), real rows', () => {
  it('an incline variation raises upper chest (and front delts) x1.25', () => {
    const base = rowsToWeights(CABLE_BENCH_PRESS);
    expect(base.upper_chest).toBe(0.6);
    const w = exerciseWeights(CABLE_BENCH_PRESS, 'Incline bench', CABLE_BENCH_PRESS_SHIFT);
    expect(w.upper_chest).toBe(0.75);
    expect(w.front_delts).toBe(0.75);
    expect(w.lower_chest).toBe(1); // untouched
    expect(w.triceps).toBe(1);
    expect(base.upper_chest).toBe(0.6); // base object not changed
  });
  it('low incline: less x0.75 on upper chest, more x1.25 on lower chest, front delts less', () => {
    const w = exerciseWeights(INCLINE_BARBELL, 'Low incline angle', INCLINE_BARBELL_SHIFT);
    expect(w).toEqual({ upper_chest: 0.75, lower_chest: 0.75, front_delts: 0.75, triceps: 0.6 });
  });
  it('stabiliser and secondary rows shift from their own weight', () => {
    const w = exerciseWeights(CABLE_BENCH_FLY, 'Incline bench', CABLE_BENCH_FLY_SHIFT);
    expect(w.front_delts).toBe(0.375);
    expect(w.upper_chest).toBe(0.75);
    expect(w.biceps).toBe(0.15);
  });
  it('caps at 1.0', () => {
    expect(applyVariation({ chest: 1, lats: 0.9 }, [['chest', 'm'], ['lats', 'more']])).toEqual({ chest: 1, lats: 1 });
  });
  it('adds an absent "more" muscle at 0.3; an absent "less" muscle stays absent (synthetic base)', () => {
    expect(applyVariation({ chest: 1 }, [['triceps', 'm'], ['abs', 'l']])).toEqual({ chest: 1, triceps: 0.3 });
  });
  it('a mobility-only muscle counts as absent', () => {
    const w = exerciseWeights(HIP_SWITCH, 'Slow', { Slow: [['glutes', 'm']] });
    expect(w).toEqual({ glutes: 0.3 });
  });
  it('a variation with no shift row (or none given) uses base weights; text matches loosely', () => {
    expect(exerciseWeights(ASSISTED_PULL_UP, 'Slow tempo', {})).toEqual(rowsToWeights(ASSISTED_PULL_UP));
    expect(exerciseWeights(ASSISTED_PULL_UP)).toEqual(rowsToWeights(ASSISTED_PULL_UP));
    expect(shiftFor(CABLE_BENCH_PRESS_SHIFT, '  incline   BENCH ')).toEqual([['upper_chest', 'm'], ['front_delts', 'm']]);
    expect(shiftFor(undefined, 'x')).toEqual([]);
  });
});

describe('fallback agrees with the compiler on the real 42 exercises', () => {
  const dir = 'src/dataset/generated';
  const file = (prefix: string): string => readdirSync(dir).find((n) => n.startsWith(prefix))!;
  const muscles = (JSON.parse(readFileSync(`${dir}/${file('muscles.')}`, 'utf8')) as { muscles: Array<{ id: string; parent: string }> }).muscles;
  const compiled = JSON.parse(readFileSync(`${dir}/${file('muscle_map.')}`, 'utf8')) as Record<string, Array<[string, string, string, number]>>;
  const tax = buildTaxonomy(muscles);
  const csv = readFileSync('contract/dataset/exercise_categories/exercise_categories_all.csv', 'utf8').replace(/\r\n?/g, '\n');
  const master = parseCsv(csv);
  const split = (s: string | undefined): string[] => (s ?? '').split(';').map((x) => x.trim()).filter(Boolean);

  it('same rows, same order, for every fallback exercise', () => {
    const fallbackSlugs = Object.keys(compiled).filter((s) => compiled[s]![0]![3] === 1);
    expect(fallbackSlugs.length).toBe(42);
    const bySlug = new Map(master.map((r) => [r.slug!, r]));
    for (const slug of fallbackSlugs) {
      const r = bySlug.get(slug)!;
      expect(fallbackRows(split(r.primary_muscles), split(r.secondary_muscles), tax), slug).toEqual(compiled[slug]);
    }
  });
  it('expands a core id to its children and lets primary win', () => {
    expect(fallbackRows(['chest'], ['chest', 'triceps'], tax)).toEqual([
      ['upper_chest', 'p', 'm', 1], ['lower_chest', 'p', 'm', 1], ['triceps', 's', 'l', 1],
    ]);
  });
});

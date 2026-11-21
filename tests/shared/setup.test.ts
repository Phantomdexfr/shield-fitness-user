import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { applySetup, exerciseWeights, rowsToWeights, type MapRowTuple, type SetupShiftTable, type Weights } from '../../src/shared/weights';
import { parseSetup } from '../../src/shared/setup';

const fx = (name: string) => JSON.parse(readFileSync(`contract/fixtures/${name}`, 'utf8')).cases as any[];
const generated = (prefix: string) => {
  const f = readdirSync('src/dataset/generated').find((n) => n.startsWith(prefix))!;
  return JSON.parse(readFileSync(`src/dataset/generated/${f}`, 'utf8'));
};
const same = (got: Weights, want: Record<string, number>) => {
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toBeCloseTo(want[k]!, 6);
};

describe('setup_examples fixtures (worked examples)', () => {
  for (const c of fx('setup_examples.json')) {
    it(c.id, () => same(applySetup(rowsToWeights(c.rows as MapRowTuple[]), c.setup, c.pattern, c.table), c.expected));
  }
});

describe('setup_stacking fixtures (stack, cap, absent)', () => {
  for (const c of fx('setup_stacking.json')) {
    it(c.id, () => same(applySetup(c.base, c.setup, c.pattern, c.table), c.expected));
  }
});

describe('exact variation row beats setup shift', () => {
  for (const c of fx('setup_variation_wins.json')) {
    it(c.id, () => {
      const w = exerciseWeights(c.rows, c.variation, { [c.variation]: c.variationShift }, { setup: c.setup, pattern: c.pattern, table: c.table });
      same(w, c.expected);
    });
  }
  it('without the exact row the setup shift does apply to that muscle', () => {
    const c = fx('setup_variation_wins.json')[0];
    const w = exerciseWeights(c.rows, 'Other', {}, { setup: c.setup, pattern: c.pattern, table: c.table });
    expect(w.biceps).toBeCloseTo(0.75, 6);
  });
});

describe('applySetup edges', () => {
  const table: SetupShiftTable = { grip: { neutral: { any: [['forearms', 'm']] } } };
  it('does not change its input and returns the same weights with no setup or table', () => {
    const base = { lats: 0.6 };
    expect(applySetup(base, undefined, 'row', table)).toEqual(base);
    expect(applySetup(base, { grip: 'neutral' }, 'row', undefined)).toEqual(base);
    applySetup(base, { grip: 'neutral' }, 'row', table);
    expect(base).toEqual({ lats: 0.6 });
  });
  it('`any` rows apply to every pattern, and an unknown value or axis is ignored', () => {
    expect(applySetup({ forearms: 0.3 }, { grip: 'neutral' }, undefined, table).forearms).toBeCloseTo(0.375, 6);
    expect(applySetup({ forearms: 0.3 }, { grip: 'hammer', angleDeg: 30 }, 'row', table)).toEqual({ forearms: 0.3 });
  });
});

describe('fixtures match the compiled data (not stale)', () => {
  it('every table slice in the fixtures equals the real setup_options.json shift', () => {
    const real = generated('setup_options.').shift;
    for (const f of ['setup_examples.json', 'setup_stacking.json', 'setup_variation_wins.json']) {
      for (const c of fx(f)) {
        for (const [axis, vals] of Object.entries<any>(c.table)) {
          for (const [val, pats] of Object.entries<any>(vals)) {
            for (const [pat, rows] of Object.entries(pats)) expect(real[axis][val][pat], `${c.id} ${axis}/${val}/${pat}`).toEqual(rows);
          }
        }
      }
    }
  });
  it('real lat pulldown rows and pattern: supinated through the real table', () => {
    const o = generated('setup_options.');
    const map = generated('muscle_map.');
    const w = exerciseWeights(map['lat-pulldown'], undefined, undefined, { setup: { grip: 'supinated' }, pattern: o.patterns['lat-pulldown'], table: o.shift });
    expect(w.biceps).toBeCloseTo(0.75, 6);
    expect(w.lats).toBe(1);
  });
});

describe('Setup schema', () => {
  it('accepts partial setups and angleDeg', () => {
    expect(parseSetup({}).ok).toBe(true);
    expect(parseSetup({ grip: 'supinated', width: 'wide', angleDeg: 30 }).ok).toBe(true);
  });
  it('rejects unknown values, unknown keys and a bad angle', () => {
    expect(parseSetup({ grip: 'sideways' }).ok).toBe(false);
    expect(parseSetup({ speed: 'fast' }).ok).toBe(false);
    expect(parseSetup({ angleDeg: 120 }).ok).toBe(false);
  });
});

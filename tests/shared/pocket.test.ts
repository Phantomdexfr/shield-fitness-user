import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  actualRest, adjustRest, classOf, clockText, defaultRest, elapsedRest, platesFor, remainingRest, restDone, restSeconds, startRest, warmupSets, type ExerciseClass,
} from '../../src/shared/pocket';

const read = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const plates = read('pocket_plates');
const warm = read('pocket_warmup');
const rest = read('pocket_rest');

describe('platesFor (fixtures pocket_plates)', () => {
  for (const c of plates.cases) {
    it(c.id, () => {
      const r = platesFor(c.target, c.bar, c.plates);
      expect(r.perSide.map((p) => [p.plate, p.count])).toEqual(c.perSide);
      expect(r.total).toBe(c.total);
      expect(r.remainder).toBe(c.remainder);
      expect(r.nextUp).toBe(c.nextUp);
      expect(r.belowBar).toBe(c.belowBar);
    });
  }
  it('never drifts on 1.25 kg plates and always loads bar + 2 x sides (pairs: targets step by 2.5)', () => {
    for (let target = 20; target <= 300; target += 2.5) {
      const r = platesFor(target, 20, [25, 20, 15, 10, 5, 2.5, 1.25]);
      const side = r.perSide.reduce((a, p) => a + p.plate * p.count, 0);
      expect(Math.round((20 + 2 * side) * 100) / 100).toBe(r.total);
      expect(r.remainder).toBe(0);
    }
  });
  it('bad numbers do not throw', () => {
    expect(platesFor(Number.NaN, 20, [20]).belowBar).toBe(true);
    expect(platesFor(100, Number.NaN, [20]).total).toBeGreaterThanOrEqual(0);
  });
});

describe('warmupSets (fixtures pocket_warmup)', () => {
  for (const c of warm.cases) {
    it(c.id, () => {
      expect(warmupSets(c.working, c.class as ExerciseClass, c.step).map((r) => [r.weightKg, r.reps])).toEqual(c.ramp);
    });
  }
  it('bad step or weight gives no ramp', () => {
    expect(warmupSets(100, 'compound', 0)).toEqual([]);
    expect(warmupSets(Number.NaN, 'compound', 2.5)).toEqual([]);
  });
});

describe('restSeconds (fixtures pocket_rest)', () => {
  for (const c of rest.cases) {
    it(c.id, () => {
      expect(restSeconds({ cls: c.class as ExerciseClass, reps: c.reps, e1rmFraction: c.fraction, history: c.history })).toBe(c.seconds);
    });
  }
  it('defaultRest has no learning', () => {
    expect(defaultRest('compound', 8)).toBe(90);
    expect(defaultRest('compound', 3)).toBe(180);
  });
});

describe('classOf', () => {
  it('maps library values', () => {
    expect(classOf({ kind: 'strength', category: 'compound', subCategory: 'push' })).toBe('compound');
    expect(classOf({ kind: 'strength', category: 'isolation', subCategory: 'biceps' })).toBe('isolation');
    expect(classOf({ kind: 'cardio', category: 'other', subCategory: 'cardio_machine' })).toBe('cardio');
    expect(classOf({ kind: 'strength', category: 'other', subCategory: 'conditioning' })).toBe('cardio');
    expect(classOf({ kind: 'strength', category: 'warmup', subCategory: 'dynamic' })).toBe('mobility');
    expect(classOf({ kind: 'bodyweight', category: 'other', subCategory: 'core' })).toBe('bodyweight');
    expect(classOf({ kind: '', category: '', subCategory: '' })).toBe('isolation');
  });
});

describe('rest timer with a fake clock', () => {
  const t0 = 1_000_000;
  it('counts down from the start time', () => {
    const t = startRest(t0, 90);
    expect(remainingRest(t, t0)).toBe(90);
    expect(remainingRest(t, t0 + 30_000)).toBe(60);
    expect(remainingRest(t, t0 + 89_999)).toBe(1);
    expect(restDone(t, t0 + 89_999)).toBe(false);
    expect(remainingRest(t, t0 + 90_000)).toBe(0);
    expect(restDone(t, t0 + 90_000)).toBe(true);
    expect(remainingRest(t, t0 + 500_000)).toBe(0);
  });
  it('a clock that goes backwards never gives more than the full rest', () => {
    const t = startRest(t0, 90);
    expect(elapsedRest(t, t0 - 5000)).toBe(0);
    expect(remainingRest(t, t0 - 5000)).toBe(90);
  });
  it('adjusts by seconds, never below 0 or above 15 minutes', () => {
    const t = startRest(t0, 90);
    expect(adjustRest(t, 15).seconds).toBe(105);
    expect(adjustRest(t, -15).seconds).toBe(75);
    expect(adjustRest(t, -500).seconds).toBe(0);
    expect(adjustRest(t, 5000).seconds).toBe(900);
    expect(adjustRest(t, 15).startedAt).toBe(t0);
  });
  it('records the real rest only when it is plausible', () => {
    const t = startRest(t0, 90);
    expect(actualRest(null, t0)).toBeUndefined();
    expect(actualRest(t, t0 + 3000)).toBeUndefined();
    expect(actualRest(t, t0 + 45_000)).toBe(45);
    expect(actualRest(t, t0 + 120_000)).toBe(120);
    expect(actualRest(t, t0 + 1_000_000)).toBeUndefined();
  });
  it('formats the clock', () => {
    expect(clockText(75)).toBe('1:15');
    expect(clockText(5)).toBe('0:05');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(600)).toBe('10:00');
  });
  it('a zero or negative rest is a finished timer', () => {
    expect(restDone(startRest(t0, 0), t0)).toBe(true);
    expect(startRest(t0, -5).seconds).toBe(0);
  });
});

import { describe, expect, test } from 'vitest';
import { WHEEL_MAX_ITEMS, clampValue, indexAtScroll, nearestIndex, scrollForIndex, snapValue, stepIndex, weightWheel, wheelValues } from '../../src/shared/wheel';

describe('wheelValues', () => {
  test('counts from min by step, inclusive of max when on the grid', () => {
    expect(wheelValues(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
    expect(wheelValues(0, 10, 2.5)).toEqual([0, 2.5, 5, 7.5, 10]);
  });
  test('a max off the grid is not included', () => {
    expect(wheelValues(0, 10, 4)).toEqual([0, 4, 8]);
  });
  test('2 dp: no float noise', () => {
    expect(wheelValues(0, 0.6, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  });
  test('one value when min equals max; empty for bad input', () => {
    expect(wheelValues(5, 5, 1)).toEqual([5]);
    expect(wheelValues(5, 1, 1)).toEqual([]);
    expect(wheelValues(0, 10, 0)).toEqual([]);
    expect(wheelValues(0, 10, -1)).toEqual([]);
    expect(wheelValues(NaN, 10, 1)).toEqual([]);
  });
  test('a runaway list is cut', () => {
    expect(wheelValues(0, 1e9, 1)).toHaveLength(WHEEL_MAX_ITEMS);
  });
});

describe('snapping and clamping', () => {
  const v = wheelValues(100, 250, 1);
  test('nearest index, ties keep the lower', () => {
    expect(nearestIndex([0, 10, 20], 4)).toBe(0);
    expect(nearestIndex([0, 10, 20], 6)).toBe(1);
    expect(nearestIndex([0, 10, 20], 5)).toBe(0);
    expect(nearestIndex([], 5)).toBe(-1);
    expect(nearestIndex([1, 2], NaN)).toBe(0);
  });
  test('snapValue clamps to the list ends', () => {
    expect(snapValue(v, 90)).toBe(100);
    expect(snapValue(v, 999)).toBe(250);
    expect(snapValue(v, 171.4)).toBe(171);
    expect(snapValue([], 3)).toBeNull();
  });
  test('clampValue', () => {
    expect(clampValue(5, 1, 3)).toBe(3);
    expect(clampValue(-5, 1, 3)).toBe(1);
    expect(clampValue(2, 1, 3)).toBe(2);
  });
  test('scroll offset <-> index, never outside the list', () => {
    expect(indexAtScroll(0, 10)).toBe(0);
    expect(indexAtScroll(44 * 3 + 10, 10)).toBe(3);
    expect(indexAtScroll(44 * 3 + 30, 10)).toBe(4);
    expect(indexAtScroll(99999, 10)).toBe(9);
    expect(indexAtScroll(-50, 10)).toBe(0);
    expect(indexAtScroll(100, 0)).toBe(0);
    expect(scrollForIndex(4)).toBe(176);
    expect(indexAtScroll(scrollForIndex(7), 10)).toBe(7);
  });
  test('keyboard steps clamp', () => {
    expect(stepIndex(0, -1, 5)).toBe(0);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(2, 5, 5)).toBe(4);
    expect(stepIndex(2, -5, 5)).toBe(0);
    expect(stepIndex(0, 3, 0)).toBe(0);
  });
});

describe('weightWheel (kg / lb)', () => {
  test('kg uses the machine step, else the app default 2.5', () => {
    expect(weightWheel('kg', 0, 20, 5)).toEqual({ min: 0, max: 20, step: 5, unit: 'kg' });
    expect(weightWheel('kg', 0, 20)).toMatchObject({ step: 2.5, unit: 'kg' });
    expect(weightWheel('kg', 0, 20, 0)).toMatchObject({ step: 2.5 });
    expect(weightWheel('kg', 0, 10, null)).toMatchObject({ step: 2.5 });
  });
  test('lb counts whole pounds inside the same kg limits', () => {
    const w = weightWheel('lb', 25, 400);
    expect(w).toMatchObject({ min: 56, max: 881, step: 1, unit: 'lb' });
    expect(wheelValues(w.min, w.max, w.step)[0]).toBe(56);
  });
  test('a kg list of an odd step is exact', () => {
    const w = weightWheel('kg', 0, 10, 1.25);
    expect(wheelValues(w.min, w.max, w.step)).toEqual([0, 1.25, 2.5, 3.75, 5, 6.25, 7.5, 8.75, 10]);
  });
});

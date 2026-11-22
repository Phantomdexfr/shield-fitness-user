// Phase 84: pure calendar helpers (month lengths, leap years, min/max, Monday-first grid).
import { describe, expect, test } from 'vitest';
import {
  clampDay, dayKeyOf, dayLabel, daysInMonth, firstWeekday, fitToMonth, inRange, isLeapYear, monthGrid, monthLabel, parseDay, parseMonth, shiftMonth, startDay, yearOfDay, yearOptions,
} from '../../src/shared/calendar';

const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

describe('month lengths and leap years', () => {
  test('every month of a normal year', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2023, m))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });
  test('leap years: divisible by 4, not by 100 unless by 400', () => {
    expect([2024, 2000, 1900, 2100, 2023, 2096].map(isLeapYear)).toEqual([true, true, false, false, false, true]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe('parse and format', () => {
  test('parseDay accepts real dates only', () => {
    expect(parseDay('1998-03-12')).toEqual({ y: 1998, m: 3, d: 12 });
    expect(parseDay('2023-02-29')).toBeNull();
    expect(parseDay('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
    expect(parseDay('12/03/1998')).toBeNull();
    expect(parseDay('')).toBeNull();
  });
  test('parseMonth', () => {
    expect(parseMonth('2026-07')).toEqual({ y: 2026, m: 7 });
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('2026-7')).toBeNull();
  });
  test('labels', () => {
    expect(dayLabel('1998-03-12', M)).toBe('12 Mar 1998');
    expect(dayLabel('', M)).toBe('');
    expect(monthLabel('1998-03', M)).toBe('Mar 1998');
    expect(yearOfDay('1998-03-12')).toBe('1998');
    expect(yearOfDay('nope')).toBe('');
    expect(dayKeyOf(5, 1, 2)).toBe('0005-01-02');
  });
});

describe('grid, Monday first', () => {
  test('1 Jan 2024 is a Monday; 1 Sep 2024 is a Sunday', () => {
    expect(firstWeekday(2024, 1)).toBe(0);
    expect(firstWeekday(2024, 9)).toBe(6);
  });
  test('always 42 cells, the 1st sits in its weekday column', () => {
    for (const [y, m] of [[2024, 1], [2024, 2], [2026, 11], [2023, 2], [1900, 2], [2100, 12]] as const) {
      const g = monthGrid(y, m);
      expect(g).toHaveLength(42);
      const first = g.findIndex((c) => c.inMonth);
      expect(first).toBe(firstWeekday(y, m));
      expect(g.filter((c) => c.inMonth)).toHaveLength(daysInMonth(y, m));
    }
  });
  test('Feb 2026 starts on a Sunday: six leading days from January, trailing days from March', () => {
    const g = monthGrid(2026, 2);
    expect(g[0]).toEqual({ key: '2026-01-26', day: 26, inMonth: false });
    expect(g[6]).toEqual({ key: '2026-02-01', day: 1, inMonth: true });
    expect(g[41]).toEqual({ key: '2026-03-08', day: 8, inMonth: false });
  });
  test('cells run in order with no gaps', () => {
    const keys = monthGrid(2024, 12).map((c) => c.key);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(42);
  });
  test('shiftMonth carries the year both ways', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(shiftMonth(2026, 5, -17)).toEqual({ y: 2024, m: 12 });
  });
});

describe('min and max', () => {
  test('inRange is inclusive and rejects non-dates', () => {
    expect(inRange('2026-05-10', '2026-05-10', '2026-05-20')).toBe(true);
    expect(inRange('2026-05-20', '2026-05-10', '2026-05-20')).toBe(true);
    expect(inRange('2026-05-09', '2026-05-10', '2026-05-20')).toBe(false);
    expect(inRange('2026-05-21', '2026-05-10', '2026-05-20')).toBe(false);
    expect(inRange('2026-05-21')).toBe(true);
    expect(inRange('2026-02-30')).toBe(false);
  });
  test('clampDay and startDay', () => {
    expect(clampDay('2026-01-01', '2026-05-10', '2026-05-20')).toBe('2026-05-10');
    expect(clampDay('2027-01-01', '2026-05-10', '2026-05-20')).toBe('2026-05-20');
    expect(clampDay('2026-05-15', '2026-05-10', '2026-05-20')).toBe('2026-05-15');
    expect(startDay('', '2026-11-22')).toBe('2026-11-22');
    expect(startDay('1998-03-12', '2026-11-22')).toBe('1998-03-12');
    expect(startDay('', '2026-11-22', undefined, '2026-11-01')).toBe('2026-11-01');
  });
  test('fitToMonth keeps the day and caps it at the month length', () => {
    expect(fitToMonth('2026-01-31', 2026, 2)).toBe('2026-02-28');
    expect(fitToMonth('2024-01-31', 2024, 2)).toBe('2024-02-29');
    expect(fitToMonth('2024-02-29', 2025, 2)).toBe('2025-02-28');
    expect(fitToMonth('2026-03-15', 2026, 11)).toBe('2026-11-15');
  });
  test('yearOptions is newest first and stays inside 1900..2100', () => {
    expect(yearOptions(2024, 2026)).toEqual([2026, 2025, 2024]);
    expect(yearOptions(1800, 1902)).toEqual([1902, 1901, 1900]);
    expect(yearOptions(2099, 2200)).toEqual([2100, 2099]);
    expect(yearOptions(2026, 2024)).toEqual([2026, 2025, 2024]);
  });
});

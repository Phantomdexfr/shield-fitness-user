import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { customSlug, isSlug, slugify } from '../../src/shared/slug';
import { formatPaise, kgToLb, lbToKg, roundKg } from '../../src/shared/units';
import {
  addDays, dayKeyStart, daysBetween, formatIst, isDayKey, istDayKey, istDayStart, istWeekStartKey, istWeekday, parseIso,
} from '../../src/shared/dates';
import {
  validateMuscleId, validateName, validateRepRange, validateReps, validateRpe, validateSeconds, validateWeightKg,
} from '../../src/shared/validators';
import { buildTaxonomy, rollUpMax } from '../../src/shared/muscles';
import { t } from '../../src/i18n';

const utc = (iso: string): number => Date.parse(iso);

describe('slug', () => {
  it('lower-kebabs, strips diacritics and punctuation', () => {
    expect(slugify('Crème Brûlée Press!')).toBe('creme-brulee-press');
    expect(slugify('Ñandú  Curl')).toBe('nandu-curl');
    expect(slugify('  --  ')).toBe('');
    expect(slugify("Farmer's Walk (30 m)")).toBe('farmer-s-walk-30-m');
  });
  it('caps length without a trailing hyphen', () => {
    const s = slugify(`${'a'.repeat(59)} bbbb`);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });
  it('makes my-<kebab> and resolves collisions with -2, -3', () => {
    expect(customSlug('Lat Pulldown', [])).toBe('my-lat-pulldown');
    expect(customSlug('Lat Pulldown', ['my-lat-pulldown'])).toBe('my-lat-pulldown-2');
    expect(customSlug('Lat Pulldown', ['my-lat-pulldown', 'my-lat-pulldown-2'])).toBe('my-lat-pulldown-3');
    expect(customSlug('!!!', [])).toBe('my-exercise');
    expect(customSlug('Lät  pulldown', ['my-lat-pulldown'])).toBe('my-lat-pulldown-2');
  });
  it('every real dataset slug is a valid slug', () => {
    const dir = 'src/dataset/generated';
    const f = readdirSync(dir).find((n) => n.startsWith('exercises.index.'))!;
    const idx = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { rows: string[][] };
    expect(idx.rows.length).toBe(634);
    expect(idx.rows.every((r) => isSlug(r[0]!))).toBe(true);
    expect(isSlug('Bad Slug')).toBe(false);
  });
});

describe('units', () => {
  it('rounds kg to 2 dp without float noise', () => {
    expect(roundKg(1.005)).toBe(1.01);
    expect(roundKg(2.675)).toBe(2.68);
    expect(roundKg(-1.005)).toBe(-1.01);
    expect(roundKg(0.1 + 0.2)).toBe(0.3);
    expect(roundKg(Number.NaN)).toBe(0);
  });
  it('converts kg and lb', () => {
    expect(kgToLb(100)).toBe(220.46);
    expect(lbToKg(220.46)).toBe(100);
  });
  it('formats paise with Indian grouping, integers only', () => {
    expect(formatPaise(5)).toBe('0.05');
    expect(formatPaise(123450)).toBe('1,234.50');
    expect(formatPaise(1234567800)).toBe('1,23,45,678.00');
    expect(formatPaise(-250)).toBe('-2.50');
    expect(() => formatPaise(10.5)).toThrow();
  });
});

describe('dates (IST day edges)', () => {
  it('rolls the gym day at IST midnight = 18:30 UTC', () => {
    expect(istDayKey(utc('2026-11-19T18:29:59.999Z'))).toBe('2026-11-19');
    expect(istDayKey(utc('2026-11-19T18:30:00.000Z'))).toBe('2026-11-20');
    expect(istDayKey(utc('2026-12-31T18:30:00Z'))).toBe('2027-01-01');
    expect(istDayKey(utc('2026-11-19T00:00:00Z'))).toBe('2026-11-19');
  });
  it('finds the start of the IST day', () => {
    expect(istDayStart(utc('2026-11-19T18:30:00Z'))).toBe(utc('2026-11-19T18:30:00Z'));
    expect(istDayStart(utc('2026-11-20T10:00:00Z'))).toBe(utc('2026-11-19T18:30:00Z'));
    expect(dayKeyStart('2026-11-20')).toBe(utc('2026-11-19T18:30:00Z'));
  });
  it('adds days across month, year and leap edges', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-19', '2026-12-19')).toBe(30);
    expect(daysBetween('2026-12-19', '2026-11-19')).toBe(-30);
  });
  it('numbers weekdays 0 = Monday and finds the week start', () => {
    expect(istWeekday(utc('2026-11-19T06:00:00Z'))).toBe(3); // Thursday
    expect(istWeekday(utc('2026-11-22T12:00:00Z'))).toBe(6); // Sunday
    expect(istWeekday(utc('2026-11-22T18:30:00Z'))).toBe(0); // Monday 00:00 IST
    expect(istWeekStartKey(utc('2026-11-22T10:00:00Z'))).toBe('2026-11-16');
    expect(istWeekStartKey(utc('2026-11-23T00:00:00Z'))).toBe('2026-11-23');
  });
  it('validates and formats', () => {
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-2-3')).toBe(false);
    expect(() => dayKeyStart('nope')).toThrow();
    expect(formatIst(utc('2026-11-19T18:30:00Z'))).toBe('2026-11-20 00:00');
    expect(formatIst(utc('2026-11-19T10:05:00Z'))).toBe('2026-11-19 15:35');
    expect(parseIso('2026-11-19T18:30:00Z')).toBe(utc('2026-11-19T18:30:00Z'));
    expect(parseIso('2026-11-20T00:00:00+05:30')).toBe(utc('2026-11-19T18:30:00Z'));
    expect(parseIso('yesterday')).toBeNull();
    expect(parseIso('2026-13-01T00:00:00Z')).toBeNull();
  });
});

describe('validators', () => {
  it('names', () => {
    expect(validateName('  Lat   Pulldown ')).toEqual({ ok: true, value: 'Lat Pulldown' });
    expect(validateName('   ')).toEqual({ ok: false, error: 'name_empty' });
    expect(validateName('x'.repeat(61))).toEqual({ ok: false, error: 'name_too_long' });
  });
  it('weight, reps, seconds, rpe, rep range', () => {
    expect(validateWeightKg(62.505)).toEqual({ ok: true, value: 62.51 });
    expect(validateWeightKg(-1)).toEqual({ ok: false, error: 'weight_range' });
    expect(validateWeightKg(Number.NaN)).toEqual({ ok: false, error: 'weight_invalid' });
    expect(validateReps(8)).toEqual({ ok: true, value: 8 });
    expect(validateReps(8.5)).toEqual({ ok: false, error: 'reps_invalid' });
    expect(validateReps(1001)).toEqual({ ok: false, error: 'reps_range' });
    expect(validateSeconds(90).ok).toBe(true);
    expect(validateSeconds(86401)).toEqual({ ok: false, error: 'seconds_range' });
    expect(validateRpe(8.5).ok).toBe(true);
    expect(validateRpe(8.3).ok).toBe(false);
    expect(validateRpe(11).ok).toBe(false);
    expect(validateRepRange(8, 12)).toEqual({ ok: true, value: { repMin: 8, repMax: 12 } });
    expect(validateRepRange(12, 8)).toEqual({ ok: false, error: 'range_order' });
    expect(validateRepRange(0, 8)).toEqual({ ok: false, error: 'reps_invalid' });
  });
  it('muscle ids against the taxonomy', () => {
    const tax = buildTaxonomy([{ id: 'chest', parent: 'chest' }, { id: 'upper_chest', parent: 'chest' }]);
    expect(validateMuscleId('upper_chest', tax.has).ok).toBe(true);
    expect(validateMuscleId('nope', tax.has)).toEqual({ ok: false, error: 'muscle_unknown' });
  });
});

describe('muscle taxonomy', () => {
  const tax = buildTaxonomy([
    { id: 'chest', parent: 'chest' },
    { id: 'upper_chest', parent: 'chest' },
    { id: 'lower_chest', parent: 'chest' },
    { id: 'lats', parent: 'lats' },
  ]);
  it('parents, children, expansion', () => {
    expect(tax.parentOf('upper_chest')).toBe('chest');
    expect(tax.parentOf('chest')).toBe('chest');
    expect(tax.parentOf('zzz')).toBeUndefined();
    expect(tax.childrenOf('chest')).toEqual(['upper_chest', 'lower_chest']);
    expect(tax.childrenOf('lats')).toEqual([]);
    expect(tax.expand('chest')).toEqual(['upper_chest', 'lower_chest']);
    expect(tax.expand('lats')).toEqual(['lats']);
  });
  it('rolls up by max', () => {
    expect(rollUpMax({ upper_chest: 0.6, lower_chest: 1, lats: 0.3 }, tax)).toEqual({ chest: 1, lats: 0.3 });
  });
});

describe('t()', () => {
  it('returns text, fills {params}, and falls back to the key', () => {
    expect(t('validation.name_empty')).toBe('Enter a name.');
    expect(t('app.name')).toBe('Shields');
    expect(t('nope.key' as never)).toBe('nope.key');
  });
});

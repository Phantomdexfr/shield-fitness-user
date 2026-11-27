import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { figureTiers, rankedRows, strongestWeakest, unrankedCount, confirmKeys, pct } from '../../src/pages/badges/badgesModel';
import { parseProfile, parseBodyweight } from '../../src/data/repos/badges';
import { parseBadgeData } from '../../src/shared/badges';
import { t } from '../../src/i18n';
import type { BadgeResult, GroupBadge } from '../../src/shared/badges';

const m = (id: string, tier: number | null) => ({ id, ranked: tier != null, tier });
const result = {
  muscles: { biceps: m('biceps', 3), lats: m('lats', 5), calves: m('calves', null), abs: m('abs', 3) },
  needsConfirm: [{ sessionId: 's1', exerciseIndex: 2, setIndex: 1 }],
} as unknown as BadgeResult;
const g = (tier: number | null) => ({ tier }) as unknown as GroupBadge;

describe('badgesModel', () => {
  it('figureTiers keeps ranked muscles only', () => {
    expect(figureTiers(result)).toEqual({ biceps: 3, lats: 5, abs: 3 });
  });
  it('rankedRows: highest tier first, ties by id; unranked left out and counted', () => {
    expect(rankedRows(result).map((r) => r.id)).toEqual(['lats', 'abs', 'biceps']);
    expect(unrankedCount(result)).toBe(1);
  });
  it('strongestWeakest names the extremes, null for ties or fewer than two ranked groups', () => {
    const order = ['chest', 'back', 'legs', 'core'];
    expect(strongestWeakest({ chest: g(4), back: g(6), legs: g(2), core: g(null) }, order)).toEqual({ strong: 'back', weak: 'legs' });
    expect(strongestWeakest({ chest: g(3), back: g(3) }, order)).toBeNull();
    expect(strongestWeakest({ chest: g(3), back: g(null) }, order)).toBeNull();
    expect(strongestWeakest({}, order)).toBeNull();
  });
  it('confirmKeys and pct', () => {
    expect(confirmKeys(result)).toEqual(['s1:2:1']);
    expect([pct(null), pct(0.624), pct(1.4), pct(-1)]).toEqual([0, 62, 100, 0]);
  });
});

describe('profile and bodyweight parsing', () => {
  it('parseProfile never assumes sex and drops bad peaks', () => {
    expect(parseProfile(undefined)).toEqual({ sex: null, skipped: false, peaks: {}, confirmed: [], calibration: 0 });
    const p = parseProfile({ sex: 'f', skipped: true, peaks: { biceps: 4, bad: 9, x: 'y' }, confirmed: ['a:1:1', 7] });
    expect(p).toEqual({ sex: 'f', skipped: true, peaks: { biceps: 4 }, confirmed: ['a:1:1'], calibration: 0 });
    expect(parseProfile({ calibration: 2 }).calibration).toBe(2);
    expect(parseProfile({ sex: 'robot' }).sex).toBeNull();
  });
  it('parseBodyweight accepts 25 to 400 kg, comma or dot, else null', () => {
    expect(parseBodyweight('82')).toBe(82);
    expect(parseBodyweight(' 82,5 ')).toBe(82.5);
    for (const bad of ['', 'abc', '24.9', '401', '-70']) expect(parseBodyweight(bad), bad).toBeNull();
  });
});

describe('compiled badges file', () => {
  const file = readdirSync('src/dataset/generated').find((f) => /^badges\..+\.json$/.test(f))!;
  const raw = JSON.parse(readFileSync(`src/dataset/generated/${file}`, 'utf8'));
  it('parses into 42 ladders, 277 mapped exercises and 9 tiers', () => {
    const d = parseBadgeData(raw)!;
    expect(d.ladders).toHaveLength(42);
    expect(d.map).toHaveLength(277);
    expect(d.tiers.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('malformed input gives null', () => {
    expect(parseBadgeData(null)).toBeNull();
    expect(parseBadgeData({ ladders: [], map: [], tiers: [] })).toBeNull();
  });
});

describe('layer descriptions (Strength vs Experience)', () => {
  it('each layer has its own description and the experience sheet strings exist', () => {
    const a = t('badge.layer.desc.strength');
    const b = t('badge.layer.desc.experience');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^Strength/);
    expect(b).toMatch(/^Experience/);
    expect(t('badge.exp.sheet.line', { muscle: 'Biceps', tier: 'Gold' })).toBe('Biceps: Gold experience');
    expect(t('badge.exp.sheet.explain')).toContain('3 or more reps');
  });
});

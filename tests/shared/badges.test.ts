import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import {
  BADGE_GROUPS, WINDOW_DAYS, benchmarkE1RM, buildLadderIndex, computeBadges, experienceOf, groupsOf, isImplausible,
  ladderFromRecord, ladderThresholds, loadFor, mapRowFromRecord, medianTier, parseMuscleList, promotionsBetween,
  sessionPromotions, thresholdKg, tierFromRecord, tierIndex,
  type BadgeData, type BadgeInput, type BadgeResult, type BadgeSession, type Sex,
} from '../../src/shared/badges';

const fx = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const csv = (p: string): Array<Record<string, string>> =>
  Papa.parse<Record<string, string>>(readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'), { header: true, skipEmptyLines: true }).data;

const realData: BadgeData = {
  ladders: csv('contract/dataset/strength_ladders.csv').map(ladderFromRecord),
  map: csv('contract/dataset/strength_ladder_map.csv').map(mapRowFromRecord).filter((r): r is NonNullable<typeof r> => r != null),
  tiers: csv('contract/dataset/tier_fractions.csv').map(tierFromRecord),
};
const taxonomy = csv('contract/dataset/detailed_muscles/muscle_taxonomy_detailed.csv');

const thr = fx('badges_thresholds');
const sets = fx('badges_sets');
const sc = fx('badges_muscles');

describe('real data files', () => {
  it('9 tiers, 42 ladders, 277 mapped exercises (Phase 45 counts)', () => {
    expect(realData.tiers.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(realData.ladders).toHaveLength(42);
    expect(realData.map).toHaveLength(277);
  });
  it('every mapped ladder exists and every ladder muscle is in the taxonomy', () => {
    const idx = buildLadderIndex(realData);
    for (const m of realData.map) expect(idx.ladder(m.ladderId), m.slug).toBeDefined();
    const ids = new Set(taxonomy.map((r) => r.id));
    for (const l of realData.ladders) for (const m of Object.keys(l.muscles)) expect(ids.has(m), `${l.ladderId}:${m}`).toBe(true);
  });
  it('groupsOf gives the 11 groups from parent_group; neck, full_body and cardio belong to none', () => {
    const g = groupsOf(taxonomy.map((r) => ({ id: r.id!, parentGroup: r.parent_group! })));
    expect(Object.keys(g).sort()).toEqual([...BADGE_GROUPS].sort());
    const all = Object.values(g).flat();
    expect(all).not.toContain('neck');
    expect(all).not.toContain('full_body');
    expect(all).not.toContain('cardio');
    expect(g.chest).toEqual(expect.arrayContaining(['chest', 'upper_chest', 'lower_chest']));
  });
  it('parseMuscleList drops bad parts', () => {
    expect(parseMuscleList('chest:1.0;upper_chest:0.7;bad;x:0;y:abc')).toEqual({ chest: 1, upper_chest: 0.7 });
  });
});

describe('allometric thresholds (engines.md 26.3)', () => {
  it('fixture: 3 published ladders x 3 sexes x 60/80/100 kg', () => {
    for (const c of thr.cases) {
      const l = realData.ladders.find((x) => x.ladderId === c.ladderId)!;
      const got = ladderThresholds(l, c.sex as Sex, c.bw, realData.tiers);
      c.thresholdsKg.forEach((v: number, i: number) => expect(got[i]!, `${c.ladderId} ${c.sex} ${c.bw} t${i}`).toBeCloseTo(v, 3));
      expect(got[8]! / c.bw).toBeCloseTo(c.olympianRatio, 3);
    }
  });
  it('spec table (engines.md 26.2): male 80 kg bench, squat, deadlift ratios to 2 dp', () => {
    const ratios = (id: string) => {
      const l = realData.ladders.find((x) => x.ladderId === id)!;
      return ladderThresholds(l, 'm', 80, realData.tiers).map((k) => k / 80);
    };
    // The spec prints 2 dp; bench Diamond is exactly 1.755, which the spec writes 1.75, so compare within half a hundredth.
    const same = (got: number[], want: number[]) => want.forEach((w, i) => expect(Math.abs(got[i]! - w), `tier ${i}: ${got[i]} vs ${w}`).toBeLessThanOrEqual(0.0051));
    same(ratios('bench_press'), [0, 0.49, 0.78, 1.07, 1.33, 1.56, 1.75, 1.85, 1.95]);
    same(ratios('back_squat'), [0, 0.71, 1.13, 1.56, 1.92, 2.26, 2.55, 2.69, 2.83]);
    same(ratios('deadlift'), [0, 0.81, 1.3, 1.79, 2.21, 2.6, 2.93, 3.09, 3.25]);
  });
  it('spec: male bench Olympian is 1.81 x BW at 100 kg and 2.14 x at 60 kg; the plain ratio at the reference weight', () => {
    const l = realData.ladders.find((x) => x.ladderId === 'bench_press')!;
    const at = (bw: number) => ladderThresholds(l, 'm', bw, realData.tiers)[8]! / bw;
    expect(at(100)).toBeCloseTo(1.81, 2);
    expect(at(60)).toBeCloseTo(2.14, 2);
    expect(at(80)).toBeCloseTo(1.95, 6);
    expect(thresholdKg(1.95, 1, 80, 80)).toBeCloseTo(156, 6);
  });
  it('tierIndex: floor is the tier, the fraction is progress, a value on a threshold is in that tier, Olympian stops', () => {
    const th = [0, 10, 20, 30];
    expect(tierIndex(0, th)).toBe(0);
    expect(tierIndex(5, th)).toBeCloseTo(0.5, 9);
    expect(tierIndex(10, th)).toBe(1);
    expect(tierIndex(10 - 1e-12, th)).toBe(1);
    expect(tierIndex(29.9, th)).toBeCloseTo(2.99, 9);
    expect(tierIndex(30, th)).toBe(3);
    expect(tierIndex(500, th)).toBe(3);
  });
});

describe('per-set benchmark (engines.md 26.4)', () => {
  for (const c of sets.cases) {
    it(c.name, () => {
      const load = loadFor(c.loadMode, c.bwFraction, c.bw, c.weightKg);
      if (c.load == null) expect(load).toBeNull();
      else expect(load).toBeCloseTo(c.load, 3);
      const b = load == null ? null : benchmarkE1RM(load, c.reps, c.factor);
      if (c.benchmark == null) expect(b).toBeNull();
      else {
        expect(b).toBeCloseTo(c.benchmark, 3);
        expect(isImplausible(b!, c.bw)).toBe(c.implausible);
      }
    });
  }
});

describe('median and experience', () => {
  it('medianTier: odd, even rounds down, empty is null', () => {
    expect(medianTier([4, 4, 3])).toBe(4);
    expect(medianTier([4, 3])).toBe(3);
    expect(medianTier([1, 2, 3, 8])).toBe(2);
    expect(medianTier([])).toBeNull();
  });
  it('experience thresholds follow tier_fractions (Wood 0 ... Olympian 4,500)', () => {
    const e = (n: number) => experienceOf(n, realData.tiers);
    expect(e(0).tier).toBe(0);
    expect(e(9.99).tier).toBe(0);
    expect(e(10).tier).toBe(1);
    expect(e(299.99).tier).toBe(4 - 1);
    expect(e(300).tier).toBe(4);
    expect(e(4500)).toMatchObject({ tier: 8, progress: 1, toNext: 0 });
    expect(e(25).toNext).toBeCloseTo(15, 9);
  });
});

// ---- scenarios on the small ladder set ----
const mini: BadgeData = sc.data;
const near = (a: unknown, e: unknown, path: string, tol: number) => {
  if (e === null) return expect(a, path).toBeNull();
  if (typeof e === 'number') return expect(Math.abs((a as number) - e), `${path}: ${String(a)} vs ${e}`).toBeLessThanOrEqual(tol);
  if (typeof e !== 'object') return expect(a, path).toBe(e);
  for (const [k, v] of Object.entries(e as Record<string, unknown>)) near((a as Record<string, unknown>)?.[k], v, `${path}.${k}`, k === 'nextKg' ? 0.0101 : 0.00021);
};
function summarize(r: BadgeResult | { status: string }): Record<string, unknown> {
  if (r.status !== 'ok') return r as Record<string, unknown>;
  const ok = r as BadgeResult;
  const r4 = (x: number | null) => (x == null ? null : Math.round(x * 1e4) / 1e4);
  return {
    status: 'ok',
    estimated: ok.estimated,
    bodyweightKg: ok.bodyweightKg,
    muscles: Object.fromEntries(Object.entries(ok.muscles).map(([id, m]) => [id, {
      tier: m.tier, progress: r4(m.progress), peak: m.peak, best: m.best?.ladderId ?? null, nextKg: m.next ? Math.round(m.next.thresholdKg * 100) / 100 : null,
    }])),
    groups: Object.fromEntries(Object.entries(ok.groups).map(([g, b]) => [g, b.tier])),
    overall: { tier: ok.overall.tier, provisional: ok.overall.provisional },
    experience: Object.fromEntries(Object.entries(ok.experience.muscles).map(([m, e]) => [m, { mp: r4(e.mp), tier: e.tier }])),
    rusty: Object.fromEntries(Object.entries(ok.rust).map(([m, x]) => [m, x.rusty])),
    needsConfirm: ok.needsConfirm.length,
  };
}

describe('muscle badge scenarios (worked by an independent script)', () => {
  for (const c of sc.cases) {
    it(c.name, () => {
      const got = summarize(computeBadges(mini, c.input as BadgeInput));
      near(got, c.expect, 'result', 0.00021);
    });
  }
});

describe('worked examples in words', () => {
  const base = (sessions: BadgeSession[], over: Partial<BadgeInput> = {}): BadgeInput => ({
    sessions, bodyStats: [{ day: '2026-01-01', kg: 80 }], sex: 'm', asOf: '2026-11-10', groups: { chest: ['chest'] }, ...over,
  });
  const bench = (id: string, day: string, w: number, reps: number): BadgeSession => ({
    id, day, exercises: [{ slug: 'bench-press', weights: { chest: 1 }, sets: [{ weightKg: w, reps }] }],
  });

  it('100 kg x 5 at 80 kg male: e1RM 116.67, chest Gold, 57% to Platinum, Platinum = 124.8 kg = 1.56 x BW', () => {
    const r = computeBadges(mini, base([bench('a', '2026-11-01', 100, 5)])) as BadgeResult;
    const chest = r.muscles.chest!;
    expect(chest.tier).toBe(4);
    expect(chest.progress).toBeCloseTo(0.5655, 3);
    expect(chest.best!.best!.e1rm).toBeCloseTo(116.6667, 3);
    expect(chest.next!.tier).toBe(5);
    expect(chest.next!.thresholdKg).toBeCloseTo(124.8, 3);
    expect(chest.next!.ratio).toBeCloseTo(1.56, 3);
  });
  it('an unranked muscle suggests up to 3 ladders; a ranked one suggests none', () => {
    const r = computeBadges(mini, base([bench('a', '2026-11-01', 100, 5)])) as BadgeResult;
    expect(r.muscles.quads!.ranked).toBe(false);
    expect(r.muscles.quads!.tier).toBeNull();
    expect(r.muscles.quads!.suggest).toEqual(['squat']);
    expect(r.muscles.chest!.suggest).toEqual([]);
  });
  it('the window is 365 days: 364 days back counts, 365 days back does not; peak keeps it', () => {
    expect(WINDOW_DAYS).toBe(365);
    const r = computeBadges(mini, base([bench('old', '2025-11-10', 140, 1)])) as BadgeResult;
    expect(r.muscles.chest!.tier).toBeNull();
    expect(r.muscles.chest!.peak).toBe(5);
    const r2 = computeBadges(mini, base([bench('edge', '2025-11-11', 140, 1)])) as BadgeResult;
    expect(r2.muscles.chest!.tier).toBe(5);
  });
  it('a stored peak is returned in peaks and never lowered; peaks round-trip', () => {
    const r = computeBadges(mini, base([bench('a', '2026-11-01', 100, 5)], { peaks: { chest: 6, 'group:chest': 7 } })) as BadgeResult;
    expect(r.peaks.chest).toBe(6);
    expect(r.peaks['group:chest']).toBe(7);
    expect(r.groups.chest!.peak).toBe(7);
    const again = computeBadges(mini, base([bench('a', '2026-11-01', 100, 5)], { peaks: r.peaks })) as BadgeResult;
    expect(again.peaks).toEqual(r.peaks);
  });
  it('a confirmed implausible set is listed until confirmed, with its position', () => {
    const s: BadgeSession = { id: 'x', day: '2026-11-01', exercises: [{ slug: 'bench-press', weights: { chest: 1 }, sets: [{ weightKg: 100, reps: 5 }, { weightKg: 400, reps: 5 }] }] };
    const r = computeBadges(mini, base([s])) as BadgeResult;
    expect(r.needsConfirm).toEqual([expect.objectContaining({ sessionId: 'x', slug: 'bench-press', exerciseIndex: 0, setIndex: 1, ladderId: 'bench', bodyweightKg: 80 })]);
    expect(r.muscles.chest!.tier).toBe(4);
  });
  it('a warm-up set never counts for strength; a drop set does', () => {
    const mk = (tag: 'warmup' | 'drop'): BadgeSession => ({ id: 'w', day: '2026-11-01', exercises: [{ slug: 'bench-press', weights: { chest: 1 }, sets: [{ weightKg: 100, reps: 5, tag }] }] });
    expect((computeBadges(mini, base([mk('warmup')])) as BadgeResult).muscles.chest!.tier).toBeNull();
    expect((computeBadges(mini, base([mk('drop')])) as BadgeResult).muscles.chest!.tier).toBe(4);
  });
  it('an exercise with no ladder adds experience and rust only', () => {
    const s: BadgeSession = { id: 'n', day: '2026-11-01', exercises: [{ slug: 'plank', weights: { abs: 1 }, sets: [{ weightKg: null, reps: 10 }] }] };
    const r = computeBadges(mini, base([s], { groups: { core: ['abs'] }, muscles: ['chest', 'abs'] })) as BadgeResult;
    expect(r.muscles.chest!.ranked).toBe(false);
    expect(r.muscles.abs!.ranked).toBe(false);
    expect(r.experience.muscles.abs).toMatchObject({ mp: 1, tier: 0 });
    expect(r.rust.abs).toMatchObject({ lastDay: '2026-11-01', daysSince: 9, rusty: false });
  });
  it('experience overall and groups are the median of muscle experience tiers', () => {
    const s: BadgeSession = { id: 'e', day: '2026-11-01', exercises: [{ slug: 'back-squat', weights: { quads: 1, glutes: 0.8 }, sets: Array.from({ length: 12 }, () => ({ weightKg: 100, reps: 5 })) }] };
    const r = computeBadges(mini, base([s], { groups: { quads: ['quads'], glutes: ['glutes'] } })) as BadgeResult;
    expect(r.experience.muscles.quads).toMatchObject({ mp: 12, tier: 1 });
    expect(r.experience.muscles.glutes!.mp).toBeCloseTo(9.6, 9);
    expect(r.experience.groups).toEqual({ quads: 1, glutes: 0 });
    expect(r.experience.overall).toBe(0);
  });
});

describe('promotions', () => {
  const p = sc.promotions;
  it('sessionPromotions matches the independent script for every session', () => {
    for (const [sid, expected] of Object.entries(p.expect)) {
      const got = sessionPromotions(mini, { sessions: p.sessions, bodyStats: p.bodyStats, sex: p.sex, asOf: '2026-12-31', groups: p.groups }, sid);
      expect(got, sid).toEqual(expected);
    }
  });
  it('unknown session, or badges not computable yet: no promotions', () => {
    expect(sessionPromotions(mini, { sessions: p.sessions, bodyStats: p.bodyStats, sex: p.sex, asOf: '2026-12-31', groups: p.groups }, 'nope')).toEqual([]);
    expect(sessionPromotions(mini, { sessions: p.sessions, bodyStats: [], sex: p.sex, asOf: '2026-12-31', groups: p.groups }, 'p2')).toEqual([]);
  });
  it('promotionsBetween: unranked to Wood is not a promotion, unranked to Beginner is', () => {
    const mk = (tier: number | null): BadgeResult => ({
      status: 'ok', estimated: false, bodyweightKg: 80, asOf: '2026-11-01',
      muscles: { chest: { id: 'chest', ranked: tier != null, tier, progress: null, peak: tier, best: null, candidates: [], next: null, suggest: [] } },
      groups: {}, overall: { tier: null, provisional: true, rankedGroups: 0 }, experience: { muscles: {}, groups: {}, overall: null }, rust: {}, peaks: {}, needsConfirm: [],
    });
    expect(promotionsBetween(mk(null), mk(0))).toEqual([]);
    expect(promotionsBetween(mk(null), mk(1))).toEqual([{ kind: 'muscle', id: 'chest', from: null, to: 1 }]);
    expect(promotionsBetween(mk(2), mk(2))).toEqual([]);
    expect(promotionsBetween(mk(3), mk(2))).toEqual([]);
  });
});

describe('determinism and speed', () => {
  const idx = buildLadderIndex(realData);
  const slugs = realData.map.map((m) => m.slug);
  const groups = groupsOf(taxonomy.map((r) => ({ id: r.id!, parentGroup: r.parent_group! })));
  // A tiny seeded generator (test data only; the engine itself uses no randomness).
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sessions: BadgeSession[] = Array.from({ length: 1000 }, (_, i) => ({
    id: `s${i}`,
    day: new Date(Date.UTC(2024, 0, 1) + i * 86400000 * 0.9).toISOString().slice(0, 10),
    exercises: Array.from({ length: 6 }, () => {
      const slug = slugs[Math.floor(rnd() * slugs.length)]!;
      const l = idx.ladder(idx.mapOf(slug)!.ladderId)!;
      const m = Object.keys(l.muscles)[0]!;
      return { slug, weights: { [m]: 1 }, sets: Array.from({ length: 4 }, () => ({ weightKg: 20 + Math.floor(rnd() * 8) * 5, reps: 5 + Math.floor(rnd() * 6) })) };
    }),
  }));
  const input: BadgeInput = { sessions, bodyStats: [{ day: '2024-01-01', kg: 78 }, { day: '2025-06-01', kg: 82 }], sex: 'f', asOf: '2026-11-10', groups };

  it('same input, same result; a shuffled input gives the same result; the input is not changed', () => {
    const copy = JSON.stringify(input);
    const a = computeBadges(realData, input);
    expect(JSON.stringify(input)).toBe(copy);
    const shuffled = { ...input, sessions: [...sessions].reverse(), bodyStats: [...input.bodyStats].reverse() };
    expect(computeBadges(realData, shuffled)).toEqual(a);
    expect(computeBadges(realData, input)).toEqual(a);
    expect((a as BadgeResult).status).toBe('ok');
  });
  it('benchmark: 1,000 sessions x 6 exercises x 4 sets on the real ladders (time printed, generous limit)', () => {
    computeBadges(realData, input);
    const t0 = performance.now();
    const r = computeBadges(realData, input) as BadgeResult;
    const ms = performance.now() - t0;
    console.log(`badges benchmark: ${ms.toFixed(1)} ms for 1,000 sessions (24,000 sets), ${Object.values(r.muscles).filter((m) => m.ranked).length} muscles ranked`);
    expect(ms).toBeLessThan(1500);
  });
});

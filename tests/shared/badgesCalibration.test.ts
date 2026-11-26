import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import {
  ANCHORS, BADGE_CALIBRATION, ESTIMATE_TIER_CAP, benchmarkE1RM, computeBadges, groupsOf, ladderFromRecord, ladderThresholds,
  mapRowFromRecord, recalibrate, taperedReps, tierFromRecord, withCore,
  type BadgeData, type BadgeInput, type BadgeResult, type BadgeSession, type Sex,
} from '../../src/shared/badges';

const csv = (p: string): Array<Record<string, string>> => Papa.parse<Record<string, string>>(readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'), { header: true, skipEmptyLines: true }).data;
const base: BadgeData = {
  ladders: csv('contract/dataset/strength_ladders.csv').map(ladderFromRecord),
  map: csv('contract/dataset/strength_ladder_map.csv').map(mapRowFromRecord).filter((r): r is NonNullable<typeof r> => r != null),
  tiers: csv('contract/dataset/tier_fractions.csv').map(tierFromRecord),
};
const data = withCore(base);
const taxonomy = csv('contract/dataset/detailed_muscles/muscle_taxonomy_detailed.csv');
const groups = groupsOf(taxonomy.map((r) => ({ id: r.id!, parentGroup: r.parent_group! })));

const day = (i: number) => `2026-10-${String(i + 1).padStart(2, '0')}`;
function session(id: string, d: string, slug: string, weights: Record<string, number>, sets: Array<{ weightKg: number | null; reps: number }>): BadgeSession {
  return { id, day: d, exercises: [{ slug, weights, sets: sets.map((s) => ({ ...s, tag: 'normal' as const })) }] };
}
function run(sessions: BadgeSession[], bw = 80, sex: Sex = 'm', strict = true): BadgeResult {
  const input: BadgeInput = { sessions, bodyStats: [{ day: '2026-09-01', kg: bw }], sex, asOf: '2026-11-25', groups, strict };
  const r = computeBadges(data, input);
  if (r.status !== 'ok') throw new Error('not ok');
  return r;
}

describe('calibration v2: anchors', () => {
  it('recalibrate is idempotent and leaves published and derived ladders alone', () => {
    const once = recalibrate(base);
    expect(recalibrate(once)).toEqual(once);
    for (const id of ['back_squat', 'bench_press', 'deadlift', 'overhead_press', 'barbell_row', 'romanian_deadlift', 'hip_thrust']) {
      expect(ANCHORS[id], id).toBeUndefined();
      expect(once.ladders.find((l) => l.ladderId === id), id).toEqual(base.ladders.find((l) => l.ladderId === id));
    }
  });
  it('every anchor in the table names a real ladder, and none is lower than the contract guess', () => {
    for (const [id, [m, f]] of Object.entries(ANCHORS)) {
      const l = data.ladders.find((x) => x.ladderId === id);
      expect(l, id).toBeDefined();
      const orig = base.ladders.find((x) => x.ladderId === id);
      if (orig) { expect(m, `${id} male`).toBeGreaterThanOrEqual(orig.anchorM); expect(f, `${id} female`).toBeGreaterThanOrEqual(orig.anchorF); }
      expect(f, `${id} female <= male`).toBeLessThanOrEqual(m);
    }
  });
  it('kneeling cable crunch Olympian is a real elite lift now: 152 kg for a male 80 kg, 96 kg for a female 60 kg', () => {
    const l = data.ladders.find((x) => x.ladderId === 'cable_crunch')!;
    expect(ladderThresholds(l, 'm', 80, data.tiers)[8]).toBeCloseTo(152, 0);
    expect(ladderThresholds(l, 'f', 60, data.tiers)[8]).toBeCloseTo(96, 0);
  });
});

describe('calibration v2: the reported bug', () => {
  const crunch = (kg: number, reps = 1) => [session('s1', day(0), 'kneeling-cable-crunch', { abs: 1 }, [{ weightKg: kg, reps }])];
  it('a single 100 kg x 1 kneeling cable crunch is no longer Olympian, for any bodyweight or sex', () => {
    for (const sex of ['m', 'f', 'unspecified'] as Sex[]) {
      for (const bw of [50, 60, 70, 75, 80, 90]) {
        const abs = run(crunch(100), bw, sex).muscles.abs!;
        expect(abs.tier!, `${sex} ${bw}`).toBeLessThanOrEqual(3);
      }
    }
  });
  it('the old rules (strict off, old anchors) did give it Olympian at 70 kg male', () => {
    const input: BadgeInput = { sessions: crunch(100), bodyStats: [{ day: '2026-09-01', kg: 70 }], sex: 'm', asOf: '2026-11-25', groups };
    const r = computeBadges(withCoreOldAnchors(), input) as BadgeResult;
    expect(r.muscles.abs!.tier).toBe(8);
  });
  it('the sheet says why: the first set is held below Gold until it is repeated', () => {
    expect(run(crunch(100), 70, 'm').muscles.abs!.held).toBe('evidence');
  });
});

function withCoreOldAnchors(): BadgeData {
  // The raw contract plus core rows with their first guesses: what the app shipped before calibration v2.
  const withNew = withCore(base);
  return { ...withNew, ladders: withNew.ladders.map((l) => base.ladders.find((b) => b.ladderId === l.ladderId) ?? l) };
}

describe('calibration v2: rules', () => {
  it('reps above 12 count a third each: 60 kg x 30 is 96 kg, not 120 kg', () => {
    expect(taperedReps(12)).toBe(12);
    expect(taperedReps(30)).toBeCloseTo(18, 9);
    expect(benchmarkE1RM(60, 30, 1, 30, false)).toBeCloseTo(120, 9);
    expect(benchmarkE1RM(60, 30, 1, 30, true)).toBeCloseTo(96, 9);
    expect(benchmarkE1RM(60, 10, 1, 30, true)).toBeCloseTo(benchmarkE1RM(60, 10, 1, 30, false)!, 9);
  });
  it('Gold needs a second workout: one great session stays just under Gold, a repeat unlocks it', () => {
    // Enough experience so only the repeat rule is in play: 12 filler sessions on chest.
    const filler = Array.from({ length: 12 }, (_, i) => session(`f${i}`, day(i), 'push-up', { chest: 1 }, [{ weightKg: null, reps: 8 }, { weightKg: null, reps: 8 }, { weightKg: null, reps: 8 }]));
    const one = run([...filler, session('b1', day(15), 'barbell-bench-press', { chest: 1 }, [{ weightKg: 110, reps: 3 }])]);
    expect(one.muscles.chest!.tier).toBe(3);
    expect(one.muscles.chest!.held).toBe('evidence');
    const two = run([...filler, session('b1', day(15), 'barbell-bench-press', { chest: 1 }, [{ weightKg: 110, reps: 3 }]), session('b2', day(18), 'barbell-bench-press', { chest: 1 }, [{ weightKg: 110, reps: 3 }])]);
    expect(two.muscles.chest!.tier!).toBeGreaterThanOrEqual(4);
  });
  it('two sets in the SAME workout do not count as a repeat', () => {
    const filler = Array.from({ length: 12 }, (_, i) => session(`f${i}`, day(i), 'push-up', { chest: 1 }, [{ weightKg: null, reps: 8 }]));
    const r = run([...filler, session('b1', day(15), 'barbell-bench-press', { chest: 1 }, [{ weightKg: 110, reps: 3 }, { weightKg: 110, reps: 3 }])]);
    expect(r.muscles.chest!.tier).toBe(3);
  });
  it('strength leads experience by 3 tiers at most', () => {
    const two = [session('b1', day(1), 'barbell-bench-press', { chest: 1 }, [{ weightKg: 140, reps: 3 }]), session('b2', day(2), 'barbell-bench-press', { chest: 1 }, [{ weightKg: 140, reps: 3 }])];
    const r = run(two);
    expect(r.experience.muscles.chest!.tier).toBe(0);
    expect(r.muscles.chest!.tier).toBe(3);
    expect(r.muscles.chest!.held).toBe('experience');
  });
  it('estimated ladders stop at Diamond however strong and experienced; a published lift can still reach Olympian', () => {
    // 3 reps: sets under 3 reps do not build experience.
    const many = (slug: string, kg: number, muscle: string) => Array.from({ length: 80 }, (_, i) => session(`x${i}`, `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`, slug, { [muscle]: 1 }, Array.from({ length: 12 }, () => ({ weightKg: kg, reps: 3 }))));
    expect(run(many('kneeling-cable-crunch', 250, 'abs')).muscles.abs!.tier).toBe(ESTIMATE_TIER_CAP);
    expect(run(many('barbell-bench-press', 150, 'chest')).muscles.chest!.tier).toBe(8);
  });
  it('a ranking exists at every reasonable weight: nobody is capped out of Beginner', () => {
    const r = run([session('s', day(0), 'kneeling-cable-crunch', { abs: 1 }, [{ weightKg: 30, reps: 10 }])]);
    expect(r.muscles.abs!.tier!).toBeGreaterThanOrEqual(1);
  });
});

describe('calibration v2: no single set makes Olympian on any ladder', () => {
  it('a one-rep set of 1.2 x the Olympian threshold on every mapped ladder: every muscle is at most Silver', () => {
    for (const sex of ['m', 'f'] as Sex[]) {
      for (const bw of [55, 80, 100]) {
        for (const l of data.ladders) {
          const map = data.map.find((m) => m.ladderId === l.ladderId && m.factor === 1) ?? data.map.find((m) => m.ladderId === l.ladderId);
          if (!map) continue;
          const th = ladderThresholds(l, sex, bw, data.tiers)[8]! * 1.2 * map.factor;
          const added = map.loadMode === 'bodyweight' ? th - l.bwFraction * bw : map.loadMode === 'per_hand' ? th / 2 : th;
          if (!(added > 0) || th > 4 * bw) continue; // implausible sets wait for a confirm
          const w: Record<string, number> = {};
          for (const m of Object.keys(l.muscles)) w[m] = 1;
          const r = run([session('s1', day(0), map.slug, w, [{ weightKg: added, reps: 1 }])], bw, sex);
          for (const [id, b] of Object.entries(r.muscles)) if (b.tier != null) expect(b.tier, `${l.ladderId} ${sex} ${bw} ${id}`).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

describe('calibration v2: bookkeeping', () => {
  it('has a calibration number the app uses to drop old peaks', () => {
    expect(BADGE_CALIBRATION).toBe(2);
  });
});

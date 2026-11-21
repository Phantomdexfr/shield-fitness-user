import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  INTENSITY, detectPR, e1rm, e1rmDisplay, isPlateau, noProgressStreak, overload, sessionStats, sessionVolume,
  type EngineSet, type ExerciseResult, type Intensity, type OverloadMode, type SetTag,
} from '../../src/shared/engine';

type Tup = [number | null, number | null, (number | null)?, SetTag?];
const toSet = (a: Tup): EngineSet => ({ weightKg: a[0], reps: a[1], ...(a[2] != null ? { rpe: a[2] } : {}), tag: a[3] ?? 'normal' });
const toResult = (sets: Tup[]): ExerciseResult => ({ sets: sets.map(toSet) });

const fx = JSON.parse(readFileSync('contract/fixtures/overload_cases.json', 'utf8'));
const prFx = JSON.parse(readFileSync('contract/fixtures/overload_pr.json', 'utf8'));

describe('e1RM (fixtures)', () => {
  for (const [w, r, exp] of fx.e1rm) it(`${w} x ${r}`, () => expect(e1rm(w, r)).toBe(exp));
  for (const [v, exp] of fx.e1rmDisplay) it(`display ${v}`, () => expect(e1rmDisplay(v)).toBe(exp));
});

describe('overload (fixtures: worked examples)', () => {
  expect(fx.overload.length).toBeGreaterThanOrEqual(8);
  for (const c of fx.overload) {
    it(c.id, () => expect(overload(c.history.map(toResult), c.opts)).toEqual(c.expected));
  }
});

describe('plateau (fixtures)', () => {
  for (const c of fx.plateau) it(c.id, () => expect(isPlateau(c.history.map(toResult))).toBe(c.expected));
});

describe('session stats (fixtures)', () => {
  for (const c of fx.stats) it(c.id, () => expect(sessionStats(c.sets.map(toSet))).toEqual(c.expected));
});

describe('detectPR (fixtures)', () => {
  for (const c of prFx.cases) it(c.id, () => expect(detectPR(c.history.map(toResult), toResult(c.current))).toEqual(c.expected));
});

describe('no-progress streak', () => {
  it('counts trailing sessions that did not progress, not the first one', () => {
    const h = [[[60, 10]], [[60, 10]], [[60, 11]], [[60, 11]], [[60, 11]]] as Tup[][];
    expect(noProgressStreak(h.map(toResult))).toBe(2);
    expect(noProgressStreak([toResult([[60, 10]])])).toBe(0);
  });
});

// ---------- property tests (seeded, no extra dependency) ----------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const MODES: OverloadMode[] = ['linear', 'double'];
const LEVELS = Object.keys(INTENSITY) as Intensity[];
const TAGS: SetTag[] = ['normal', 'normal', 'normal', 'superset', 'warmup', 'drop'];

function randomHistory(r: () => number): { history: ExerciseResult[]; step: number } {
  const step = [1.25, 2.5, 5][Math.floor(r() * 3)] as number;
  const base = Math.floor(r() * 40) * step;
  const nSessions = Math.floor(r() * 6);
  const history: ExerciseResult[] = [];
  for (let i = 0; i < nSessions; i++) {
    const nSets = 1 + Math.floor(r() * 5);
    const sets: EngineSet[] = [];
    for (let j = 0; j < nSets; j++) {
      sets.push({
        weightKg: r() < 0.1 ? null : base + Math.floor(r() * 3) * step,
        reps: r() < 0.05 ? null : Math.floor(r() * 20),
        ...(r() < 0.5 ? { rpe: 5 + Math.floor(r() * 6) } : {}),
        tag: TAGS[Math.floor(r() * TAGS.length)] as SetTag,
      });
    }
    history.push({ sets });
  }
  return { history, step };
}

describe('properties', () => {
  const N = 400;
  const lastWorkingTop = (h: ExerciseResult[]): number => {
    for (let i = h.length - 1; i >= 0; i--) {
      const w = (h[i] as ExerciseResult).sets.filter((s) => (s.tag === 'normal' || s.tag === 'superset') && (s.reps ?? 0) >= 1);
      if (w.length) return Math.max(0, ...w.map((s) => s.weightKg ?? 0));
    }
    return 0;
  };

  it('e1RM is never negative or NaN', () => {
    const r = rng(1);
    for (let i = 0; i < N; i++) {
      const v = e1rm((r() - 0.3) * 300, Math.floor((r() - 0.2) * 30));
      expect(v === null || (Number.isFinite(v) && v > 0)).toBe(true);
    }
  });

  it('suggested weight is never negative and the jump is capped (+2 steps, never more than the last weight + 2 steps)', () => {
    const r = rng(2);
    for (let i = 0; i < N; i++) {
      const { history, step } = randomHistory(r);
      const mode = MODES[Math.floor(r() * 2)] as OverloadMode;
      const intensity = LEVELS[Math.floor(r() * 4)] as Intensity;
      const out = overload(history, { mode, intensity, repMin: 8, repMax: 12, stepKg: step });
      if (out.weightKg == null) continue;
      const last = lastWorkingTop(history);
      expect(out.weightKg).toBeGreaterThanOrEqual(0);
      expect(out.weightKg).toBeLessThanOrEqual(last + 2 * step + 1e-9);
      expect(out.reps.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
      if (out.note === 'add_weight' || out.note === 'add_weight_2') {
        expect(out.weightKg).toBeGreaterThan(last);
        expect(Math.abs(out.weightKg / step - Math.round(out.weightKg / step))).toBeLessThan(1e-6);
      }
      if (out.note === 'deload') expect(out.weightKg).toBeLessThanOrEqual(last);
    }
  });

  it('warm-up and drop sets never change a suggestion, a PR or the session numbers', () => {
    const r = rng(3);
    for (let i = 0; i < N; i++) {
      const { history, step } = randomHistory(r);
      const noisy = history.map((h) => ({
        sets: [{ weightKg: 200, reps: 15, tag: 'warmup' as const }, ...h.sets, { weightKg: 150, reps: 20, tag: 'drop' as const }],
      }));
      const opts = { mode: MODES[Math.floor(r() * 2)] as OverloadMode, intensity: LEVELS[Math.floor(r() * 4)] as Intensity, repMin: 8, repMax: 12, stepKg: step };
      expect(overload(noisy, opts)).toEqual(overload(history, opts));
      expect(isPlateau(noisy)).toBe(isPlateau(history));
      const cur = history[history.length - 1];
      if (cur) {
        const before = history.slice(0, -1);
        const noisyCur = { sets: [...(noisy[noisy.length - 1] as ExerciseResult).sets, { weightKg: 300, reps: 1, tag: 'warmup' as const }] };
        expect(detectPR(noisy.slice(0, -1), noisyCur)).toEqual(detectPR(before, cur));
        expect(sessionVolume((noisy[noisy.length - 1] as ExerciseResult).sets)).toBe(sessionVolume(cur.sets));
      }
    }
  });

  it('the first result for an exercise never gives a PR', () => {
    const r = rng(4);
    for (let i = 0; i < 100; i++) {
      const { history } = randomHistory(r);
      if (history.length) expect(detectPR([], history[0] as ExerciseResult)).toEqual([]);
    }
  });
});

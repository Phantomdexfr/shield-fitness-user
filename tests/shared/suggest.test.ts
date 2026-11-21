import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import {
  compareRanked, fnv1a32, jitter, muscleExerciseList, rankCandidates, reasonsFor, scoreExercise, slotForCategory, surpriseIndex, surpriseMe,
  type Candidate, type ReasonSignals, type ScoreContext,
} from '../../src/shared/suggest';

const fx = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}`, 'utf8'));
const set = (a?: string[]) => (a ? new Set(a) : undefined);

function toCtx(c: any, tax: ScoreContext['tax']): ScoreContext {
  return {
    tax, dayKey: c.dayKey, level: c.level, track: c.track, favourites: set(c.favourites), previousSlugs: set(c.previousSlugs),
    skipStats: c.skipStats, hidden: set(c.hidden), avoid: set(c.avoid), sore: set(c.sore), machineStatus: c.machineStatus, showAll: c.showAll,
  };
}

describe('jitter (fixtures)', () => {
  const j = fx('suggest_jitter.json');
  it('fnv1a32 standard vectors', () => {
    for (const v of j.fnv1a32) expect(fnv1a32(v.text), v.text).toBe(v.hash);
  });
  it('jitter values and range', () => {
    for (const v of j.jitter) expect(jitter(v.dayKey, v.slug), `${v.dayKey} ${v.slug}`).toBe(v.jitter);
    for (let i = 0; i < 300; i++) {
      const x = jitter('2026-11-19', `slug-${i}`);
      expect(x).toBeGreaterThanOrEqual(-0.5);
      expect(x).toBeLessThanOrEqual(0.5);
    }
  });
  it('same (day, slug) gives the same value; a new day changes it', () => {
    expect(jitter('2026-11-19', 'a')).toBe(jitter('2026-11-19', 'a'));
    expect(jitter('2026-11-19', 'barbell-bench-press')).not.toBe(jitter('2026-11-20', 'barbell-bench-press'));
  });
  it('surprise index', () => {
    for (const s of j.surprise) expect(surpriseIndex(s.dayKey, s.n, s.length)).toBe(s.index);
    expect(surpriseIndex('2026-11-19', 0, 0)).toBe(-1);
  });
});

describe('scoreExercise (Phase 14 worked examples)', () => {
  const f = fx('suggest_score.json');
  const tax = buildTaxonomy(f.muscles);
  for (const c of f.cases) {
    it(`${c.id}: ${c.description}`, () => {
      const r = scoreExercise(c.candidate, c.target, c.slot, toCtx(c.context, tax));
      if (c.expected.excluded) expect(r.excluded).toBe(c.expected.excluded);
      else {
        expect(r.excluded).toBeUndefined();
        expect(r.score).toBe(c.expected.score);
        expect(!!r.unavailable).toBe(!!c.expected.unavailable);
      }
    });
  }
  it('slot for a category', () => {
    expect(slotForCategory('compound')).toBe('main');
    expect(slotForCategory('isolation')).toBe('isolation');
    expect(slotForCategory('warmup')).toBe('none');
  });
});

describe('muscleExerciseList (real chest example)', () => {
  const f = fx('suggest_list.json');
  const tax = buildTaxonomy(f.muscles);
  const ctx = toCtx(f.context, tax);
  const built = new Set<string>(f.builtSlugs);
  const list = muscleExerciseList(f.candidates, f.target, ctx, { builtSlugs: built });
  it('suggested, built and more match the Phase 14 numbers', () => {
    expect(list.suggested.map((r) => [r.slug, r.score])).toEqual(f.expected.suggested);
    expect(list.built.map((r) => [r.slug, r.score])).toEqual(f.expected.built);
    expect(list.more.length).toBe(f.expected.moreCount);
    expect(list.suggested.length + list.built.length + list.more.length).toBe(f.expected.count);
    expect(list.more.slice(0, 4).map((r) => r.slug)).toEqual(f.expected.moreFirst['2026-11-19']);
  });
  it('More changes with the day', () => {
    const next = muscleExerciseList(f.candidates, f.target, { ...ctx, dayKey: '2026-11-20' }, { builtSlugs: built });
    expect(next.more.slice(0, 3).map((r) => r.slug)).toEqual(f.expected.moreFirst['2026-11-20']);
  });
  it('surprise me', () => {
    expect(surpriseMe(list, '2026-11-19', 0)?.slug).toBe(f.expected.surprise['0']);
    expect(surpriseMe(list, '2026-11-19', 1)?.slug).toBe(f.expected.surprise['1']);
  });
  it('an exercise is in one section only', () => {
    const all = [...list.suggested, ...list.built, ...list.more].map((r) => r.slug);
    expect(new Set(all).size).toBe(all.length);
  });
  it('filters, injury-safe and unavailable machines', () => {
    const iso = muscleExerciseList(f.candidates, f.target, ctx, { filters: { category: 'isolation' } });
    const all = [...iso.suggested, ...iso.built, ...iso.more];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => f.candidates.find((c: Candidate) => c.slug === r.slug).category === 'isolation')).toBe(true);
    const safe = muscleExerciseList(f.candidates, f.target, { ...ctx, avoid: new Set(['triceps']) }, { filters: { injurySafe: true } });
    expect([...safe.suggested, ...safe.built, ...safe.more].some((r) => r.slug === 'barbell-bench-press')).toBe(false);
    const hot = muscleExerciseList(f.candidates, f.target, { ...ctx, machineStatus: { 'olympic-flat-bench': 'maintenance' }, showAll: true }, {});
    expect(hot.unavailable.map((r) => r.slug)).toContain('barbell-bench-press');
    expect(hot.unavailable.every((r) => r.unavailable)).toBe(true);
  });
  it('fewer than 6 candidates fill Suggested only', () => {
    const few = muscleExerciseList(f.candidates.slice(0, 3), f.target, ctx, {});
    expect(few.suggested.length).toBe(3);
    expect(few.built.length + few.more.length).toBe(0);
  });
});

describe('property tests', () => {
  const f = fx('suggest_list.json');
  const tax = buildTaxonomy(f.muscles);
  const ctx = toCtx(f.context, tax);
  const cands: Candidate[] = f.candidates;
  const names = (rs: Array<{ slug: string }>) => rs.map((r) => r.slug);
  it('hidden and avoided exercises are never returned', () => {
    const hidden = new Set(['pec-deck-fly', 'smith-machine-bench-press']);
    const avoid = new Set(['lower_chest']);
    const list = muscleExerciseList(cands, 'chest', { ...ctx, hidden, avoid }, {});
    const got = new Set([...list.suggested, ...list.built, ...list.more].map((r) => r.slug));
    for (const h of hidden) expect(got.has(h)).toBe(false);
    for (const c of cands) {
      const marked = c.rows.some(([id, role, e]) => id === 'lower_chest' && ((role === 'p' && (e === 'h' || e === 'm')) || (role === 's' && e === 'h')));
      if (marked) expect(got.has(c.slug), c.slug).toBe(false);
    }
  });
  it('deterministic per date and slug, and stable when the input order is shuffled or reversed', () => {
    const base = names(rankCandidates(cands, 'chest', 'none', ctx));
    expect(names(rankCandidates(cands, 'chest', 'none', ctx))).toEqual(base);
    expect(names(rankCandidates([...cands].reverse(), 'chest', 'none', ctx))).toEqual(base);
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 5; t++) {
      const sh = [...cands].sort(() => rnd() - 0.5);
      expect(names(rankCandidates(sh, 'chest', 'none', ctx))).toEqual(base);
      const a = muscleExerciseList(cands, 'chest', ctx, { builtSlugs: new Set(f.builtSlugs) });
      const b = muscleExerciseList(sh, 'chest', ctx, { builtSlugs: new Set(f.builtSlugs) });
      expect(names(b.more)).toEqual(names(a.more));
    }
  });
  it('does not change its input', () => {
    const copy = JSON.stringify(cands);
    rankCandidates(cands, 'chest', 'none', ctx);
    expect(JSON.stringify(cands)).toBe(copy);
  });
  it('ties order by shorter name then slug', () => {
    expect(compareRanked({ score: 1, name: 'Ab', slug: 'z' }, { score: 1, name: 'Abc', slug: 'a' })).toBeLessThan(0);
    expect(compareRanked({ score: 1, name: 'Ab', slug: 'a' }, { score: 1, name: 'Ab', slug: 'b' })).toBeLessThan(0);
    expect(compareRanked({ score: 2, name: 'Abcd', slug: 'z' }, { score: 1, name: 'Ab', slug: 'a' })).toBeLessThan(0);
  });
});

describe('reason codes (engines.md 25)', () => {
  const f = fx('suggest_reasons.json');
  for (const c of f.cases) {
    it(`${c.id}: ${c.description}`, () => {
      const s = c.signals;
      const sig: ReasonSignals = {
        daysRested: s.daysRested, weekSets: s.weekSets, inRoutine: set(s.inRoutine), builtByYou: set(s.builtByYou),
        sameVariation: set(s.sameVariation), progressReady: set(s.progressReady),
      };
      expect(reasonsFor(f.candidate, f.target, c.favourite, sig)).toEqual(c.expected);
    });
  }
  it('no signals object gives none; a custom exercise is built_by_you; ranked rows carry at most 2', () => {
    expect(reasonsFor(f.candidate, 'lats', false, undefined)).toEqual([]);
    expect(reasonsFor({ ...f.candidate, custom: true }, 'lats', false, {})).toEqual([{ code: 'built_by_you' }]);
    const g = fx('suggest_list.json');
    const ctx = toCtx(g.context, buildTaxonomy(g.muscles));
    const ranked = rankCandidates(g.candidates, 'chest', 'none', ctx, { daysRested: { chest: 4 }, weekSets: { chest: 1 }, inRoutine: new Set(['pec-deck-fly']) });
    expect(ranked.every((r) => r.reasons.length <= 2)).toBe(true);
    expect(ranked.find((r) => r.slug === 'pec-deck-fly')?.reasons.map((r) => r.code)).toEqual(['recovered', 'neglected']);
  });
});

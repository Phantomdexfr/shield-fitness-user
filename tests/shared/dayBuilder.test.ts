import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import { estimateMinutes, validateItemPatch } from '../../src/shared/routineEdit';
import type { ScoreContext } from '../../src/shared/suggest';
import {
  buildDay, dayPlan, entriesToItems, equipmentPool, FULL_BODY_MUSCLES, itemSeconds, musclesForLabel, quickPlan, quickWorkout, shuffleEntry,
  slotRanked, supersetPartners, totalSeconds, type BuildCandidate, type BuildResult,
} from '../../src/shared/dayBuilder';

const fx = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}`, 'utf8'));
const time = fx('daybuilder_time.json');
const cases = fx('daybuilder_cases.json');
const tax = buildTaxonomy(cases.muscles);
const pool: BuildCandidate[] = cases.pool;
const machineOf = (slug: string) => pool.find((c) => c.slug === slug)!.machine;

const set = (a?: string[]) => (a ? new Set(a) : undefined);
const ctxFor = (c?: { avoid?: string[]; sore?: string[]; hidden?: string[] }): ScoreContext => ({ tax, dayKey: cases.dayKey, avoid: set(c?.avoid), sore: set(c?.sore), hidden: set(c?.hidden) });
const slugs = (r: BuildResult) => r.entries.map((e) => e.slug);

/** Properties every result must keep, whatever the case. */
function invariants(r: BuildResult) {
  expect(r.seconds).toBe(totalSeconds(r.entries, r.model));
  expect(r.seconds).toBeLessThanOrEqual(r.limitSec);
  expect(new Set(slugs(r)).size).toBe(r.entries.length);
  for (const e of r.entries) {
    expect(e.sets).toBeGreaterThanOrEqual(1);
    expect(e.repMin).toBeLessThanOrEqual(e.repMax);
  }
}

describe('time arithmetic (fixtures)', () => {
  it('day model: sets x (45 s + rest)', () => {
    for (const c of time.day) expect(totalSeconds(c.items, 'day')).toBe(c.seconds);
  });
  it('quick model: sets x (reps x 3 s + rest + 20 s)', () => {
    for (const c of time.quick) expect(totalSeconds(c.items, 'quick')).toBe(c.seconds);
  });
  it('one item', () => {
    expect(itemSeconds({ sets: 3, repMax: 10, restSec: 120 }, 'day')).toBe(495);
    expect(itemSeconds({ sets: 3, repMax: 12, restSec: 75 }, 'quick')).toBe(393);
  });
  it('the day model agrees with the routine editor estimate (which rounds up to 5 minutes)', () => {
    const items = cases.day[0] && buildDay({ muscles: ['chest', 'shoulders', 'triceps'], minutes: 45 }, pool, ctxFor()).entries;
    const sec = totalSeconds(items, 'day');
    expect(estimateMinutes(entriesToItems(items, (e) => ({ kind: 'lib', slug: e.slug })))).toBe(Math.ceil(sec / 60 / 5) * 5);
  });
});

describe('plans and labels', () => {
  it('day plan by time box', () => {
    expect(dayPlan(20)).toEqual({ warmup: 0, main: 1, isolation: 2, finisher: 0, cooldown: 0 });
    expect(dayPlan(30)).toEqual({ warmup: 1, main: 2, isolation: 3, finisher: 0, cooldown: 1 });
    expect(dayPlan(45)).toEqual({ warmup: 2, main: 2, isolation: 3, finisher: 1, cooldown: 1 });
    expect(dayPlan(60)).toEqual({ warmup: 2, main: 3, isolation: 4, finisher: 1, cooldown: 1 });
  });
  it('quick plan: 15 min = 2-3 exercises, 30 min = 4-5, nothing but main and isolation', () => {
    const n = (m: number) => { const p = quickPlan(m); return p.main + p.isolation; };
    expect(n(15)).toBe(3);
    expect(n(30)).toBe(5);
    for (const m of [15, 20, 30, 45, 60]) { const p = quickPlan(m); expect([p.warmup, p.finisher, p.cooldown]).toEqual([0, 0, 0]); }
  });
  it('split label maps to muscles', () => {
    for (const l of cases.labels) expect(musclesForLabel(l.label), l.label).toEqual(l.muscles ?? undefined);
    expect(FULL_BODY_MUSCLES).toEqual(musclesForLabel('Full body'));
  });
});

describe('buildDay (fixtures)', () => {
  for (const c of cases.day) {
    it(c.name, () => {
      const r = buildDay({ ...c.spec, rampNote: cases.rampNote }, pool, ctxFor(c.ctx));
      invariants(r);
      const x = c.expect;
      if (x.reason) expect(r.reason).toBe(x.reason);
      if (x.slugs && !x.mustInclude) expect(slugs(r)).toEqual(x.slugs);
      if (x.slots) expect(r.entries.map((e) => e.slot)).toEqual(x.slots);
      if (x.sets) expect(r.entries.map((e) => e.sets)).toEqual(x.sets);
      if (x.seconds !== undefined) expect(r.seconds).toBe(x.seconds);
      if (x.mustInclude) for (const s of x.mustInclude) expect(slugs(r), s).toContain(s);
      if (x.mustNotInclude) for (const s of x.mustNotInclude) expect(slugs(r), s).not.toContain(s);
      if (x.allowedMachines) for (const e of r.entries) expect(x.allowedMachines, e.slug).toContain(machineOf(e.slug));
      if (x.noteOn) expect(r.entries.filter((e) => e.note).map((e) => e.slug)).toEqual([x.noteOn]);
    });
  }
  it('every time box from 10 to 120 min stays inside the box with no duplicate', () => {
    for (let m = 10; m <= 120; m += 5) invariants(buildDay({ muscles: ['chest', 'shoulders', 'triceps', 'lats', 'quads'], minutes: m }, pool, ctxFor()));
  });
  it('a custom time box is clamped to 10-120', () => {
    expect(buildDay({ muscles: ['chest'], minutes: 3 }, pool, ctxFor()).limitSec).toBe(600);
    expect(buildDay({ muscles: ['chest'], minutes: 999 }, pool, ctxFor()).limitSec).toBe(7200);
  });
  it('slot rules: main = compound with the muscle as primary, isolation = isolation, cooldown = recovery, finisher = conditioning', () => {
    const r = buildDay({ muscles: ['chest', 'shoulders', 'triceps'], minutes: 60 }, pool, ctxFor());
    const cat = (s: string) => pool.find((c) => c.slug === s)!;
    for (const e of r.entries) {
      if (e.slot === 'main') expect(cat(e.slug).category).toBe('compound');
      if (e.slot === 'isolation') expect(cat(e.slug).category).toBe('isolation');
      if (e.slot === 'cooldown') expect(cat(e.slug).category).toBe('recovery');
      if (e.slot === 'finisher') expect(['conditioning', 'cardio_machine', 'plyometric']).toContain(cat(e.slug).subCategory);
      if (e.slot === 'warmup') expect(cat(e.slug).category === 'warmup' || cat(e.slug).warmup === true).toBe(true);
    }
    expect(r.entries.map((e) => e.slot)).toEqual([...r.entries.map((e) => e.slot)].sort((a, b) => ['warmup', 'main', 'isolation', 'finisher', 'cooldown'].indexOf(a) - ['warmup', 'main', 'isolation', 'finisher', 'cooldown'].indexOf(b)));
  });
  it('a warm-up can be a normal exercise flagged as also usable as a warm-up', () => {
    expect(slotRanked('warmup', 'quads', pool, ctxFor()).map((r) => r.slug)).toEqual(['goblet-squat']);
  });
  it('same input, same day: same result (deterministic)', () => {
    const a = buildDay({ muscles: ['chest', 'lats'], minutes: 45 }, pool, ctxFor());
    const b = buildDay({ muscles: ['chest', 'lats'], minutes: 45 }, [...pool].reverse(), ctxFor());
    expect(slugs(a)).toEqual(slugs(b));
  });
  it('the pool and the input are not changed', () => {
    const before = JSON.stringify(pool);
    buildDay({ muscles: ['chest'], minutes: 45 }, pool, ctxFor());
    expect(JSON.stringify(pool)).toBe(before);
  });
  it('a muscle with no exercise at all gives no_matches', () => {
    expect(buildDay({ muscles: ['abs'], minutes: 30 }, pool, ctxFor()).reason).toBe('no_matches');
  });
  it('an avoid mark on the only target muscle drops every exercise that meets it (engines.md 6: primary at medium/high, secondary at high)', () => {
    const r = buildDay({ muscles: ['chest'], minutes: 45 }, pool, ctxFor({ avoid: ['chest'] }));
    // The push-up has chest at LOW emphasis, so it is not excluded by the rule; dips has chest as a high secondary.
    for (const e of r.entries) expect(['bench-press', 'incline-press', 'cable-fly', 'dips']).not.toContain(e.slug);
  });
});

describe('equipment mode only filters', () => {
  it('bodyweight keeps no-machine exercises, gym keeps all', () => {
    expect(equipmentPool(pool, 'gym')).toHaveLength(pool.length);
    expect(equipmentPool(pool, undefined)).toHaveLength(pool.length);
    expect(equipmentPool(pool, 'bodyweight').every((c) => c.machine === '' || c.machine === 'yoga-mat')).toBe(true);
    expect(pool).toHaveLength(cases.pool.length);
  });
});

describe('quickWorkout (fixtures)', () => {
  for (const c of cases.quick) {
    it(c.name, () => {
      let n = 0;
      const r = quickWorkout({ ...c.input, rampNote: cases.rampNote, makeGroup: () => `g${++n}` }, pool, ctxFor(c.ctx));
      invariants(r);
      expect(r.seconds).toBeLessThanOrEqual(c.input.minutes * 60);
      const x = c.expect;
      if (x.slugs) expect(slugs(r)).toEqual(x.slugs);
      if (x.slots) expect(r.entries.map((e) => e.slot)).toEqual(x.slots);
      if (x.sets) expect(r.entries.map((e) => e.sets)).toEqual(x.sets);
      if (x.seconds !== undefined) expect(r.seconds).toBe(x.seconds);
      if (x.mustInclude) for (const s of x.mustInclude) expect(slugs(r), s).toContain(s);
      if (x.mustNotInclude) for (const s of x.mustNotInclude) expect(slugs(r), s).not.toContain(s);
      if (x.noNote) expect(r.entries.every((e) => !e.note)).toBe(true);
      if (x.noteOn) expect(r.entries.filter((e) => e.note).map((e) => e.slug)).toEqual([x.noteOn]);
      if (x.sameGroup) {
        const [i, j] = x.sameGroup;
        expect(r.entries[i]!.group).toBeTruthy();
        expect(r.entries[i]!.group).toBe(r.entries[j]!.group);
      }
    });
  }
  it('every quick length is inside its box; compounds come before isolation; no warm-up, finisher or cooldown', () => {
    for (const m of [15, 20, 30, 45, 60]) {
      const r = quickWorkout({ minutes: m, muscles: ['chest', 'lats', 'quads'] }, pool, ctxFor());
      invariants(r);
      const slots = r.entries.map((e) => e.slot);
      expect(slots.every((s) => s === 'main' || s === 'isolation')).toBe(true);
      expect(slots.lastIndexOf('main')).toBeLessThan(slots.indexOf('isolation') === -1 ? 99 : slots.indexOf('isolation'));
    }
  });
  it("'full' means the full-body muscles", () => {
    const r = quickWorkout({ minutes: 30, muscles: 'full' }, pool, ctxFor());
    invariants(r);
    expect(r.entries.length).toBeGreaterThan(0);
  });
  it('equipment mode is respected', () => {
    const r = quickWorkout({ minutes: 30, muscles: ['chest', 'triceps'], equipment: 'bodyweight' }, pool, ctxFor());
    for (const e of r.entries) expect(['', 'yoga-mat']).toContain(machineOf(e.slug));
  });
});

describe('shuffle one', () => {
  const base = () => buildDay({ muscles: ['chest', 'shoulders', 'triceps'], minutes: 45 }, pool, ctxFor());
  it('replaces one entry, keeps the slot, the sets and the total time, and never repeats an exercise in the day', () => {
    const r = base();
    const i = r.entries.findIndex((e) => e.slug === 'bench-press');
    const s = shuffleEntry(r, i, ['chest', 'shoulders', 'triceps'], pool, ctxFor())!;
    expect(s.entries[i]!.slug).not.toBe('bench-press');
    expect(s.entries[i]!.slot).toBe('main');
    expect(s.seconds).toBe(r.seconds);
    invariants(s);
    expect(s.entries.filter((_, k) => k !== i)).toEqual(r.entries.filter((_, k) => k !== i));
    expect(slugs(r)).toContain('bench-press');
  });
  it('walks through the candidates with `tried`, then starts again', () => {
    const r = base();
    const i = r.entries.findIndex((e) => e.slug === 'bench-press');
    const tried = new Set<string>();
    const seen: string[] = [];
    for (let k = 0; k < 3; k++) {
      const s = shuffleEntry(r, i, ['chest'], pool, ctxFor(), { tried })!;
      seen.push(s.entries[i]!.slug);
      tried.add(s.entries[i]!.slug);
    }
    expect(new Set(seen.slice(0, 2)).size).toBe(2);
    expect(seen[2]).toBe(seen[0]);
  });
  it('respects marks, hidden and equipment', () => {
    const r = base();
    const i = r.entries.findIndex((e) => e.slug === 'bench-press');
    const s = shuffleEntry(r, i, ['chest'], pool, ctxFor({ hidden: ['incline-press'], avoid: [] }), { equipment: 'bodyweight' });
    // Under the bodyweight preset the only other chest compound is the push-up.
    expect(s?.entries[i]?.slug).toBe('push-up');
  });
  it('gives null when nothing else fits, or the index is wrong', () => {
    const r = buildDay({ muscles: ['chest'], minutes: 10 }, pool, ctxFor());
    expect(shuffleEntry(r, 9, ['chest'], pool, ctxFor())).toBeNull();
    expect(shuffleEntry(r, 0, ['chest'], [pool.find((c) => c.slug === 'bench-press')!], ctxFor())).toBeNull();
  });
});

describe('entries become a normal Day', () => {
  it('items pass the routine editor limits, keep notes and supersets', () => {
    let n = 0;
    const r = quickWorkout({ minutes: 15, muscles: ['chest', 'lats', 'quads'], pairs: [{ a: 'bench-press', b: 'row' }], makeGroup: () => `g${++n}` }, pool, ctxFor());
    const items = entriesToItems(r.entries, (e) => ({ kind: 'lib', slug: e.slug }));
    expect(items.map((i) => i.tag)).toEqual(['superset', 'superset']);
    expect(items[0]!.supersetGroup).toBe(items[1]!.supersetGroup);
    for (const it of items) expect(validateItemPatch(it, {}).ok).toBe(true);
    const day = entriesToItems(buildDay({ muscles: ['chest'], minutes: 45, rampNote: 'x' }, pool, ctxFor()).entries, (e) => ({ kind: 'lib', slug: e.slug }));
    expect(day.filter((i) => i.note)).toHaveLength(1);
    for (const it of day) expect(validateItemPatch(it, {}).ok).toBe(true);
  });
});

describe('superset swipe partners', () => {
  const pairs = [
    { a: 'bench-press', b: 'curl', type: 'compatible', muscles: ['chest', 'biceps'] },
    { a: 'row', b: 'bench-press', type: 'antagonist', muscles: ['back', 'chest'] },
    { a: 'bench-press', b: 'pushdown', type: 'compatible', muscles: ['chest', 'triceps'] },
    { a: 'squat', b: 'row', type: 'antagonist', muscles: ['quads', 'back'] },
  ];
  it('antagonists first, then compatible, file order within each; either side of a pair', () => {
    expect(supersetPartners('bench-press', pairs, pool, ctxFor()).map((p) => [p.slug, p.type])).toEqual([['row', 'antagonist'], ['curl', 'compatible'], ['pushdown', 'compatible']]);
    expect(supersetPartners('curl', pairs, pool, ctxFor()).map((p) => p.slug)).toEqual(['bench-press']);
    expect(supersetPartners('nothing', pairs, pool, ctxFor())).toEqual([]);
  });
  it('leaves out hidden, marked and off-preset partners', () => {
    expect(supersetPartners('bench-press', pairs, pool, ctxFor({ hidden: ['row'] })).map((p) => p.slug)).toEqual(['curl', 'pushdown']);
    expect(supersetPartners('bench-press', pairs, pool, ctxFor({ avoid: ['triceps'] })).map((p) => p.slug)).toEqual(['row', 'curl']);
    expect(supersetPartners('bench-press', pairs, pool, ctxFor(), 'bodyweight')).toEqual([]);
  });
});

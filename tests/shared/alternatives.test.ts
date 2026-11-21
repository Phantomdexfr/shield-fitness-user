import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTaxonomy } from '../../src/shared/muscles';
import { alternativesFor, primaryIds, reasonAdjustment, type AltCandidate, type AlternativesInput } from '../../src/shared/alternatives';
import { clearMachineBusy, markMachineBusy, swapItem, type Session, type SessionItem } from '../../src/shared/session';
import type { ScoreContext } from '../../src/shared/suggest';

const fx = JSON.parse(readFileSync('contract/fixtures/alternatives_cases.json', 'utf8'));
const tax = buildTaxonomy(fx.muscles);

const ctxOf = (c: any, extra: Partial<ScoreContext> = {}): ScoreContext => ({ tax, dayKey: c.dayKey, level: c.level, track: c.track, ...extra });

describe('alternativesFor (fixtures: Phase 14 worked examples on the real data)', () => {
  for (const c of fx.cases) {
    it(c.id, () => {
      const res = alternativesFor({
        skipped: c.skipped, reason: c.reason, area: c.area, pool: c.pool, variations: c.variations, substitutes: c.substitutes, ctx: ctxOf(c.context),
      });
      expect(res.alternatives.map((a) => a.slug)).toEqual(c.expected.items.map((x: any) => x.slug));
      expect(res.alternatives.map((a) => a.score)).toEqual(c.expected.items.map((x: any) => x.score));
      expect(res.alternatives.map((a) => a.pool)).toEqual(c.expected.pools);
      if (c.expected.variations) expect(res.alternatives.flatMap((a) => (a.kind === 'variation' ? [a.variation] : []))).toEqual(c.expected.variations);
    });
  }
});

// ---------- small synthetic pool: one rule at a time ----------

const cand = (slug: string, o: Partial<AltCandidate> = {}): AltCandidate => ({
  slug, name: o.name ?? slug, category: 'compound', kind: 'strength', difficulty: 2, unilateral: 0, beginner: 0, tracks: 0, machine: '',
  rows: [['lower_chest', 'p', 'h']], primary: ['chest'], pattern: 'press', ...o,
});
const skipped = cand('bench', { machine: 'flat-bench', difficulty: 2 });
const base = (o: Partial<AlternativesInput> = {}): AlternativesInput => ({
  skipped, reason: 'other', pool: [], variations: [], substitutes: [], ctx: { tax, dayKey: '2026-11-19' }, ...o,
});
const slugs = (r: ReturnType<typeof alternativesFor>) => r.alternatives.map((a) => a.slug);

describe('reason handling', () => {
  const pool = [
    cand('same-machine', { machine: 'flat-bench' }),
    cand('other-machine', { machine: 'cable' }),
    cand('easier', { machine: 'cable-2', difficulty: 1 }),
    cand('harder', { machine: 'cable-3', difficulty: 3 }),
  ];

  it('busy drops candidates on the same machine, and the variations of a machine exercise', () => {
    const r = alternativesFor(base({ reason: 'busy', pool, variations: ['wide', 'narrow'] }));
    expect(slugs(r)).not.toContain('same-machine');
    expect(r.alternatives.some((a) => a.kind === 'variation')).toBe(false);
    expect(slugs(r)).toEqual(expect.arrayContaining(['other-machine', 'easier', 'harder']));
  });

  it('busy keeps the variations of an exercise with no machine', () => {
    const r = alternativesFor(base({ skipped: cand('push-up', { machine: '' }), reason: 'busy', variations: ['wide', 'narrow'], pool: [] }));
    expect(r.alternatives.map((a) => (a.kind === 'variation' ? a.variation : ''))).toEqual(['wide', 'narrow']);
  });

  it('a session-busy machine hides its exercises for any reason', () => {
    const r = alternativesFor(base({ reason: 'other', pool, busyMachines: new Set(['cable']) }));
    expect(slugs(r)).not.toContain('other-machine');
    expect(slugs(r)).toContain('same-machine');
  });

  it('pain applies the avoid test to the picked area and keeps the rest', () => {
    const p = [cand('curl', { category: 'isolation', rows: [['biceps', 'p', 'h']], primary: ['biceps'], pattern: 'curl' }), cand('fly', { rows: [['lower_chest', 'p', 'm']] })];
    const chest = alternativesFor(base({ reason: 'pain', area: ['chest'], pool: p, variations: ['wide'] }));
    expect(slugs(chest)).not.toContain('fly');
    expect(chest.alternatives.some((a) => a.kind === 'variation')).toBe(false);
    expect(chest.area).toEqual(['chest']);
    const arm = alternativesFor(base({ reason: 'pain', area: ['biceps'], pool: p }));
    expect(slugs(arm)).toEqual(['fly']);
  });

  it('pain without an area uses the exercise\'s own primary muscles', () => {
    const r = alternativesFor(base({ reason: 'pain', pool: [cand('fly', { rows: [['lower_chest', 'p', 'm']] })] }));
    expect(r.area).toEqual(['lower_chest']);
    expect(slugs(r)).toEqual([]);
  });

  it('pain never changes the caller\'s marks', () => {
    const avoid = new Set<string>(['calves']);
    alternativesFor(base({ reason: 'pain', area: ['chest'], pool, ctx: { tax, dayKey: '2026-11-19', avoid } }));
    expect([...avoid]).toEqual(['calves']);
  });

  it('pain and too_hard add +0.5 per step easier; too_hard also drops harder ones', () => {
    const score = (r: ReturnType<typeof alternativesFor>, slug: string) => r.alternatives.find((a) => a.slug === slug)!.score;
    const plain = alternativesFor(base({ reason: 'other', pool }));
    const pain = alternativesFor(base({ reason: 'pain', area: ['biceps'], pool }));
    const hard = alternativesFor(base({ reason: 'too_hard', pool }));
    expect(+(score(pain, 'easier') - score(plain, 'easier')).toFixed(4)).toBe(0.5);
    expect(+(score(pain, 'harder') - score(plain, 'harder')).toFixed(4)).toBe(0);
    expect(pain.alternatives.find((a) => a.slug === 'easier')!.chip).toBe('easier');
    expect(slugs(hard)).not.toContain('harder');
    expect(+(score(hard, 'easier') - score(plain, 'easier')).toFixed(4)).toBe(0.5);
    expect(slugs(pain)).toContain('harder');
    expect(reasonAdjustment('too_hard', { difficulty: 3 }, { difficulty: 1, category: 'compound' })).toBe(1);
    expect(reasonAdjustment('too_hard', { difficulty: 1 }, { difficulty: 3, category: 'compound' })).toBe(0);
  });

  it('no_time gives single-joint exercises +1; other leaves scores alone', () => {
    const iso = cand('iso', { category: 'isolation', pattern: 'fly' });
    expect(reasonAdjustment('no_time', skipped, iso)).toBe(1);
    expect(reasonAdjustment('no_time', skipped, cand('c'))).toBe(0);
    expect(reasonAdjustment('other', skipped, iso)).toBe(0);
  });
});

describe('pools, limits and exclusions', () => {
  it('pool order wins over score: variations, then pattern, then substitutes, then same muscle', () => {
    const p = [
      cand('pattern-hit', { rows: [['lower_chest', 'p', 'l']] }),
      cand('sub-hit', { pattern: 'fly', category: 'isolation', rows: [['lower_chest', 'p', 'h']] }),
      cand('muscle-hit', { pattern: 'fly', category: 'isolation', rows: [['lower_chest', 'p', 'h']] }),
    ];
    const r = alternativesFor(base({ pool: p, variations: ['wide'], substitutes: ['sub-hit'] }));
    expect(r.alternatives.map((a) => [a.slug, a.pool])).toEqual([['bench', 1], ['pattern-hit', 2], ['sub-hit', 3], ['muscle-hit', 4]]);
    expect(r.alternatives.map((a) => a.chip)).toEqual(['same_exercise', 'same_muscle', 'substitute', 'same_muscle']);
  });

  it('stops at 5, never offers the skipped exercise or a repeat, drops the current variation', () => {
    const p = Array.from({ length: 8 }, (_, i) => cand(`x${i}`));
    const r = alternativesFor(base({ pool: [skipped, ...p], variations: ['a', 'b', 'c'], variation: 'a', substitutes: ['x0'] }));
    expect(r.alternatives).toHaveLength(5);
    expect(r.alternatives.filter((a) => a.kind === 'variation').map((a: any) => a.variation)).toEqual(['b', 'c']);
    expect(slugs(r).filter((s) => s === 'bench')).toHaveLength(2);
    expect(new Set(r.alternatives.filter((a) => a.kind === 'exercise').map((a) => a.slug)).size).toBe(3);
  });

  it('hidden, avoid marks and unavailable machines are never offered', () => {
    const p = [cand('hid'), cand('avd'), cand('down', { machine: 'm1' }), cand('ok')];
    const ctx: ScoreContext = { tax, dayKey: '2026-11-19', hidden: new Set(['hid']), avoid: new Set<string>(), machineStatus: { m1: 'out_of_order' } };
    expect(slugs(alternativesFor(base({ pool: p, ctx }))).sort()).toEqual(['avd', 'ok']);
    const avoided = alternativesFor(base({ pool: p, ctx: { ...ctx, avoid: new Set(['lower_chest']) } }));
    expect(slugs(avoided)).toEqual([]);
  });

  it('empty and missing data give an empty list, not an error', () => {
    expect(alternativesFor(base()).alternatives).toEqual([]);
    expect(alternativesFor(base({ skipped: cand('odd', { rows: [], primary: [] }), pool: [cand('x')] })).alternatives).toEqual([]);
  });

  it('a custom exercise (no pattern) skips the pattern pool but still gets same-muscle picks', () => {
    const custom = cand('my-press', { pattern: '', category: 'custom', custom: true });
    const r = alternativesFor(base({ skipped: custom, pool: [cand('a'), cand('b', { pattern: '' })] }));
    expect(r.alternatives.map((a) => a.pool)).toEqual([4, 4]);
  });

  it('primaryIds reads primary rows in order, once', () => {
    expect(primaryIds([['lats', 'p', 'h'], ['biceps', 's', 'm'], ['lats', 'p', 'm'], ['rhomboids', 'p', 'm']])).toEqual(['lats', 'rhomboids']);
  });

  it('does not change its inputs', () => {
    const pool = [cand('a'), cand('b')];
    const copy = JSON.stringify(pool);
    alternativesFor(base({ pool, variations: ['v'] }));
    expect(JSON.stringify(pool)).toBe(copy);
  });
});

// ---------- swap and busy machine (session) ----------

const item = (slug: string, o: Partial<SessionItem> = {}): SessionItem => ({ ref: { kind: 'lib', slug }, status: 'todo', sets: [], order: 0, ...o });
const sess = (items: SessionItem[]): Session => ({ id: 's1', clientId: 's1', startedAt: '2026-11-19T04:30:00.000Z', items: items.map((it, i) => ({ ...it, order: i })) });
const set = { weightKg: 40, reps: 8, tag: 'normal' as const, doneAt: '2026-11-19T04:40:00.000Z' };

describe('swapItem', () => {
  it('keeps the sets on the original (skipped with the reason) and adds the replacement right after it', () => {
    const s = sess([item('a', { status: 'doing', sets: [set, set], plan: { sets: 3, repMin: 8, repMax: 10, restSec: 90 } }), item('b'), item('c')]);
    const out = swapItem(s, 0, { ref: { kind: 'lib', slug: 'z' } }, 'busy');
    expect(out.items.map((i) => i.ref.kind === 'lib' && i.ref.slug)).toEqual(['a', 'z', 'b', 'c']);
    expect(out.items.map((i) => i.order)).toEqual([0, 1, 2, 3]);
    expect(out.items[0]).toMatchObject({ status: 'skipped', skipReason: 'busy' });
    expect(out.items[0]!.sets).toHaveLength(2);
    expect(out.items[1]).toMatchObject({ status: 'todo', sets: [], plan: { sets: 3, repMin: 8, repMax: 10, restSec: 90 } });
  });

  it('a done original stays done; the input is not changed', () => {
    const s = sess([item('a', { status: 'done', sets: [set] })]);
    const before = JSON.stringify(s);
    const out = swapItem(s, 0, { ref: { kind: 'lib', slug: 'z' } }, 'pain');
    expect(out.items[0]!.status).toBe('done');
    expect(out.items[0]!.skipReason).toBeUndefined();
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a variation swap keeps the exercise and its setup; another exercise drops the setup', () => {
    const s = sess([item('a', { setup: { grip: 'neutral' } })]);
    const v = swapItem(s, 0, { ref: { kind: 'lib', slug: 'a' }, variation: 'wide' }, 'other');
    expect(v.items[1]).toMatchObject({ variation: 'wide', setup: { grip: 'neutral' } });
    const e = swapItem(s, 0, { ref: { kind: 'lib', slug: 'z' } }, 'other');
    expect(e.items[1]!.setup).toBeUndefined();
  });

  it('a bad index changes nothing', () => {
    const s = sess([item('a')]);
    expect(swapItem(s, 4, { ref: { kind: 'lib', slug: 'z' } })).toBe(s);
  });
});

describe('busy machines', () => {
  it('mark is unique, Undo clears it, an empty name is ignored', () => {
    const s = sess([item('a')]);
    const m1 = markMachineBusy(markMachineBusy(s, 'cable'), 'cable');
    expect(m1.busyMachines).toEqual(['cable']);
    expect(markMachineBusy(m1, 'smith').busyMachines).toEqual(['cable', 'smith']);
    expect(markMachineBusy(s, '')).toBe(s);
    expect(clearMachineBusy(m1, 'cable').busyMachines).toBeUndefined();
    expect(s.busyMachines).toBeUndefined();
  });
});

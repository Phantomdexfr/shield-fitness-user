import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFuzzyIndex, expandQuery, fuzzySearch, parseRawIndex, type FuzzyIndex, type RawSearchIndex } from '../../src/dataset/fuzzy';

// The real compiled search index (Phase 10), read straight from disk.
const dir = new URL('../../src/dataset/generated/', import.meta.url);
const file = readdirSync(dir).find((f) => f.startsWith('search.index.')) as string;
const raw = parseRawIndex(JSON.parse(readFileSync(new URL(file, dir), 'utf8'))) as RawSearchIndex;
const index: FuzzyIndex = buildFuzzyIndex(raw);

interface Case {
  id: string;
  q: string;
  expect: { type: 'e' | 'm'; slug: string; rank: number };
  didYouMean?: string;
  suggestedSetup?: { axis: string; value: string };
  expandsTo?: string[];
}
const fixture = JSON.parse(readFileSync(new URL('../../contract/fixtures/search_queries.json', import.meta.url), 'utf8')) as { cases: Case[] };
const budget = JSON.parse(readFileSync(new URL('../../contract/fixtures/search_budget.json', import.meta.url), 'utf8')) as { budget_ms: number; queries: string[] };

describe('fuzzy search fixtures (contract/fixtures/search_queries.json)', () => {
  it('has at least 20 queries', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(20);
  });
  for (const c of fixture.cases) {
    it(`${c.id}: "${c.q}"`, () => {
      const r = fuzzySearch(index, c.q);
      const pos = r.hits.findIndex((h) => h.type === c.expect.type && h.slug === c.expect.slug);
      expect(pos, `${c.expect.slug} not found`).toBeGreaterThanOrEqual(0);
      expect(pos + 1).toBeLessThanOrEqual(c.expect.rank);
      if (c.didYouMean !== undefined) expect(r.didYouMean).toBe(c.didYouMean);
      if (c.suggestedSetup !== undefined) expect(r.suggestedSetup).toEqual(c.suggestedSetup);
      if (c.expandsTo !== undefined) expect(r.tokens).toEqual(c.expandsTo);
    });
  }
});

describe('fuzzy search rules (engines.md 14)', () => {
  it('parseRawIndex rejects things that are not a search index', () => {
    expect(parseRawIndex(null)).toBeNull();
    expect(parseRawIndex({ vocab: [] })).toBeNull();
    expect(parseRawIndex(raw)).not.toBeNull();
  });

  it('an empty or one-letter query returns nothing', () => {
    expect(fuzzySearch(index, '').hits).toEqual([]);
    expect(fuzzySearch(index, '   ').hits).toEqual([]);
    expect(fuzzySearch(index, 'x').hits).toEqual([]);
  });

  it('gibberish finds nothing and offers no correction', () => {
    const r = fuzzySearch(index, 'xyzzy');
    expect(r.hits).toEqual([]);
    expect(r.didYouMean).toBeUndefined();
  });

  it('is deterministic and ordered best first, ties shorter name then slug', () => {
    const a = fuzzySearch(index, 'curl');
    const b = fuzzySearch(index, 'curl');
    expect(a).toEqual(b);
    for (let i = 1; i < a.hits.length; i += 1) expect((a.hits[i - 1] as { score: number }).score).toBeGreaterThanOrEqual((a.hits[i] as { score: number }).score);
  });

  it('upper case, accents and punctuation do not matter', () => {
    const plain = fuzzySearch(index, 'lat pulldown').hits.map((h) => h.slug);
    expect(fuzzySearch(index, 'LAT-Pülldown!').hits.map((h) => h.slug)).toEqual(plain);
  });

  it('a word still being typed is not a typo (no "did you mean")', () => {
    expect(fuzzySearch(index, 'pulldo').didYouMean).toBeUndefined();
    expect(fuzzySearch(index, 'bench pre').didYouMean).toBeUndefined();
  });

  it('transposed letters count as one edit', () => {
    const r = fuzzySearch(index, 'lat pulldonw');
    expect(r.hits[0]?.slug).toBe('lat-pulldown');
  });

  it('alias expansion is one pass, longest phrase first, and drops a repeated word', () => {
    expect(expandQuery(index, 'ez bar curl')).toEqual(['ez', 'bar', 'curl']);
    expect(expandQuery(index, 'lat pd')).toEqual(['lat', 'pulldown']);
  });

  it('a setup word the exercise does not offer does not hide it (second pass)', () => {
    const r = fuzzySearch(index, 'plank rope');
    expect(r.hits.some((h) => h.slug === 'plank')).toBe(true);
  });

  it('filler words after a setup word never block a match', () => {
    const a = fuzzySearch(index, 'lat pulldown wide').hits.map((h) => h.slug);
    const b = fuzzySearch(index, 'lat pulldown wide grip').hits.map((h) => h.slug);
    expect(b[0]).toBe(a[0]);
  });

  it('the setup chip is only given when the top exercise offers it', () => {
    expect(fuzzySearch(index, 'plank rope').suggestedSetup).toBeUndefined();
    expect(fuzzySearch(index, 'lat pulldown wide').suggestedSetup).toEqual({ axis: 'width', value: 'wide' });
  });

  it('accept() drops documents before ranking and before the setup chip', () => {
    const r = fuzzySearch(index, 'lat pulldown', { accept: (d) => d.type === 'e' && d.slug !== 'lat-pulldown' });
    expect(r.hits.some((h) => h.slug === 'lat-pulldown' && h.type === 'e')).toBe(false);
    expect(r.hits.every((h) => h.type === 'e')).toBe(true);
  });

  it('extra documents (custom exercises) are searchable and can be filtered out', () => {
    const withCustom = buildFuzzyIndex(raw, [
      { type: 'e', slug: 'my-quokka-hold', name: ['quokka', 'hold'], alias: [], machine: [], muscle: ['core'], setup: [], category: ['custom'] },
    ]);
    expect(fuzzySearch(withCustom, 'quokka').hits[0]?.slug).toBe('my-quokka-hold');
    expect(fuzzySearch(withCustom, 'quokkha hold').hits[0]?.slug).toBe('my-quokka-hold');
    expect(fuzzySearch(index, 'quokka').hits).toEqual([]);
  });

  it('machines and exercises both come back, flagged by type', () => {
    const r = fuzzySearch(index, 'cable crossover');
    expect(r.hits.some((h) => h.type === 'm')).toBe(true);
    expect(r.hits.some((h) => h.type === 'e')).toBe(true);
  });
});

describe('fuzzy search benchmark', () => {
  it(`stays under ${budget.budget_ms} ms per query over ${index.docs.length} documents (build machine, not a phone)`, () => {
    // warm once so the JIT is not part of the measure
    fuzzySearch(index, 'lat pulldown');
    let worst = 0;
    for (const q of budget.queries) {
      const t = performance.now();
      fuzzySearch(index, q);
      worst = Math.max(worst, performance.now() - t);
    }
    expect(index.docs.length).toBeGreaterThanOrEqual(680);
    expect(worst).toBeLessThan(budget.budget_ms);
  });
});

describe('fuzzyExercises (query layer, real generated data)', () => {
  it('returns exercise rows, machines, did-you-mean and the setup chip; filters apply', async () => {
    const { fuzzyExercises, resetQueryCache } = await import('../../src/dataset/query');
    resetQueryCache();
    const typo = await fuzzyExercises('latt pulldwn');
    expect(typo.hits[0]?.row.slug).toBe('lat-pulldown');
    expect(typo.didYouMean).toBe('lat pulldown');

    const setup = await fuzzyExercises('lat pulldown wide grip');
    expect(setup.suggestedSetup).toEqual({ axis: 'width', value: 'wide' });

    const cross = await fuzzyExercises('cable crossover');
    expect(cross.machines).toContain('cable-crossover');

    const strictly = await fuzzyExercises('curl', { kind: 'cardio' });
    expect(strictly.hits.every((h) => h.row.kind === 'cardio')).toBe(true);
    expect(strictly.machines).toEqual([]);
  });

  it('merges custom exercises and treats an empty query as browse', async () => {
    const { fuzzyExercises, resetQueryCache } = await import('../../src/dataset/query');
    resetQueryCache();
    const custom = [{ name: 'Quokka Hold', slug: 'my-quokka-hold', kind: 'bodyweight' as const, muscles: [{ id: 'abs', role: 'primary' as const, emphasis: 'high' as const }], repMin: 5, repMax: 10 }];
    const r = await fuzzyExercises('quokkha', {}, { custom });
    expect(r.hits[0]?.row.slug).toBe('my-quokka-hold');
    const browse = await fuzzyExercises('', {}, { custom });
    expect(browse.hits.length).toBeGreaterThan(600);
    expect(browse.didYouMean).toBeUndefined();
  });
});

// Phase 59 verify: atlas.json passes the validator (schema, limits, banned phrases, mesh and taxonomy ownership); counts printed.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-ignore plain .mjs script, no types
import * as v from '../../scripts/validate-atlas.mjs';

type Row = Record<string, unknown> & { muscleId: string; inDailyLife: string[]; whenWeak: string[]; quickFacts: string[]; seeAlso: string[]; meshKeys: string[] };
const validate = v.validateAtlas as (a: unknown, r: unknown) => { errors: string[]; counts: Record<string, number> };
const bannedHits = v.bannedHits as (s: string) => string[];
const { atlas, refs } = (v.loadAll as (root: string) => { atlas: Row[]; refs: unknown })(join(__dirname, '..', '..'));
const clone = (): Row[] => JSON.parse(JSON.stringify(atlas));

describe('atlas.json (real file)', () => {
  const res = validate(atlas, refs);
  it('has no validator errors', () => { expect(res.errors).toEqual([]); });
  it('matches the frozen counts and prints them', () => {
    console.log('atlas counts:', JSON.stringify(res.counts));
    expect(res.counts).toMatchObject({ rows: 39, model: 34, fitted: 5, meshKeysOwned: 74, meshKeysBodyparts3d: 69, meshKeysFitted: 5, taxonomyIds: 34, taxonomyDetailed: 28, taxonomyParent: 4, taxonomyNoContent: 2, unreviewed: 39 });
  });
  it('is not reviewed yet (owner or physio signs off)', () => { expect(atlas.every((a) => a.reviewed === false)).toBe(true); });
});

describe('validator catches broken files', () => {
  const errs = (mut: (a: Row[]) => void) => { const a = clone(); mut(a); return validate(a, refs).errors.join('\n'); };
  it('banned word, whole word only', () => {
    expect(errs((a) => { a[0]!.quickFacts[0] = 'This muscle can cure a stiff neck easily.'; })).toMatch(/banned word "cure"/);
    expect(bannedHits('A secure grip and a prefix')).toEqual([]);
    expect(bannedHits('It can HEAL and Treat things').sort()).toEqual(['heal', 'treat']);
    expect(bannedHits('Do four sets of reps')).toEqual(expect.arrayContaining(['sets', 'reps']));
  });
  it('length limits', () => {
    expect(errs((a) => { a[1]!.inDailyLife[0] = 'x'.repeat(71); })).toMatch(/inDailyLife\[0\] is 71 chars/);
    expect(errs((a) => { a[1]!.whenWeak[0] = 'short'; })).toMatch(/whenWeak\[0\] is 5 chars/);
    expect(errs((a) => { a[1]!.quickFacts = ['Only one fact here.']; })).toMatch(/quickFacts needs 2-3/);
    expect(errs((a) => { a[1]!.inDailyLife = a[1]!.inDailyLife.slice(0, 2); })).toMatch(/inDailyLife needs 3-5/);
  });
  it('700 char total', () => {
    expect(errs((a) => { a[2]!.inDailyLife = Array(5).fill('y'.repeat(70)); a[2]!.whenWeak = Array(3).fill('y'.repeat(90)); a[2]!.quickFacts = Array(3).fill('y'.repeat(90)); })).toMatch(/text totals/);
  });
  it('schema: missing and extra fields, reviewed, shape, group', () => {
    expect(errs((a) => { delete (a[0] as Record<string, unknown>).whenWeak; })).toMatch(/missing field whenWeak/);
    expect(errs((a) => { a[0]!.youtube = 'abc'; })).toMatch(/unknown field youtube/);
    expect(errs((a) => { a[0]!.reviewed = true; })).toMatch(/reviewed must stay false/);
    expect(errs((a) => { a[0]!.shape = 'weird'; })).toMatch(/shape must be/);
    expect(errs((a) => { a[0]!.group = 'Legs'; })).toMatch(/not one of the 13/);
  });
  it('ids and seeAlso', () => {
    expect(errs((a) => { a[3]!.seeAlso = ['nope']; })).toMatch(/seeAlso "nope" does not exist/);
    expect(errs((a) => { a[3]!.seeAlso = [a[3]!.muscleId]; })).toMatch(/lists itself/);
    expect(errs((a) => { a[3]!.seeAlso = ['a', 'b', 'c', 'd']; })).toMatch(/at most 3/);
    expect(errs((a) => { a[4]!.muscleId = a[3]!.muscleId; })).toMatch(/duplicate muscleId/);
  });
  it('mesh ownership: a missing, a doubled and a Skin row', () => {
    expect(errs((a) => { a.pop(); })).toMatch(/has no owner row/);
    expect(errs((a) => { a[0]!.meshKeys.push(a[1]!.meshKeys[0]!); })).toMatch(/also in/);
    expect(errs((a) => { a[0]!.meshKeys.push('Skin'); })).toMatch(/meshKeys differ|Skin/);
  });
  it('taxonomy ownership: a detailed id with no row', () => {
    expect(errs((a) => { a[0]!.taxonomyIds = []; })).toMatch(/taxonomy id "neck" has no owner row/);
  });
});

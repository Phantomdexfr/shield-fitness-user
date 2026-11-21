// Phase 9 verify: validator tests with broken fixtures (tiny in-test CSV set, not the real dataset).
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-ignore plain .mjs build script, no types
import * as compiler from '../../scripts/compile-dataset.mjs';

type Result = { errors: string[]; files: Record<string, string>; counts: Record<string, number>; report: { fallbackSlugs: string[] }; reviewCsv: string };
const compile = compiler.compile as (o: { csvDir: string; publicDir: string; contractVersion: string; expected?: Record<string, number> | null }) => Result;
const writeGenerated = compiler.writeGenerated as (dir: string, files: Record<string, string>) => void;

const MASTER_HEAD = 'name,slug,category,sub_category,also_warmup,movement_pattern,kind,machine_name,primary_muscles,secondary_muscles,rep_min,rep_max,unilateral,beginner_friendly,difficulty,track_fit,injury_cautions,variations,cues';
const VAR_FILES = [
  'exercise_variations.csv', 'new_exercises/added_variations_for_existing_exercises.csv', 'new_exercises/new_exercise_variations.csv',
  'new_exercises/cable_new_exercise_variations.csv', 'new_exercises/progression_variations.csv', 'new_exercises/variations_gap_fill_all_machines.csv',
];

function baseFixture(): Record<string, string> {
  const f: Record<string, string> = {
    'detailed_muscles/muscle_taxonomy_detailed.csv': [
      'id,name,parent_group,group,status,note,map_regions',
      'chest,Chest,chest,upper,core,,none', 'upper_chest,Upper Chest,chest,upper,proposed,,x',
      'lats,Lats,lats,upper,core,,x', 'biceps,Biceps,biceps,arms,core,,x',
    ].join('\n'),
    'detailed_muscles/html_unit_to_detailed.csv': 'unit_id,current_muscle,detailed_muscle_id,note\nmale_front:biceps:1,biceps,biceps,',
    'machines.csv': 'name,brand,category,zone,muscle_groups,quantity,weight_step_kg,setup_cues,status,image_slug\nBench Press Rig,Acme,strength_machine,,chest,1,2.5,Seat up;Pin in,active,bench-rig',
    'detailed_muscles/machines_detailed.csv': 'name,detailed_muscle_groups\nBench Press Rig,upper_chest',
    'media_manifest.csv': [
      'machine_slug,file,variant,order,is_primary,width,height,bytes,alt',
      'bench-rig,bench-rig-1.thumb.webp,thumb,1,yes,360,360,1,Rig thumb', 'bench-rig,bench-rig-1.detail.webp,detail,1,yes,960,960,1,Rig detail',
    ].join('\n'),
    'exercise_categories/exercise_categories_all.csv': [
      MASTER_HEAD,
      'A Press,a-press,compound,push,,push,strength,Bench Press Rig,chest,biceps,8.0,12.0,no,yes,1,beginner;strength,Careful,Flat or incline,Cue one;Cue two',
      'B Curl,b-curl,isolation,arms,yes,pull,strength,,biceps,,10.0,15.0,yes,no,2,muscle_gain,Careful,,Cue',
      'C Fly,c-fly,isolation,chest,,push,strength,,chest,lats,,,no,yes,1,cardio,Careful,,Cue',
    ].join('\n'),
    'detailed_muscles/exercise_muscle_map.csv': [
      'exercise,slug,muscle_id,role,emphasis,note',
      'A Press,a-press,upper_chest,primary,high,Clavicular', 'A Press,a-press,biceps,secondary,low,',
      'B Curl,b-curl,biceps,primary,high,',
    ].join('\n'),
    'detailed_muscles/variation_muscle_shift.csv': 'exercise,variation,muscle_id,shift,reason\nA Press,  incline   OR flat,upper_chest,more,why',
    'substitution_groups.csv': 'exercise,primary_muscle,alternatives,alt_count,note\nA Press,chest,B Curl;C Fly,2,',
    'superset_pairs.csv': 'exercise_a,exercise_b,pair_type,muscles\nA Press,B Curl,antagonist,chest/biceps',
    'setup_rules.csv': [
      'rule_id,keyword,axis,value,excludes,confidence,note',
      'r1,hammer grip,grip,hammer,,high,', 'r2,wide,width,wide,close|narrow,ambiguous,', 'r3,d handle,handle,d_handle,,high,', 'r4,incline,bench,incline,,high,',
    ].join('\n'),
    'setup_muscle_shift.csv': [
      'axis,value,applies_to,muscle_id,shift,physio_review,confidence,reason',
      'grip,hammer,curl,biceps,less,yes,low,x', 'bench,incline,press,upper_chest,more,yes,low,x',
    ].join('\n'),
    'machine_companions.csv': [
      'machine_name,kind,value,evidence,exercise_slug,label,note',
      'Bench Press Rig,bench,incline,data,,,', 'Bench Press Rig,attachment,rope,inferred,,,', 'Bench Press Rig,mode,grip:neutral,inferred,,Neutral grip,',
    ].join('\n'),
    'search_aliases.csv': ['alias,canonical,kind', 'db,dumbbell,abbreviation', 'bp,a press,exercise', 'hammer curlz,b curl,exercise'].join('\n'),
  };
  for (const v of VAR_FILES) f[v] = 'exercise,slug,variation';
  f[VAR_FILES[0]!] = ['exercise,slug,variation', 'A Press,a-press,Incline or flat', 'B Curl,b-curl,Hammer grip'].join('\n');
  f[VAR_FILES[3]!] = ['exercise,slug,variation', 'B Curl,b-curl,Wide grip on D handles'].join('\n');
  f[VAR_FILES[2]!] = ['exercise,slug,variation', 'A Press,a-press,incline or FLAT', 'C Fly,c-fly,Low to high'].join('\n');
  return f;
}

function build(mutate?: (f: Record<string, string>) => void, opts: { skipMediaFiles?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sf-ds-'));
  const csvDir = join(dir, 'csv');
  const publicDir = join(dir, 'machines');
  const f = baseFixture();
  mutate?.(f);
  for (const [rel, text] of Object.entries(f)) {
    const p = join(csvDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text + '\n');
  }
  if (!opts.skipMediaFiles) {
    mkdirSync(join(publicDir, 'bench-rig'), { recursive: true });
    for (const n of ['bench-rig-1.thumb.webp', 'bench-rig-1.detail.webp']) writeFileSync(join(publicDir, 'bench-rig', n), 'x');
  }
  return compile({ csvDir, publicDir, contractVersion: 'test-1', expected: null });
}

const sub = (f: Record<string, string>, key: string, from: string, to: string) => {
  expect(f[key]).toContain(from);
  f[key] = f[key]!.replace(from, to);
};
const MASTER = 'exercise_categories/exercise_categories_all.csv';

describe('compile-dataset: valid fixture', () => {
  const r = build();
  it('compiles with no errors and the expected counts', () => {
    expect(r.errors).toEqual([]);
    expect(r.counts).toMatchObject({ exercises: 3, machines: 1, muscles: 4, mapped: 2, fallback: 1, mapRows: 3, shiftRows: 1, mediaFiles: 2, detailChunks: 1 });
  });
  it('dedupes variations on trimmed, collapsed, lower-cased text (first wins) and joins the shift row', () => {
    expect(r.counts.variations).toBe(4);
    expect(r.counts.variationsDropped).toBe(1);
    const manifest = JSON.parse(r.files['dataset.manifest.json']!);
    const detail = JSON.parse(r.files[manifest.detailChunks[0].file]!);
    expect(detail['a-press'].variations).toEqual(['Incline or flat']);
    expect(detail['a-press'].repMin).toBe(8);
    expect(detail['c-fly'].repMin).toBeNull();
    expect(detail['a-press'].notes).toEqual({ upper_chest: 'Clavicular' });
    const shift = JSON.parse(r.files[manifest.files.variation_shift]!);
    expect(shift).toEqual({ 'a-press': { 'Incline or flat': [['upper_chest', 'm']] } });
  });
  it('expands the fallback: parent id becomes its children, primary wins over secondary', () => {
    const manifest = JSON.parse(r.files['dataset.manifest.json']!);
    const map = JSON.parse(r.files[manifest.files.muscle_map]!);
    expect(r.report.fallbackSlugs).toEqual(['c-fly']);
    expect(map['c-fly']).toEqual([['upper_chest', 'p', 'm', 1], ['lats', 's', 'l', 1]]);
    expect(map['a-press'][0]).toEqual(['upper_chest', 'p', 'h', 0]);
  });
  it('builds the index with sorted slugs, machine slug, bitmask tracks and chunk number', () => {
    const manifest = JSON.parse(r.files['dataset.manifest.json']!);
    const idx = JSON.parse(r.files[manifest.files['exercises.index']]!);
    expect(idx.rows.map((x: unknown[]) => x[0])).toEqual(['a-press', 'b-curl', 'c-fly']);
    const a = Object.fromEntries(idx.cols.map((c: string, i: number) => [c, idx.rows[0][i]]));
    expect(a).toMatchObject({ machine: 'bench-rig', primary: ['chest'], tracks: 1 + 32, warmup: 0, unilateral: 0, beginner: 1, chunk: 0 });
    expect(idx.rows[2][10]).toBe(64);
  });
  it('is idempotent: same CSVs give byte-identical files and file names carry the hash', () => {
    const again = build();
    expect(Object.keys(again.files)).toEqual(Object.keys(r.files));
    expect(again.files).toEqual(r.files);
    expect(Object.keys(r.files).every((n) => /\.[0-9a-f]{8}\.json$/.test(n) || n === 'dataset.manifest.json')).toBe(true);
  });
  it('writeGenerated replaces stale json files', () => {
    const out = mkdtempSync(join(tmpdir(), 'sf-out-'));
    writeFileSync(join(out, 'old.12345678.json'), '{}');
    writeGenerated(out, r.files);
    expect(readdirSync(out).sort()).toEqual(Object.keys(r.files).sort());
  });
});

const parsed = (r: Result, logical: string) => {
  const m = JSON.parse(r.files['dataset.manifest.json']!);
  return JSON.parse(r.files[m.files[logical]]!);
};

describe('compile-dataset: Phase 10 setup options, reach, search', () => {
  const r = build();
  it('compiles with no errors and reports the new counts', () => {
    expect(r.errors).toEqual([]);
    expect(r.counts).toMatchObject({ setupRules: 4, setupShiftRows: 2, companionRows: 3, aliasRows: 3, variationRowsTagged: 3, patternsAssigned: 3, searchDocs: 4 });
  });
  it('tags variation rows by keyword rules (whole words, trailing s ignored, excludes honoured)', () => {
    const o = parsed(r, 'setup_options');
    expect(o.exercises).toEqual({
      'a-press': { bench: ['incline'] },
      'b-curl': { grip: ['hammer'], width: ['wide'], handle: ['d_handle'] },
    });
    expect(o.patterns).toEqual({ 'a-press': 'press', 'b-curl': 'curl', 'c-fly': 'fly' });
    expect(o.shift.bench.incline.press).toEqual([['upper_chest', 'm']]);
    expect(o.shift.grip.hammer.curl).toEqual([['biceps', 'l']]);
  });
  it('an exclude phrase skips the rule', () => {
    const x = build((f) => { f[VAR_FILES[3]!] = 'exercise,slug,variation\nB Curl,b-curl,Narrow wide grip on D handles'; });
    expect(parsed(x, 'setup_options').exercises['b-curl'].width).toBeUndefined();
  });
  it('writes the ambiguous-rule rows to the review report', () => {
    expect(r.reviewCsv).toContain('b-curl,Wide grip on D handles,ambiguous_rule,r2');
  });
  it('computes machine reach: all, per bench/handle filter (setup shift applied), companions and modes', () => {
    const m = parsed(r, 'machine_reach');
    expect(m.muscles).toEqual(['biceps', 'upper_chest']);
    const rig = m.machines['bench-rig'];
    expect(rig.n).toBe(1);
    expect(rig.all).toEqual([['biceps', 0.3, 1], ['upper_chest', 1, 1]]);
    expect(rig.filters['bench:incline']).toEqual([['biceps', 0.3, 1], ['upper_chest', 1, 1]]);
    expect(rig.filters['handle:rope']).toEqual([]);
    expect(rig.bench).toEqual([['incline', 1]]);
    expect(rig.handle).toEqual([['rope', 0]]);
    expect(rig.modes).toEqual([['grip:neutral', null, 'Neutral grip', 0]]);
  });
  it('builds the search index: vocabulary, documents, alias expansion table, setup terms', () => {
    const si = parsed(r, 'search.index');
    expect(si.docs).toHaveLength(4);
    const word = (i: number) => si.vocab[i] as string;
    const aPress = si.docs.find((d: unknown[]) => d[1] === 'a-press');
    expect(aPress[0]).toBe('e');
    expect(aPress[2].map(word)).toEqual(['press']); // name; the one-letter token "a" is dropped
    expect(aPress[3].map(word)).toEqual(['bp']); // alias of the exercise
    expect(aPress[4].map(word)).toEqual(['bench', 'press', 'rig']); // machine
    expect(aPress[6].map(word)).toEqual(['incline']); // setup words
    expect(si.docs.find((d: unknown[]) => d[1] === 'bench-rig')[0]).toBe('m');
    expect(si.aliases[0][0]).toBe('hammer curlz'); // longest alias first
    expect(si.setupTerms).toContainEqual(['reverse', 'grip', 'reverse']);
    expect([...si.vocab]).toEqual([...si.vocab].sort());
  });
});

describe('compile-dataset: Phase 10 broken fixtures', () => {
  const cases: Array<[string, (f: Record<string, string>) => void, RegExp]> = [
    ['rule with an unknown axis value', (f) => sub(f, 'setup_rules.csv', 'grip,hammer,', 'grip,claw,'), /unknown value "claw" for axis grip/],
    ['rule with an unknown axis', (f) => sub(f, 'setup_rules.csv', ',width,wide,', ',girth,wide,'), /unknown axis "girth"/],
    ['duplicate rule id', (f) => sub(f, 'setup_rules.csv', 'r2,wide', 'r1,wide'), /duplicate rule_id "r1"/],
    ['shift row with an unknown pattern', (f) => sub(f, 'setup_muscle_shift.csv', ',curl,', ',squat,'), /unknown pattern "squat"/],
    ['shift row with an unknown muscle', (f) => sub(f, 'setup_muscle_shift.csv', ',biceps,less', ',bicepz,less'), /unknown muscle id "bicepz"/],
    ['shift row with an unknown setup value', (f) => sub(f, 'setup_muscle_shift.csv', 'bench,incline,', 'bench,sloped,'), /unknown axis or value/],
    ['companion machine does not resolve', (f) => sub(f, 'machine_companions.csv', 'Bench Press Rig,bench', 'Ghost Rig,bench'), /machine_name does not resolve/],
    ['companion bench value not in the vocabulary', (f) => sub(f, 'machine_companions.csv', 'bench,incline,data', 'bench,slanted,data'), /unknown bench value/],
    ['companion mode value not axis:value', (f) => sub(f, 'machine_companions.csv', 'grip:neutral', 'grip:sticky'), /axis:value/],
    ['alias loop through two aliases', (f) => { f['search_aliases.csv'] += '\nx1,y1 foo,exercise\ny1,x1 bar,exercise'; }, /alias loop/],
    ['alias that maps to itself', (f) => { f['search_aliases.csv'] += '\nSame,same,spelling'; }, /maps to itself/],
    ['duplicate alias', (f) => { f['search_aliases.csv'] += '\nDB,dumbbells,abbreviation'; }, /duplicate alias "db"/],
    ['unknown alias kind', (f) => sub(f, 'search_aliases.csv', 'abbreviation', 'slang'), /kind "slang"/],
    ['under 90% of grip/handle rows tagged', (f) => { f[VAR_FILES[3]!] += '\nB Curl,b-curl,Palms facing in'; }, /carry a setup tag/],
  ];
  for (const [name, mutate, re] of cases) {
    it(name, () => {
      const x = build(mutate);
      expect(x.errors.join('\n')).toMatch(re);
      expect(x.files).toEqual({});
    });
  }
  it('a self-contained alias group with one canonical is not a loop', () => {
    const x = build((f) => { f['search_aliases.csv'] += '\nrhomboid,rhomboids teres,muscle\nteres,rhomboids teres,muscle\nrhomboids,rhomboids teres,muscle'; });
    expect(x.errors).toEqual([]);
  });
});

describe('compile-dataset: shift join', () => {
  it('matches a shift row by normalised text', () => {
    const r = build((f) => sub(f, 'detailed_muscles/variation_muscle_shift.csv', '  incline   OR flat', ' INCLINE  or   flat '));
    expect(r.errors).toEqual([]);
    const m = JSON.parse(r.files['dataset.manifest.json']!);
    expect(JSON.parse(r.files[m.files.variation_shift]!)).toEqual({ 'a-press': { 'Incline or flat': [['upper_chest', 'm']] } });
  });
});

describe('compile-dataset: broken fixtures fail and write nothing', () => {
  const cases: Array<[string, (f: Record<string, string>) => void, RegExp, { skipMediaFiles?: boolean }?]> = [
    ['duplicate slug', (f) => sub(f, MASTER, 'b-curl', 'a-press'), /duplicate slug "a-press"/],
    ['slug not lower-kebab', (f) => sub(f, MASTER, 'b-curl', 'B_Curl'), /not lower-kebab/],
    ['machine_name does not resolve', (f) => sub(f, MASTER, 'Bench Press Rig', 'Ghost Machine'), /machine_name "Ghost Machine" does not resolve/],
    ['unknown muscle id in the master', (f) => sub(f, MASTER, ',biceps,,10.0', ',bicepz,,10.0'), /unknown muscle id "bicepz"/],
    ['unknown muscle id in the map', (f) => sub(f, 'detailed_muscles/exercise_muscle_map.csv', 'B Curl,b-curl,biceps', 'B Curl,b-curl,wings'), /unknown muscle id "wings"/],
    ['rep_min above rep_max', (f) => sub(f, MASTER, '8.0,12.0', '14.0,12.0'), /rep_min 14 > rep_max 12/],
    ['unknown track', (f) => sub(f, MASTER, 'beginner;strength', 'beginner;yoga'), /unknown track "yoga"/],
    ['machine without a primary detail image', (f) => sub(f, 'media_manifest.csv', 'detail,1,yes', 'detail,1,no'), /no primary detail image/],
    ['photo file missing on disk', () => {}, /file missing on disk/, { skipMediaFiles: true }],
    ['shift row does not match any variation', (f) => sub(f, 'detailed_muscles/variation_muscle_shift.csv', 'incline   OR flat', 'no such text'), /has no variation " *no such text"/],
    ['shift row exercise name unknown', (f) => sub(f, 'detailed_muscles/variation_muscle_shift.csv', 'A Press,', 'Z Press,'), /"Z Press" does not resolve/],
    ['substitution name does not resolve', (f) => sub(f, 'substitution_groups.csv', 'C Fly', 'Q Fly'), /"Q Fly" does not resolve/],
    ['superset name does not resolve', (f) => sub(f, 'superset_pairs.csv', 'B Curl', 'Q Curl'), /"Q Curl" does not resolve/],
    ['variation for an unknown slug', (f) => { f[VAR_FILES[1]!] += '\nGhost,ghost,Wide'; }, /slug "ghost" is not in the master list/],
    ['required column missing', (f) => sub(f, MASTER, 'track_fit', 'tracks_fit'), /missing column "track_fit"/],
  ];
  for (const [name, mutate, re, opts] of cases) {
    it(name, () => {
      const r = build(mutate, opts);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.join('\n')).toMatch(re);
      expect(r.files).toEqual({});
    });
  }
  it('count mismatch against the guide numbers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-ds-'));
    const f = baseFixture();
    for (const [rel, text] of Object.entries(f)) {
      mkdirSync(dirname(join(dir, 'csv', rel)), { recursive: true });
      writeFileSync(join(dir, 'csv', rel), text + '\n');
    }
    const r = compile({ csvDir: join(dir, 'csv'), publicDir: '', contractVersion: 't', expected: { exercises: 634 } });
    expect(r.errors).toEqual(['count mismatch for exercises: got 3, DATASET_GUIDE says 634']);
    expect(r.files).toEqual({});
  });
});

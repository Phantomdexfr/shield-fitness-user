import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  getDetailChunk,
  getManifest,
  getSearchIndex,
  imageUrls as loaderImageUrls,
  setDatasetSource,
  warmDetailChunks,
  type DatasetSource,
} from '../../src/dataset/loader';
import {
  byMachine,
  byMuscle,
  getExercise,
  imageUrls,
  musclesOf,
  resetQueryCache,
  search,
  variationsOf,
  type CustomExercise,
} from '../../src/dataset/query';
import { editDistance, normalizeText, tokenize } from '../../src/dataset/search';
import { customExercisesRepo, resetDb, setClock } from '../../src/data/local';
import { exercisesRepo } from '../../src/data/repos/exercises';

// ---------- trimmed fixture dataset ----------

const IDX_COLS = ['slug', 'name', 'category', 'sub_category', 'kind', 'machine', 'primary', 'difficulty', 'unilateral', 'beginner', 'tracks', 'warmup', 'chunk'];
const fixtureFiles: Record<string, unknown> = {
  'manifest.json': {
    contract: 'test',
    version: 'fixture',
    counts: {},
    files: {
      'exercises.index': 'index.json',
      muscles: 'muscles.json',
      machines: 'machines.json',
      media: 'media.json',
      muscle_map: 'map.json',
    },
    detailChunks: [
      { n: 0, count: 2, file: 'detail0.json' },
      { n: 1, count: 3, file: 'detail1.json' },
    ],
  },
  'index.json': {
    cols: IDX_COLS,
    rows: [
      ['barbell-bench-press', 'Barbell Bench Press', 'compound', 'press', 'strength', '', ['chest'], 2, 0, 0, 36, 0, 0],
      ['dumbbell-biceps-curl', 'Dumbbell Biceps Curl', 'isolation', 'curl', 'strength', '', ['biceps'], 1, 0, 1, 3, 0, 0],
      ['lat-pulldown', 'Lat Pulldown', 'compound', 'pull', 'strength', 'lat-pulldown', ['lats'], 1, 0, 1, 3, 0, 1],
      ['pec-deck-fly', 'Pec Deck Fly', 'isolation', 'fly', 'strength', 'pec-deck', ['chest'], 2, 0, 0, 4, 0, 1],
      ['wide-grip-lat-pulldown', 'Wide Grip Lat Pulldown', 'compound', 'pull', 'strength', 'lat-pulldown', ['lats'], 2, 0, 0, 36, 0, 1],
    ],
  },
  'muscles.json': {
    muscles: [
      { id: 'chest', name: 'Chest', parent: 'chest', group: 'upper', status: 'core', regions: '' },
      { id: 'upper_chest', name: 'Upper Chest', parent: 'chest', group: 'upper', status: 'core', regions: '' },
      { id: 'lats', name: 'Lats', parent: 'lats', group: 'upper', status: 'core', regions: '' },
      { id: 'biceps', name: 'Biceps', parent: 'biceps', group: 'arms', status: 'core', regions: '' },
    ],
    units: [],
  },
  'machines.json': {
    cols: ['slug', 'name', 'brand', 'category', 'zone', 'stepKg', 'quantity', 'status', 'cues', 'muscles', 'detailed'],
    rows: [
      ['lat-pulldown', 'Lat Pulldown', '', 'cable', null, null, 1, 'active', ['Sit tall'], ['lats'], ['lats']],
      ['pec-deck', 'Pec Deck', 'Acme', 'selectorised', null, null, 1, 'active', [], ['chest'], ['chest']],
    ],
  },
  'media.json': {
    'lat-pulldown': [
      { file: 'lat-pulldown-1.detail.webp', variant: 'detail', primary: true, w: 960, h: 960, alt: 'Lat pulldown' },
      { file: 'lat-pulldown-1.thumb.webp', variant: 'thumb', primary: true, w: 360, h: 360, alt: 'Lat pulldown' },
    ],
  },
  'map.json': {
    'barbell-bench-press': [['upper_chest', 'p', 'h', 0], ['biceps', 'm', 'l', 0]],
    'dumbbell-biceps-curl': [['biceps', 'p', 'h', 0]],
    'lat-pulldown': [['lats', 'p', 'h', 0], ['biceps', 's', 'm', 0]],
    'pec-deck-fly': [['chest', 'p', 'm', 0]],
    'wide-grip-lat-pulldown': [['lats', 'p', 'h', 0], ['biceps', 's', 'l', 0]],
  },
  'detail0.json': {
    'barbell-bench-press': { cues: ['Retract shoulder blades'], repMin: 5, repMax: 8, variations: ['Close grip', 'Paused'], hint: 'Close grip', cautions: '', tracks: [], pattern: 'press', notes: {} },
    'dumbbell-biceps-curl': { cues: [], repMin: 8, repMax: 12, variations: ['Hammer'], hint: '', cautions: '', tracks: [], pattern: 'curl', notes: {} },
  },
  'detail1.json': {
    'lat-pulldown': { cues: ['Pull to chin'], repMin: 8, repMax: 12, variations: ['Reverse grip'], hint: '', cautions: '', tracks: [], pattern: 'pulldown', notes: {} },
    'pec-deck-fly': { cues: [], repMin: 10, repMax: 15, variations: [], hint: '', cautions: '', tracks: [], pattern: 'fly', notes: {} },
    'wide-grip-lat-pulldown': { cues: [], repMin: 8, repMax: 12, variations: [], hint: '', cautions: '', tracks: [], pattern: 'pulldown', notes: {} },
  },
};

let calls: string[] = [];
let failOnce = new Set<string>();

function fixtureSource(): DatasetSource {
  return {
    async loadManifest() {
      calls.push('manifest.json');
      return fixtureFiles['manifest.json'] as never;
    },
    async loadFile(fileName) {
      calls.push(fileName);
      if (failOnce.has(fileName)) {
        failOnce.delete(fileName);
        throw new Error('network down');
      }
      const f = fixtureFiles[fileName];
      if (!f) throw new Error(`no fixture ${fileName}`);
      return f;
    },
  };
}

const count = (name: string): number => calls.filter((c) => c === name).length;
const slugs = (hits: Array<{ row: { slug: string } }>): string[] => hits.map((h) => h.row.slug);

beforeEach(async () => {
  calls = [];
  failOnce = new Set();
  setDatasetSource(fixtureSource());
  resetQueryCache();
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  let t = 1000;
  setClock(() => ++t);
});

describe('loader', () => {
  it('loads each chunk once, only the one an exercise needs, even for parallel asks', async () => {
    await Promise.all([getExercise('lat-pulldown'), getExercise('pec-deck-fly'), getExercise('lat-pulldown')]);
    expect(count('detail1.json')).toBe(1);
    expect(count('detail0.json')).toBe(0);
    expect(count('index.json')).toBe(1);
    expect(count('map.json')).toBe(1);
    expect(count('manifest.json')).toBe(1);
    await getExercise('lat-pulldown');
    expect(calls.length).toBe(new Set(calls).size); // nothing was fetched twice
    await getExercise('barbell-bench-press');
    expect(count('detail0.json')).toBe(1);
  });

  it('forgets a failed load so the next call retries', async () => {
    failOnce.add('detail1.json');
    await expect(getExercise('lat-pulldown')).rejects.toThrow('network down');
    const again = await getExercise('lat-pulldown');
    expect(again?.row.slug).toBe('lat-pulldown');
    expect(count('detail1.json')).toBe(2);
  });

  it('warms every detail chunk once', async () => {
    expect(await warmDetailChunks()).toBe(2);
    await warmDetailChunks();
    await getDetailChunk(0);
    expect(count('detail0.json')).toBe(1);
    expect(count('detail1.json')).toBe(1);
  });

  it('treats search.index as optional', async () => {
    expect((await getManifest()).files['search.index']).toBeUndefined();
    expect(await getSearchIndex()).toBeNull();
  });

  it('builds photo urls from the base path, and returns none for an unknown machine', async () => {
    const urls = await imageUrls('lat-pulldown');
    expect(urls.map((u) => u.url)).toEqual([
      '/machines/lat-pulldown/lat-pulldown-1.detail.webp',
      '/machines/lat-pulldown/lat-pulldown-1.thumb.webp',
    ]);
    expect(urls[1]?.variant).toBe('thumb');
    expect(await loaderImageUrls('nope')).toEqual([]);
  });
});

describe('missing slug', () => {
  it('returns undefined or empty and loads no detail chunk', async () => {
    expect(await getExercise('does-not-exist')).toBeUndefined();
    expect(await variationsOf('does-not-exist')).toEqual([]);
    expect(await musclesOf('does-not-exist')).toEqual([]);
    expect(await byMachine('no-machine')).toEqual([]);
    expect(await byMuscle('no_muscle')).toEqual([]);
    expect(count('detail0.json') + count('detail1.json')).toBe(0);
  });
});

describe('getExercise and variationsOf', () => {
  it('joins index row, detail and muscle rows', async () => {
    const e = await getExercise('barbell-bench-press');
    expect(e?.row.name).toBe('Barbell Bench Press');
    expect(e?.row.custom).toBe(false);
    expect(e?.detail.cues).toEqual(['Retract shoulder blades']);
    expect(e?.muscles[0]).toEqual(['upper_chest', 'p', 'h', 0]);
    expect(await variationsOf('barbell-bench-press')).toEqual(['Close grip', 'Paused']);
  });
});

describe('search', () => {
  it('ranks the shorter, closer name first and keeps ties deterministic', async () => {
    const hits = await search('lat pulldown');
    expect(slugs(hits)).toEqual(['lat-pulldown', 'wide-grip-lat-pulldown']);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(slugs(await search('lat pulldown'))).toEqual(slugs(hits));
  });

  it('matches prefixes, typos and transpositions', async () => {
    expect(slugs(await search('bicep cur'))).toEqual(['dumbbell-biceps-curl']);
    expect(slugs(await search('pulldwn'))).toContain('lat-pulldown');
    expect(slugs(await search('pulldonw'))).toContain('lat-pulldown');
    expect(slugs(await search('latt pulldown'))).toContain('lat-pulldown');
  });

  it('needs every query token to match', async () => {
    expect(await search('lat zzzzzzz')).toEqual([]);
  });

  it('finds by machine and muscle words', async () => {
    expect(slugs(await search('pec'))).toEqual(['pec-deck-fly']);
    expect(slugs(await search('chest'))).toEqual(expect.arrayContaining(['barbell-bench-press', 'pec-deck-fly']));
  });

  it('empty query browses A to Z and filters stack', async () => {
    expect(slugs(await search(''))).toEqual([
      'barbell-bench-press',
      'dumbbell-biceps-curl',
      'lat-pulldown',
      'pec-deck-fly',
      'wide-grip-lat-pulldown',
    ]);
    expect(slugs(await search('', { machine: 'lat-pulldown' }))).toEqual(['lat-pulldown', 'wide-grip-lat-pulldown']);
    expect(slugs(await search('', { beginner: true }))).toEqual(['dumbbell-biceps-curl', 'lat-pulldown']);
    expect(slugs(await search('', { track: 'strength' }))).toEqual(['barbell-bench-press', 'wide-grip-lat-pulldown']);
    expect(slugs(await search('', { category: 'isolation', difficulty: 2 }))).toEqual(['pec-deck-fly']);
    expect(slugs(await search('', { kind: 'cardio' }))).toEqual([]);
    // a muscle filter expands a core id to its children (upper_chest -> chest)
    expect(slugs(await search('', { muscle: 'chest' }))).toEqual(['barbell-bench-press', 'pec-deck-fly']);
    expect(slugs(await search('pulldown', { muscle: 'lats', beginner: true }))).toEqual(['lat-pulldown']);
  });
});

describe('byMuscle and byMachine', () => {
  it('orders by weight and leaves out mobility-only rows', async () => {
    const chest = await byMuscle('chest');
    expect(chest.map((h) => [h.row.slug, h.weight])).toEqual([
      ['barbell-bench-press', 1],
      ['pec-deck-fly', 0.6],
    ]);
    const biceps = await byMuscle('biceps');
    expect(biceps.map((h) => h.row.slug)).toEqual(['dumbbell-biceps-curl', 'lat-pulldown', 'wide-grip-lat-pulldown']);
    expect(biceps.map((h) => h.weight)).toEqual([1, 0.6, 0.3]);
  });

  it('lists a machine\'s exercises A to Z', async () => {
    expect((await byMachine('lat-pulldown')).map((r) => r.slug)).toEqual(['lat-pulldown', 'wide-grip-lat-pulldown']);
  });
});

describe('custom exercises merge at query time', () => {
  const mine: CustomExercise = {
    id: 'c1',
    name: 'Cable Hammer Curl',
    slug: 'my-cable-hammer-curl',
    kind: 'strength',
    machineSlug: 'lat-pulldown',
    muscles: [
      { id: 'biceps', role: 'primary', emphasis: 'high' },
      { id: 'lats', role: 'stabiliser', emphasis: 'medium' },
    ],
    repMin: 8,
    repMax: 12,
  };

  it('shows up in get, search, byMuscle, byMachine and musclesOf, and stays out without the option', async () => {
    const opts = { custom: [mine] };
    const e = await getExercise('my-cable-hammer-curl', opts);
    expect(e?.row.custom).toBe(true);
    expect(e?.detail.repMax).toBe(12);
    expect(e?.muscles).toEqual([['biceps', 'p', 'h', 0], ['lats', 't', 'm', 0]]);
    expect(slugs(await search('hammer curl', {}, opts))).toEqual(['my-cable-hammer-curl']);
    expect((await byMuscle('biceps', opts)).map((h) => h.row.slug)).toContain('my-cable-hammer-curl');
    expect((await byMachine('lat-pulldown', opts)).map((r) => r.slug)).toContain('my-cable-hammer-curl');
    expect(await musclesOf('my-cable-hammer-curl', opts)).toHaveLength(2);

    expect(await getExercise('my-cable-hammer-curl')).toBeUndefined();
    expect(await search('hammer curl')).toEqual([]);
    expect(count('detail0.json') + count('detail1.json')).toBe(0); // custom needs no chunk
  });

  it('rebuilds when the custom list changes and ignores bad or shadowing rows', async () => {
    expect(slugs(await search('hammer', {}, { custom: [mine] }))).toEqual(['my-cable-hammer-curl']);
    const renamed = { ...mine, name: 'Rope Tricep Pushdown' };
    expect(await search('hammer', {}, { custom: [renamed] })).toEqual([]);
    expect(slugs(await search('rope pushdown', {}, { custom: [renamed] }))).toEqual(['my-cable-hammer-curl']);

    const shadow: CustomExercise = { ...mine, slug: 'lat-pulldown', name: 'Impostor' };
    const bad = { ...mine, slug: '', name: 'No slug' } as CustomExercise;
    const hits = await search('', {}, { custom: [shadow, bad] });
    expect(hits).toHaveLength(5);
    expect((await getExercise('lat-pulldown', { custom: [shadow] }))?.row.name).toBe('Lat Pulldown');
  });
});

describe('exercises repo (custom exercises from IndexedDB)', () => {
  it('merges stored custom exercises and hides a deleted one', async () => {
    const saved = await customExercisesRepo.put({
      name: 'Landmine Press',
      slug: 'my-landmine-press',
      kind: 'strength',
      machineSlug: null,
      muscles: [{ id: 'chest', role: 'primary', emphasis: 'medium' }],
      repMin: 6,
      repMax: 10,
    });
    expect(slugs(await exercisesRepo.search('landmine'))).toEqual(['my-landmine-press']);
    expect((await exercisesRepo.get('my-landmine-press'))?.row.custom).toBe(true);
    expect((await exercisesRepo.byMuscle('chest')).map((h) => h.row.slug)).toContain('my-landmine-press');
    expect((await exercisesRepo.get('lat-pulldown'))?.detail.cues).toEqual(['Pull to chin']);

    await customExercisesRepo.remove(saved.client_id);
    expect(await exercisesRepo.get('my-landmine-press')).toBeUndefined();
    expect(await exercisesRepo.search('landmine')).toEqual([]);
  });
});

describe('search helpers', () => {
  it('normalises like the compiler and tokenises', () => {
    expect(normalizeText('Crème  Brûlée-Press!')).toBe('creme brulee press');
    expect(tokenize('A 1 Lat-Pulldown')).toEqual(['1', 'lat', 'pulldown']);
  });
  it('counts a transposition as one edit and stops early above the limit', () => {
    expect(editDistance('pulldown', 'pulldonw', 2)).toBe(1);
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2);
  });
});

describe('bundled source (real generated files, one smoke check)', () => {
  it('loads the real manifest and one real exercise through the Vite glob', async () => {
    setDatasetSource(); // back to the bundled files
    resetQueryCache();
    const m = await getManifest();
    expect(m.counts.exercises).toBe(634);
    const e = await getExercise('ab-wheel-rollout');
    expect(e?.row.name).toBe('Ab Wheel Rollout');
    expect(e?.detail.cues.length).toBeGreaterThan(0);
    expect((await search('ab wheel')).length).toBeGreaterThan(0);
  });
});

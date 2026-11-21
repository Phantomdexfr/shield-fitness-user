import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, test } from 'vitest';
import { applyPicked, draftFromStored, EMPTY_DRAFT, isDuplicateName, nameKey, pickerEmphasis, setMuscle, toggleMuscle, validateCustom, validateYoutubeUrl, type CustomContext, type CustomDraft } from '../../src/shared/customExercise';
import { customSlug } from '../../src/shared/slug';
import { rowsToWeights } from '../../src/shared/weights';
import { deleteCustom, getCustom, saveCustom } from '../../src/data/repos/customExercises';
import { exercisesRepo } from '../../src/data/repos/exercises';
import { resetDb } from '../../src/data/local';

beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

const ctx = (o: Partial<CustomContext> = {}): CustomContext => ({
  takenNames: ['Barbell Bench Press'],
  takenSlugs: ['barbell-bench-press'],
  hasMachine: (s) => s === 'lat-pulldown',
  hasMuscle: (id) => ['chest', 'triceps', 'front_delts'].includes(id),
  makeSlug: customSlug,
  ...o,
});
const draft = (o: Partial<CustomDraft> = {}): CustomDraft => ({
  ...EMPTY_DRAFT,
  name: 'Landmine Press',
  muscles: [{ id: 'chest', role: 'primary', emphasis: 'high' }],
  ...o,
});

describe('validators: name, rep range, URL', () => {
  test('name: empty, too long, duplicate of the dataset (ignoring case and punctuation) or of your own', () => {
    expect(validateCustom(draft({ name: '   ' }), ctx())).toMatchObject({ ok: false, errors: { name: 'name_empty' } });
    expect(validateCustom(draft({ name: 'x'.repeat(61) }), ctx())).toMatchObject({ ok: false, errors: { name: 'name_too_long' } });
    expect(validateCustom(draft({ name: 'barbell  BENCH press!' }), ctx())).toMatchObject({ ok: false, errors: { name: 'name_taken' } });
    expect(validateCustom(draft({ name: 'My Curl' }), ctx({ takenNames: ['my curl'] }))).toMatchObject({ ok: false, errors: { name: 'name_taken' } });
    expect(nameKey('  Café  Curl ')).toBe('cafe curl');
    expect(isDuplicateName('', ['a'])).toBe(false);
  });

  test('rep range: whole numbers from 1, first not above second', () => {
    expect(validateCustom(draft({ repMin: 0 }), ctx())).toMatchObject({ ok: false, errors: { reps: 'reps_invalid' } });
    expect(validateCustom(draft({ repMin: 3.5 }), ctx())).toMatchObject({ ok: false, errors: { reps: 'reps_invalid' } });
    expect(validateCustom(draft({ repMin: 12, repMax: 8 }), ctx())).toMatchObject({ ok: false, errors: { reps: 'range_order' } });
    const ok = validateCustom(draft({ repMin: 6, repMax: 6 }), ctx());
    expect(ok.ok && ok.value).toMatchObject({ repMin: 6, repMax: 6 });
  });

  test('URL: empty is fine; https and a YouTube host only; no script, data, http or other sites', () => {
    expect(validateYoutubeUrl('')).toEqual({ ok: true, value: '' });
    expect(validateYoutubeUrl('  https://youtu.be/abc123  ')).toEqual({ ok: true, value: 'https://youtu.be/abc123' });
    expect(validateYoutubeUrl('https://www.youtube.com/watch?v=abc')).toMatchObject({ ok: true });
    expect(validateYoutubeUrl('http://youtu.be/abc')).toEqual({ ok: false, error: 'url_not_https' });
    expect(validateYoutubeUrl('javascript:alert(1)')).toEqual({ ok: false, error: 'url_not_https' });
    expect(validateYoutubeUrl('data:text/html,hi')).toEqual({ ok: false, error: 'url_not_https' });
    expect(validateYoutubeUrl('https://example.com/video')).toEqual({ ok: false, error: 'url_not_youtube' });
    expect(validateYoutubeUrl('https://youtube.com.evil.com/x')).toEqual({ ok: false, error: 'url_not_youtube' });
    expect(validateYoutubeUrl('https://user:pw@youtu.be/x')).toEqual({ ok: false, error: 'url_invalid' });
    expect(validateYoutubeUrl('not a link')).toEqual({ ok: false, error: 'url_invalid' });
    expect(validateCustom(draft({ youtube: 'http://youtu.be/abc' }), ctx())).toMatchObject({ ok: false, errors: { youtube: 'url_not_https' } });
  });

  test('muscles, machine, notes, kind; a good form saves cleaned values with a my- slug', () => {
    expect(validateCustom(draft({ muscles: [] }), ctx())).toMatchObject({ ok: false, errors: { muscles: 'muscle_primary_needed' } });
    expect(validateCustom(draft({ muscles: [{ id: 'chest', role: 'secondary', emphasis: 'low' }] }), ctx())).toMatchObject({ ok: false, errors: { muscles: 'muscle_primary_needed' } });
    expect(validateCustom(draft({ muscles: [{ id: 'wings', role: 'primary', emphasis: 'high' }] }), ctx())).toMatchObject({ ok: false, errors: { muscles: 'muscle_unknown' } });
    const twice = { id: 'chest', role: 'primary', emphasis: 'high' } as const;
    expect(validateCustom(draft({ muscles: [twice, twice] }), ctx())).toMatchObject({ ok: false, errors: { muscles: 'muscle_twice' } });
    expect(validateCustom(draft({ machineSlug: 'nope' }), ctx())).toMatchObject({ ok: false, errors: { machine: 'machine_unknown' } });
    expect(validateCustom(draft({ notes: 'n'.repeat(501) }), ctx())).toMatchObject({ ok: false, errors: { notes: 'notes_too_long' } });
    expect(validateCustom({ ...draft(), kind: 'magic' as never }, ctx())).toMatchObject({ ok: false, errors: { kind: 'kind_invalid' } });
    const r = validateCustom(draft({ name: '  Landmine   Press ', machineSlug: 'lat-pulldown', notes: ' keep elbow in ', youtube: 'https://youtu.be/x', patternId: 'horizontal_press', param: 'bench_deg=30' }), ctx());
    expect(r).toMatchObject({ ok: true, value: { name: 'Landmine Press', slug: 'my-landmine-press', machineSlug: 'lat-pulldown', notes: 'keep elbow in', youtubeUrl: 'https://youtu.be/x', patternId: 'horizontal_press', param: 'bench_deg=30' } });
  });

  test('an unknown pattern is dropped; editing keeps the slug', () => {
    const r = validateCustom(draft({ patternId: 'nope', param: 'a=b' }), ctx({ hasPattern: () => false, slug: 'my-old-name' }));
    expect(r.ok && r.value.slug).toBe('my-old-name');
    expect(r.ok && 'patternId' in r.value).toBe(false);
  });
});

describe('muscle list from the Body Picker', () => {
  test('first tap is main/high, later taps helper/medium; tap again removes; settings survive other taps', () => {
    let l = toggleMuscle([], 'chest');
    l = toggleMuscle(l, 'triceps');
    expect(l).toEqual([
      { id: 'chest', role: 'primary', emphasis: 'high' },
      { id: 'triceps', role: 'secondary', emphasis: 'medium' },
    ]);
    l = setMuscle(l, 'triceps', { emphasis: 'low' });
    expect(applyPicked(l, ['chest', 'triceps', 'front_delts']).map((m) => m.id)).toEqual(['chest', 'triceps', 'front_delts']);
    expect(applyPicked(l, ['chest', 'triceps', 'front_delts'])[1]!.emphasis).toBe('low');
    expect(applyPicked(l, ['triceps']).map((m) => m.id)).toEqual(['triceps']);
    expect(pickerEmphasis([...l, { id: 'front_delts', role: 'stabiliser', emphasis: 'low' }])).toEqual({ chest: 'primary', triceps: 'secondary', front_delts: 'secondary' });
  });

  test('draftFromStored fills defaults for a thin or missing row', () => {
    expect(draftFromStored(undefined)).toMatchObject({ name: '', kind: 'strength', machineSlug: '', muscles: [] });
    expect(draftFromStored({ name: 'A', machineSlug: null, youtubeUrl: 'https://youtu.be/x' })).toMatchObject({ name: 'A', machineSlug: '', youtube: 'https://youtu.be/x', repMin: 8, repMax: 12 });
  });
});

describe('saving merges into the library queries (real dataset + fake-indexeddb)', () => {
  const mine = (o: Partial<CustomDraft> = {}): CustomDraft =>
    draft({
      name: 'Landmine Press',
      machineSlug: 'lat-pulldown',
      muscles: [
        { id: 'chest', role: 'primary', emphasis: 'high' },
        { id: 'triceps', role: 'secondary', emphasis: 'medium' },
        { id: 'front_delts', role: 'stabiliser', emphasis: 'low' },
      ],
      ...o,
    });

  test('search, byMuscle, byMachine and get find it; the dataset is untouched', async () => {
    const r = await saveCustom(mine());
    expect(r).toEqual({ ok: true, slug: 'my-landmine-press' });
    const hit = (await exercisesRepo.search('landmine')).find((h) => h.row.slug === 'my-landmine-press');
    expect(hit).toBeTruthy();
    expect((await exercisesRepo.fuzzy('landmine pres')).hits.some((h) => h.row.slug === 'my-landmine-press')).toBe(true);
    expect((await exercisesRepo.byMuscle('chest')).some((h) => h.row.slug === 'my-landmine-press')).toBe(true);
    expect((await exercisesRepo.byMachine('lat-pulldown')).some((x) => x.slug === 'my-landmine-press')).toBe(true);
    expect((await exercisesRepo.get('my-landmine-press'))?.row.custom).toBe(true);
    expect((await exercisesRepo.get('barbell-bench-press'))?.row.custom).toBeFalsy();
  });

  test('muscle weight of a custom exercise follows the chosen role and emphasis', async () => {
    await saveCustom(mine());
    const w = rowsToWeights(await exercisesRepo.musclesOf('my-landmine-press'));
    expect(w.chest).toBeCloseTo(1, 6);
    expect(w.triceps).toBeCloseTo(0.6, 6);
    expect(w.front_delts).toBeCloseTo(0.15, 6);
    expect(w.quads).toBeUndefined();
  });

  test('duplicate-name guard: dataset names, your own, and a name that was deleted can be used again', async () => {
    expect(await saveCustom(mine({ name: 'Barbell Bench Press' }))).toMatchObject({ ok: false, errors: { name: 'name_taken' } });
    await saveCustom(mine());
    expect(await saveCustom(mine({ name: 'landmine  press' }))).toMatchObject({ ok: false, errors: { name: 'name_taken' } });
    expect(await deleteCustom('my-landmine-press')).toBe(true);
    expect((await exercisesRepo.search('landmine')).some((h) => h.row.slug === 'my-landmine-press')).toBe(false);
    expect(await getCustom('my-landmine-press')).toBeUndefined();
    expect(await saveCustom(mine())).toEqual({ ok: true, slug: 'my-landmine-press' });
  });

  test('edit keeps the slug and the row, may keep its own name, and updates what queries see', async () => {
    await saveCustom(mine());
    const before = await getCustom('my-landmine-press');
    const r = await saveCustom(mine({ name: 'Landmine Press', repMin: 5, repMax: 8, notes: 'slow' }), 'my-landmine-press');
    expect(r).toEqual({ ok: true, slug: 'my-landmine-press' });
    const after = await getCustom('my-landmine-press');
    expect(after?.client_id).toBe(before?.client_id);
    expect(after).toMatchObject({ repMin: 5, repMax: 8, notes: 'slow' });
    expect((await exercisesRepo.get('my-landmine-press'))?.detail).toMatchObject({ repMin: 5, repMax: 8 });
    const renamed = await saveCustom(mine({ name: 'Landmine Push' }), 'my-landmine-press');
    expect(renamed).toEqual({ ok: true, slug: 'my-landmine-press' });
    expect(await saveCustom(mine(), 'my-missing')).toMatchObject({ ok: false });
  });

  test('a second exercise with a similar name gets its own slug', async () => {
    await saveCustom(mine());
    await saveCustom(mine({ name: 'Landmine-Press 2' }));
    expect((await getCustom('my-landmine-press-2'))?.name).toBe('Landmine-Press 2');
  });
});

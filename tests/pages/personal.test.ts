import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, test } from 'vitest';
import { applyPersonal, cleanNote, goTos, hiddenSlugs, NOTE_MAX, parsePersonal, withoutHidden, favouriteSlugs, EMPTY_PERSONAL } from '../../src/shared/personal';
import { easierHarder } from '../../src/pages/exercise/exerciseModel';
import { getPersonal, loadPersonal, setFavourite, setHidden, setNote } from '../../src/data/repos/personal';
import { exercisesRepo } from '../../src/data/repos/exercises';
import { loadExercisePage } from '../../src/data/repos/exercisePage';
import { loadLabData } from '../../src/data/repos/lab';
import { favouritesRepo, resetDb } from '../../src/data/local';
import { labList, toCandidate, type LabRow } from '../../src/pages/body/labData';
import { buildTaxonomy } from '../../src/shared/muscles';
import type { MapRow } from '../../src/dataset/loader';

beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

describe('easier / harder selection', () => {
  const f = (slug: string, difficulty: number, o: Record<string, unknown> = {}) => ({
    slug, name: slug, category: 'compound', subCategory: 'press', primary: ['chest'], difficulty, custom: false, ...o,
  });
  const family = [f('a', 1), f('b', 2), f('c', 3), f('d', 3, { primary: ['quads'] }), f('e', 1, { category: 'isolation' }), f('f', 1, { custom: true })];

  test('nearest difficulty in the same family, never itself, custom, other category or other muscle', () => {
    const r = easierHarder(f('b', 2), family);
    expect(r.easier?.slug).toBe('a');
    expect(r.harder?.slug).toBe('c');
    expect(easierHarder(f('a', 1), family).easier).toBeUndefined();
    expect(easierHarder(f('c', 3), family).harder).toBeUndefined();
  });

  test('a closer step beats a farther one; ties go to the name that sorts first', () => {
    const all = [f('x', 1), f('y', 2), f('me', 3), f('zz', 3), f('p', 4), f('q', 4)];
    expect(easierHarder(f('me', 3), all).easier?.slug).toBe('y');
    // two harder candidates at the same distance: 'p' before 'q'
    expect(easierHarder(f('me', 3), all).harder?.slug).toBe('p');
  });

  test('a hidden exercise is never offered; the next one is', () => {
    const all = [f('x', 1), f('y', 2), f('me', 3), f('p', 4), f('q', 5)];
    expect(easierHarder(f('me', 3), all).easier?.slug).toBe('y');
    expect(easierHarder(f('me', 3), all, new Set(['y'])).easier?.slug).toBe('x');
    expect(easierHarder(f('me', 3), all, new Set(['p'])).harder?.slug).toBe('q');
    expect(easierHarder(f('me', 3), all, new Set(['p', 'q'])).harder).toBeUndefined();
  });
});

describe('personal rules (pure)', () => {
  test('note: trimmed, line breaks kept, empty ok, over the limit is an error', () => {
    expect(cleanNote('  keep elbows in\r\nslow down  ')).toEqual({ ok: true, value: 'keep elbows in\nslow down' });
    expect(cleanNote('   ')).toEqual({ ok: true, value: '' });
    expect(cleanNote('x'.repeat(NOTE_MAX))).toMatchObject({ ok: true });
    expect(cleanNote('x'.repeat(NOTE_MAX + 1))).toEqual({ ok: false, error: 'too_long' });
  });

  test('favourite and hidden never both stay on; the one just set wins', () => {
    const fav = applyPersonal(undefined, { favourite: true });
    expect(fav).toEqual({ favourite: true, hidden: false, note: '' });
    expect(applyPersonal(fav, { hidden: true })).toEqual({ favourite: false, hidden: true, note: '' });
    expect(applyPersonal({ favourite: false, hidden: true, note: 'n' }, { favourite: true })).toEqual({ favourite: true, hidden: false, note: 'n' });
    expect(applyPersonal(fav, { note: 'hi' }).favourite).toBe(true);
  });

  test('parse: legacy {slug} row is a favourite; bad rows and empty rows are ignored', () => {
    const m = parsePersonal([{ slug: 'a' }, { slug: 'b', hidden: true, favourite: true }, { slug: 'c', note: 'x' }, { slug: 'd', favourite: false }, { nope: 1 }, null, 'x', { slug: '' }]);
    expect([...m.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(m.get('a')?.favourite).toBe(true);
    expect(m.get('b')).toEqual({ favourite: false, hidden: true, note: '' });
    expect(m.get('c')).toEqual({ favourite: false, hidden: false, note: 'x' });
  });

  test('go-tos: favourites only, not hidden, A to Z, unknown slugs skipped; withoutHidden filters lists', () => {
    const m = parsePersonal([{ slug: 'z-row', favourite: true }, { slug: 'a-curl', favourite: true }, { slug: 'gone', favourite: true }, { slug: 'h', hidden: true }, { slug: 'n', note: 'x' }]);
    const names: Record<string, string> = { 'z-row': 'Z Row', 'a-curl': 'A Curl', h: 'H', n: 'N' };
    expect(goTos(m, (s) => names[s])).toEqual([{ slug: 'a-curl', name: 'A Curl' }, { slug: 'z-row', name: 'Z Row' }]);
    expect([...favouriteSlugs(m)].sort()).toEqual(['a-curl', 'gone', 'z-row']);
    expect([...hiddenSlugs(m)]).toEqual(['h']);
    expect(withoutHidden([{ slug: 'a' }, { slug: 'h' }], hiddenSlugs(m)).map((x) => x.slug)).toEqual(['a']);
    expect(withoutHidden([{ slug: 'a' }], new Set())).toEqual([{ slug: 'a' }]);
  });
});

describe('personal repo (fake-indexeddb)', () => {
  test('favourite, hide and note are stored per exercise and survive a re-read', async () => {
    await setFavourite('barbell-bench-press', true);
    await setNote('barbell-bench-press', ' pause on the chest ');
    await setHidden('ab-wheel-wall-rollout', true);
    const m = await loadPersonal();
    expect(m.get('barbell-bench-press')).toEqual({ favourite: true, hidden: false, note: 'pause on the chest' });
    expect(m.get('ab-wheel-wall-rollout')).toEqual({ favourite: false, hidden: true, note: '' });
    // one row per exercise
    expect((await favouritesRepo.list()).map((r) => r.client_id).sort()).toEqual(['ex:ab-wheel-wall-rollout', 'ex:barbell-bench-press']);
  });

  test('clearing everything removes the row; hiding a favourite clears the favourite', async () => {
    await setFavourite('a', true);
    expect((await setHidden('a', true)).favourite).toBe(false);
    await setHidden('a', false);
    expect(await getPersonal('a')).toEqual(EMPTY_PERSONAL);
    expect(await favouritesRepo.list()).toHaveLength(0);
  });

  test('a note over the limit is refused and nothing is saved', async () => {
    const r = await setNote('a', 'x'.repeat(NOTE_MAX + 1));
    expect(r).toEqual({ ok: false, error: 'too_long' });
    expect((await favouritesRepo.list()).length).toBe(0);
    expect(await setNote('a', 'ok')).toMatchObject({ ok: true });
    expect(await setNote('a', '')).toMatchObject({ ok: true, personal: EMPTY_PERSONAL });
    expect((await favouritesRepo.list()).length).toBe(0);
  });
});

describe('hidden exercises: out of suggestions and easier/harder, still readable', () => {
  const tax = buildTaxonomy([{ id: 'chest', parent: 'chest' }, { id: 'upper_chest', parent: 'chest' }]);
  const row = (slug: string): LabRow => ({ slug, name: slug, category: 'compound', kind: 'strength', machine: '', difficulty: 2, unilateral: false, beginner: false, tracks: 0 });
  const chest: MapRow[] = [['upper_chest', 'p', 'h', 0]];

  test('the muscle list drops a hidden exercise from every section', () => {
    const cands = ['one', 'two', 'three'].map((s) => toCandidate(row(s), chest));
    const all = (l: ReturnType<typeof labList>) => [...l.suggested, ...l.built, ...l.more].map((x) => x.slug).sort();
    expect(all(labList(cands, 'chest', tax, '2026-11-19', {}))).toEqual(['one', 'three', 'two']);
    expect(all(labList(cands, 'chest', tax, '2026-11-19', { hidden: new Set(['two']) }))).toEqual(['one', 'three']);
  });

  test('the lab loader passes favourites and hidden from the stored rows', async () => {
    await setFavourite('barbell-bench-press', true);
    await setHidden('ab-wheel-wall-rollout', true);
    const lab = await loadLabData();
    expect(lab.person.favourites?.has('barbell-bench-press')).toBe(true);
    expect(lab.person.hidden?.has('ab-wheel-wall-rollout')).toBe(true);
    expect(lab.person.favourites?.has('ab-wheel-wall-rollout')).toBe(false);
  });

  test('a hidden exercise is still found by slug (history, exercise page) and the page carries the user state', async () => {
    const slug = 'ab-wheel-wall-rollout';
    await setHidden(slug, true);
    await setNote(slug, 'go slow');
    expect((await exercisesRepo.get(slug))?.row.slug).toBe(slug);
    const page = await loadExercisePage(slug);
    expect(page?.personal).toEqual({ favourite: false, hidden: true, note: 'go slow' });
  });

  test('a hidden exercise is not offered as easier, harder or a substitute on another page', async () => {
    const slug = 'ab-wheel-wall-rollout';
    const before = await loadExercisePage(slug);
    const offered = [before?.easier?.slug, before?.harder?.slug, ...(before?.substitutes.map((s) => s.slug) ?? [])].filter((s): s is string => !!s);
    expect(offered.length).toBeGreaterThan(0);
    for (const s of offered) await setHidden(s, true);
    const after = await loadExercisePage(slug);
    const now = [after?.easier?.slug, after?.harder?.slug, ...(after?.substitutes.map((s) => s.slug) ?? [])];
    for (const s of offered) expect(now).not.toContain(s);
  });
});

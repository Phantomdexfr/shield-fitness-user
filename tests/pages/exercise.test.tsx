// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { existsSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { Route, Router } from 'wouter-preact';
import { memoryLocation } from 'wouter-preact/memory-location';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  bodyEmphasis, buildCueCard, cardPhoto, cleanLink, difficultyDots, easierHarder, galleryPhotos, groupMuscles, hasContested, repRangeText,
  resolveYoutubeUrl, toggleVariation, variationAdds, youtubeSearchUrl,
} from '../../src/pages/exercise/exerciseModel';
import { FormCueCard } from '../../src/pages/exercise/FormCueCard';
import ExercisePage from '../../src/pages/exercise/ExercisePage';
import MachinePage from '../../src/pages/exercise/MachinePage';
import { getChosenVariation, loadExercisePage } from '../../src/data/repos/exercisePage';
import { resetDb } from '../../src/data/local';
import { imageUrls } from '../../src/dataset/loader';
import type { ImageUrl, MapRow } from '../../src/dataset/loader';

describe('YouTube URL builder', () => {
  test('search url: name + "exercise form", words joined by +', () => {
    expect(youtubeSearchUrl('Lat Pulldown')).toBe('https://www.youtube.com/results?search_query=Lat+Pulldown+exercise+form');
  });
  test('encodes &, #, %, accents and brackets; collapses spaces', () => {
    const u = youtubeSearchUrl('  Curl  &  Press (45%) #1 Café ');
    expect(u).toBe('https://www.youtube.com/results?search_query=Curl+%26+Press+(45%25)+%231+Caf%C3%A9+exercise+form');
    expect(new URL(u).searchParams.get('search_query')).toBe('Curl & Press (45%) #1 Café exercise form');
  });
  test('policy override wins over the user link, which wins over the search', () => {
    const o = { policy: 'https://example.org/gym-video', custom: 'https://youtu.be/abc' };
    expect(resolveYoutubeUrl('Squat', o)).toBe('https://example.org/gym-video');
    expect(resolveYoutubeUrl('Squat', { custom: 'https://youtu.be/abc' })).toBe('https://youtu.be/abc');
    expect(resolveYoutubeUrl('Squat')).toBe(youtubeSearchUrl('Squat'));
  });
  test('bad overrides are ignored (never a script or data url)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'youtube.com/x', '', '   ', null, undefined, 'https://']) {
      expect(cleanLink(bad as string)).toBeUndefined();
      expect(resolveYoutubeUrl('Row', { policy: bad as string, custom: bad as string })).toBe(youtubeSearchUrl('Row'));
    }
  });
});

describe('photo url resolution', () => {
  const u = (file: string, variant: 'thumb' | 'detail', primary: boolean): ImageUrl => ({ url: `/machines/m/${file}`, variant, primary, w: 1, h: 1, alt: `alt ${file}` });
  const set = [u('m-2.thumb.webp', 'thumb', false), u('m-2.detail.webp', 'detail', false), u('m-1.thumb.webp', 'thumb', true), u('m-1.detail.webp', 'detail', true),
    u('m-3.thumb.webp', 'thumb', false), u('m-4.thumb.webp', 'thumb', false), u('m-5.thumb.webp', 'thumb', false)];
  test('primary first, at most 4 angles, detail paired by name, thumb when no detail', () => {
    const g = galleryPhotos(set);
    expect(g.map((p) => p.thumb)).toEqual(['/machines/m/m-1.thumb.webp', '/machines/m/m-2.thumb.webp', '/machines/m/m-3.thumb.webp', '/machines/m/m-4.thumb.webp']);
    expect(g[0]?.detail).toBe('/machines/m/m-1.detail.webp');
    expect(g[2]?.detail).toBe('/machines/m/m-3.thumb.webp');
    expect(galleryPhotos([])).toEqual([]);
  });
  test('card photo: primary thumb, else any thumb, else first', () => {
    expect(cardPhoto(set)).toBe('/machines/m/m-1.thumb.webp');
    expect(cardPhoto([u('a.detail.webp', 'detail', true)])).toBe('/machines/m/a.detail.webp');
    expect(cardPhoto([])).toBeUndefined();
  });
  test('real manifest: urls start at the base path and every listed file exists in public/', async () => {
    for (const slug of ['ab-wheel', 'adjustable-bench', 'assisted-pull-up-dip-machine']) {
      const urls = await imageUrls(slug);
      expect(urls.length).toBeGreaterThan(0);
      for (const x of urls) {
        expect(x.url.startsWith(`/machines/${slug}/`)).toBe(true);
        expect(existsSync(`public${x.url}`)).toBe(true);
      }
      expect(galleryPhotos(urls).length).toBeGreaterThan(0);
    }
    expect(await imageUrls('no-such-machine')).toEqual([]);
  });
});

describe('exercise model', () => {
  const rows: MapRow[] = [['lats', 'p', 'm', 0], ['upper_back', 'p', 'h', 0], ['biceps', 's', 'l', 0], ['core', 't', 'm', 0], ['neck', 'm', 'h', 0], ['lats', 's', 'h', 0]];
  test('groups by role, strongest first, mobility left out, a muscle listed once under its strongest role', () => {
    const g = groupMuscles(rows);
    expect(g.primary.map((x) => x.id)).toEqual(['upper_back', 'lats']);
    expect(g.secondary.map((x) => x.id)).toEqual(['biceps']);
    expect(g.stabiliser.map((x) => x.id)).toEqual(['core']);
    expect(bodyEmphasis(g)).toEqual({ core: 'secondary', biceps: 'secondary', upper_back: 'primary', lats: 'primary' });
  });
  test('"contested" notes flag the muscle (evidence is mixed)', () => {
    const g = groupMuscles([['biceps', 'p', 'h', 0], ['lats', 's', 'm', 0]], { biceps: 'Long-head emphasis is contested' });
    expect(g.primary[0]?.contested).toBe(true);
    expect(g.secondary[0]?.contested).toBe(false);
    expect(hasContested(g)).toBe(true);
    expect(hasContested(groupMuscles(rows))).toBe(false);
  });
  test('difficulty dots clamp to 1-3', () => {
    expect(difficultyDots(2)).toEqual([true, true, false]);
    expect(difficultyDots(0)).toEqual([true, false, false]);
    expect(difficultyDots(9)).toEqual([true, true, true]);
  });
  test('easier / harder: same family, nearest difficulty, never itself or custom', () => {
    const f = (slug: string, difficulty: number, o: Record<string, unknown> = {}) => ({ slug, name: slug, category: 'compound', subCategory: 'press', primary: ['chest'], difficulty, custom: false, ...o });
    const all = [f('a', 1), f('b', 2), f('c', 3), f('d', 3, { primary: ['quads'] }), f('e', 1, { category: 'isolation' }), f('f', 1, { custom: true })];
    const r = easierHarder(f('b', 2), all);
    expect(r.easier?.slug).toBe('a');
    expect(r.harder?.slug).toBe('c');
    expect(easierHarder(f('a', 1), all).easier).toBeUndefined();
  });
  test('variations: adds list and tap-again clears', () => {
    expect(variationAdds({ 'Wall rollout': [['abs', 'l']] }, 'Wall rollout')).toEqual([{ id: 'abs', emphasis: 'l' }]);
    expect(variationAdds(undefined, 'x')).toEqual([]);
    expect(toggleVariation(undefined, 'a')).toBe('a');
    expect(toggleVariation('a', 'a')).toBeUndefined();
    expect(toggleVariation('a', 'b')).toBe('b');
  });
  test('form cue card: 3 cues + 1 mistake; no mistake when no caution', () => {
    const c = buildCueCard(['1', '2', '3', '4'], 'Do not sag');
    expect(c.slides.map((s) => s.kind)).toEqual(['cue', 'cue', 'cue', 'mistake']);
    expect(buildCueCard(['only'], '  ').slides).toHaveLength(1);
    expect(buildCueCard([], '').slides).toHaveLength(0);
  });
  test('rep range text', () => {
    expect(repRangeText(8, 12)).toBe('8-12');
    expect(repRangeText(10, 10)).toBe('10');
    expect(repRangeText(null, null)).toBe('');
  });
});

// ---------- accessibility (happy-dom has no layout; the 360 px overflow check is a browser check) ----------

let root: HTMLElement;
beforeEach(async () => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  await resetDb();
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => act(() => render(null, root)));

const settle = async () => {
  for (let i = 0; i < 40; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
};
const mountAt = async (path: string, ui: ComponentChild, route: string) => {
  const { hook } = memoryLocation({ path });
  await act(async () => render(<Router hook={hook}><Route path={route}>{ui}</Route></Router>, root));
  await settle();
};
const nameOf = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();

describe('a11y', () => {
  test('form cue card: labelled region, focusable swipe track, named dismiss that fires', async () => {
    let gone = 0;
    await act(async () => render(<FormCueCard card={buildCueCard(['a', 'b', 'c'], 'Mistake')} onDismiss={() => (gone += 1)} />, root));
    expect(root.querySelector('section')?.getAttribute('aria-label')).toBeTruthy();
    const track = root.querySelector('[role="group"]')!;
    expect(track.getAttribute('tabindex')).toBe('0');
    expect(track.getAttribute('aria-label')).toBeTruthy();
    expect(root.querySelectorAll('li')).toHaveLength(4);
    await act(async () => (root.querySelector('button') as HTMLButtonElement).click());
    expect(gone).toBe(1);
    await act(async () => render(<FormCueCard card={{ slides: [] }} onDismiss={() => undefined} />, root));
    expect(root.innerHTML).toBe('');
  });

  test('exercise page: one h1, everything named, chips pressed-state, YouTube link opens a new tab safely, variation is stored', async () => {
    const slug = 'ab-wheel-wall-rollout';
    const d = await loadExercisePage(slug);
    expect(d?.row.slug).toBe(slug);
    await mountAt(`/exercise/${slug}`, <ExercisePage />, '/exercise/:slug');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    for (const el of root.querySelectorAll('button, a')) expect(nameOf(el), el.outerHTML.slice(0, 80)).not.toBe('');
    for (const el of root.querySelectorAll('[role="img"]')) expect(el.getAttribute('aria-label')).toBeTruthy();
    const yt = [...root.querySelectorAll('a')].find((a) => a.getAttribute('href')?.startsWith('https://www.youtube.com/results'))!;
    expect(yt.getAttribute('target')).toBe('_blank');
    expect(yt.getAttribute('rel')).toContain('noopener');
    expect(decodeURIComponent(yt.getAttribute('href')!.replace(/\+/g, ' '))).toContain(d!.row.name);
    const chips = [...root.querySelectorAll('.sf-ex__vars button')] as HTMLButtonElement[];
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => chips[0]!.click());
    await settle();
    expect((root.querySelectorAll('.sf-ex__vars button')[0] as HTMLElement).getAttribute('aria-pressed')).toBe('true');
    expect(await getChosenVariation(slug)).toBe(d!.detail.variations[0]);
  });

  test('exercise page: unknown slug shows a notice with a way back', async () => {
    await mountAt('/exercise/nope', <ExercisePage />, '/exercise/:slug');
    expect(root.querySelector('.sf-empty')).not.toBeNull();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
  });

  test('machine page: one h1, labelled gallery buttons, exercises link to their pages', async () => {
    await mountAt('/machine/ab-wheel', <MachinePage />, '/machine/:slug');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    const g = root.querySelectorAll('.sf-ex__gbtn');
    expect(g.length).toBeGreaterThan(0);
    for (const b of g) expect(b.getAttribute('aria-label')).toBeTruthy();
    const links = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(links.some((h) => h.includes('/exercise/ab-wheel'))).toBe(true);
    await mountAt('/machine/nope', <MachinePage />, '/machine/:slug');
    expect(root.querySelector('.sf-empty')).not.toBeNull();
  });
});

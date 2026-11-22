// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { Route, Router } from 'wouter-preact';
import { memoryLocation } from 'wouter-preact/memory-location';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  addedBySetup, chooseOnAxis, cleanSetup, isDefaultSetup, itemFields, offeredAxes, parseSetupData, prKey, setupEffect, setupFromSearch, setupWeights,
  type SetupData,
} from '../../src/pages/exercise/setupModel';
import { SetupPicker } from '../../src/ui/setup/SetupPicker';
import ExercisePage from '../../src/pages/exercise/ExercisePage';
import { getChosenSetup, getSeparatePrPerGrip, loadExercisePage, setChosenSetup, setSeparatePrPerGrip } from '../../src/data/repos/exercisePage';
import { exercisesRepo } from '../../src/data/repos/exercises';
import { getSetupOptions, getVariationShift } from '../../src/dataset/loader';
import { resetDb } from '../../src/data/local';
import type { Setup } from '../../src/shared/setup';

/** Phase 90: sections start closed (Collapsible), so open every bar before looking inside. */
async function openAll(root: Element): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const bars = [...root.querySelectorAll('button.sf-sec__bar[aria-expanded="false"]')] as HTMLElement[];
    if (bars.length === 0) return;
    await act(async () => { for (const b of bars) b.click(); });
  }
}


let data: SetupData;
beforeEach(async () => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  await resetDb();
  data = parseSetupData(await getSetupOptions())!;
});

describe('setup model', () => {
  test('the real file parses; garbage gives null', () => {
    expect(data).not.toBeNull();
    expect(Object.keys(data.exercises).length).toBeGreaterThan(100);
    for (const bad of [null, undefined, 3, 'x', {}, { exercises: {} }]) expect(parseSetupData(bad)).toBeNull();
  });
  test('offeredAxes: UI order, only offered axes, vocabulary order, unknowns dropped', () => {
    expect(offeredAxes(data.exercises['lat-pulldown']).map((a) => a.axis)).toEqual(['grip', 'width', 'handle', 'position', 'arms']);
    const odd = offeredAxes({ handle: ['rope', 'nonsense', 'straight_bar'], grip: [], bench: ['flat'] } as never);
    expect(odd).toEqual([{ axis: 'handle', values: ['straight_bar', 'rope'] }, { axis: 'bench', values: ['flat'] }]);
    expect(offeredAxes(undefined)).toEqual([]);
  });
  test('cleanSetup drops what the exercise does not offer', () => {
    const offer = data.exercises['lat-pulldown'];
    expect(cleanSetup({ grip: 'supinated', bench: 'flat', width: 'wide' }, offer)).toEqual({ grip: 'supinated', width: 'wide' });
    expect(cleanSetup({ grip: 'hammer' }, { grip: ['pronated'] })).toEqual({});
    expect(cleanSetup(undefined, offer)).toEqual({});
  });
  test('choose, replace on the same axis, and tap again to clear', () => {
    let s: Setup = {};
    s = chooseOnAxis(s, 'grip', 'supinated');
    expect(s).toEqual({ grip: 'supinated' });
    s = chooseOnAxis(s, 'grip', 'neutral');
    expect(s).toEqual({ grip: 'neutral' });
    s = chooseOnAxis(s, 'grip', 'neutral');
    expect(isDefaultSetup(s)).toBe(true);
  });
  test('library chip url', () => {
    expect(setupFromSearch('?setup=grip:reverse')).toEqual({ grip: 'reverse' });
    expect(setupFromSearch('setup=nope:x')).toEqual({});
    expect(setupFromSearch('')).toEqual({});
  });
  test('default when none chosen: weights equal the plain exercise weights', async () => {
    const full = (await exercisesRepo.get('lat-pulldown'))!;
    const shift = (await getVariationShift())['lat-pulldown'] ?? {};
    const plain = setupWeights(full.muscles, undefined, shift, null, 'lat-pulldown', {});
    expect(setupWeights(full.muscles, undefined, shift, data, 'lat-pulldown', {})).toEqual(plain);
    expect(setupWeights(full.muscles, undefined, shift, data, 'lat-pulldown', undefined)).toEqual(plain);
  });
  test('underhand (supinated) changes the logged muscle weights: more biceps', async () => {
    const full = (await exercisesRepo.get('lat-pulldown'))!;
    const shift = (await getVariationShift())['lat-pulldown'] ?? {};
    const base = setupWeights(full.muscles, undefined, shift, data, 'lat-pulldown', {});
    const under = setupWeights(full.muscles, undefined, shift, data, 'lat-pulldown', { grip: 'supinated' });
    expect(under).not.toEqual(base);
    expect(under['biceps']!).toBeGreaterThan(base['biceps'] ?? 0);
    const e = setupEffect(base, under);
    expect(e.more).toContain('biceps');
    expect([...e.more, ...e.less].length).toBeGreaterThan(0);
    for (const w of Object.values(under)) expect(w).toBeLessThanOrEqual(1);
    expect(Array.isArray(addedBySetup(base, under))).toBe(true);
  });
  test('the item stores the setup; the default stores none', () => {
    expect(itemFields('lat-pulldown', 'Wide', { grip: 'supinated' })).toEqual({ exercise: 'lat-pulldown', variation: 'Wide', setup: { grip: 'supinated' } });
    expect(itemFields('lat-pulldown', undefined, {})).toEqual({ exercise: 'lat-pulldown' });
    const s: Setup = { grip: 'supinated' };
    expect(itemFields('x', undefined, s).setup).not.toBe(s);
  });
  test('PR key: shared by default, split by grip when asked', () => {
    expect(prKey('lat-pulldown', { grip: 'supinated' }, false)).toBe('lat-pulldown');
    expect(prKey('lat-pulldown', { grip: 'supinated' }, true)).toBe('lat-pulldown#grip:supinated');
    expect(prKey('lat-pulldown', {}, true)).toBe('lat-pulldown');
  });
});

describe('setup prefs', () => {
  test('remembers the last setup per exercise; the page data cleans values the exercise does not offer', async () => {
    expect(await getChosenSetup('lat-pulldown')).toEqual({});
    await setChosenSetup('lat-pulldown', { grip: 'supinated', bench: 'flat' });
    expect(await getChosenSetup('lat-pulldown')).toEqual({ grip: 'supinated', bench: 'flat' });
    expect((await loadExercisePage('lat-pulldown'))?.setup).toEqual({ grip: 'supinated' });
    expect(await getChosenSetup('other-exercise')).toEqual({});
  });
});

let root: HTMLElement;
beforeEach(() => {
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

describe('SetupPicker a11y', () => {
  test('one labelled group per offered axis, pressed state, choose / clear / reset', async () => {
    let value: Setup = {};
    const offer = { grip: ['pronated', 'supinated'], handle: ['rope'] };
    const draw = () => act(() => render(<SetupPicker offer={offer} value={value} onChange={(n) => { value = n; draw(); }} />, root));
    await draw();
    const groups = [...root.querySelectorAll('[role="group"]')];
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Grip', 'Handle']);
    expect(root.querySelectorAll('button[aria-pressed]')).toHaveLength(3);
    expect(root.textContent).not.toContain('Width');
    expect(root.textContent).not.toContain('Back to the usual setup');
    await act(async () => ([...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Supinated')) as HTMLButtonElement).click());
    expect(value).toEqual({ grip: 'supinated' });
    expect(root.textContent).toContain('Back to the usual setup');
    await act(async () => ([...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Supinated')) as HTMLButtonElement).click());
    expect(value).toEqual({});
    await act(async () => ([...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Rope')) as HTMLButtonElement).click());
    await act(async () => ([...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Back to the usual')) as HTMLButtonElement).click());
    expect(value).toEqual({});
  });
  test('renders nothing when the exercise offers no setup', async () => {
    await act(async () => render(<SetupPicker offer={undefined} value={{}} onChange={() => undefined} />, root));
    expect(root.innerHTML).toBe('');
  });
});

describe('exercise page + setup', () => {
  test('choosing underhand shows the effect, is remembered, and loads back', async () => {
    await mountAt('/exercise/lat-pulldown', <ExercisePage />, '/exercise/:slug');
    await openAll(root);
    const sec = root.querySelector('.sf-ex__effect')!.closest('section')!;
    expect(sec).not.toBeNull();
    expect(sec.querySelector('.sf-ex__effect')?.textContent).toContain('Nothing shifts');
    await act(async () => ([...sec.querySelectorAll('button')].find((b) => b.textContent?.includes('Supinated')) as HTMLButtonElement).click());
    await settle();
    expect(root.querySelector('.sf-ex__effect')?.textContent).toContain('Tends to emphasise');
    expect(root.querySelector('.sf-ex__effect')?.textContent).toContain('Biceps');
    expect(await getChosenSetup('lat-pulldown')).toEqual({ grip: 'supinated' });
    const again = await loadExercisePage('lat-pulldown');
    expect(again?.setup).toEqual({ grip: 'supinated' });
  });
  test('an exercise that offers nothing shows no setup section', async () => {
    const some = Object.keys(data.exercises).find((s) => offeredAxes(data.exercises[s]).length === 0);
    const slug = some ?? 'no-such-exercise-with-setup';
    await mountAt(`/exercise/${slug}`, <ExercisePage />, '/exercise/:slug');
    expect(root.querySelector('section[aria-label="Setup"]')).toBeNull();
  });
});

describe('separate PRs per grip pref', () => {
  test('default off, can be switched on and back', async () => {
    expect(await getSeparatePrPerGrip()).toBe(false);
    await setSeparatePrPerGrip(true);
    expect(await getSeparatePrPerGrip()).toBe(true);
    await setSeparatePrPerGrip(false);
    expect(await getSeparatePrPerGrip()).toBe(false);
  });
});

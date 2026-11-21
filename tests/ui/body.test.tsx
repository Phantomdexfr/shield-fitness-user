// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BodyPicker, MuscleChips, expand, loadFigure, parentOf, tierOf, viewsOf, MUSCLE_IDS, type BodyPickerProps, type Sex, type View } from '../../src/ui/body';
import { t, type StringKey } from '../../src/i18n';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  act(() => render(null, root));
  vi.useRealTimers();
});

const mount = (v: ComponentChild) => act(() => render(v, root));
const SEXES: Sex[] = ['male', 'female'];
const VIEWS: View[] = ['front', 'back'];

async function picker(p: Partial<BodyPickerProps> & Pick<BodyPickerProps, 'mode'>) {
  await loadFigure(p.sex ?? 'male', p.view ?? 'front');
  mount(<BodyPicker sex="male" view="front" {...p} />);
}
const region = (unit: string) => root.querySelector<SVGElement>(`[data-unit="${unit}"][role="button"], path.sf-body__u[data-unit="${unit}"]`)!;
const fire = (el: Element, type: string, init: Record<string, unknown> = {}) =>
  act(() => {
    el.dispatchEvent(type === 'keydown' ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }) : new MouseEvent(type, { bubbles: true, clientX: 0, clientY: 0, ...init }));
  });
const click = (el: Element) => {
  fire(el, 'pointerdown');
  fire(el, 'pointerup');
};

describe('figure data', () => {
  test('every figure unit appears once in the CSV and every CSV row in a figure (124 = 124)', async () => {
    const csv = readFileSync('contract/dataset/detailed_muscles/html_unit_to_detailed.csv', 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(','));
    const ids: string[] = [];
    for (const s of SEXES) for (const v of VIEWS) {
      const f = await loadFigure(s, v);
      expect(f.units.length).toBe(31);
      for (const u of f.units) {
        ids.push(u.id);
        expect(csv.find((r) => r[0] === u.id)?.[2]).toBe(u.muscle);
      }
    }
    expect(new Set(ids).size).toBe(124);
    expect(csv.length).toBe(124);
  });

  test('every region has a real name (no missing i18n key)', async () => {
    for (const s of SEXES) for (const v of VIEWS) for (const u of (await loadFigure(s, v)).units) {
      const key = `muscle.${u.muscle}`;
      expect(t(key as StringKey)).not.toBe(key);
    }
    for (const id of MUSCLE_IDS) expect(t(`muscle.${id}` as StringKey)).not.toBe(`muscle.${id}`);
  });
});

describe('taxonomy helpers', () => {
  test('expand, parent, tier, views', () => {
    expect(expand('chest').sort()).toEqual(['chest', 'lower_chest', 'upper_chest']);
    expect(expand('nope')).toEqual([]);
    expect(parentOf('upper_chest')).toBe('chest');
    expect(parentOf('biceps')).toBe('biceps');
    expect(tierOf('chest')).toBe('clear');
    expect(tierOf('upper_chest')).toBe('approx');
    expect(tierOf('neck')).toBe('approx');
    expect(tierOf('soleus')).toBe('list');
    expect(tierOf('cardio')).toBe('sys');
    expect(viewsOf('lats')).toEqual(['back']);
    expect(viewsOf('triceps')).toEqual(['back', 'front']);
  });
});

describe('BodyPicker', () => {
  test('every rendered region is a named, focusable button; one tab stop per muscle', async () => {
    await picker({ mode: 'pick-many' });
    const buttons = [...root.querySelectorAll('path.sf-body__u')];
    expect(buttons.length).toBe(31);
    for (const b of buttons) {
      expect(b.getAttribute('role')).toBe('button');
      expect(b.getAttribute('aria-label')).toBeTruthy();
      expect(b.getAttribute('aria-label')).not.toMatch(/^muscle\./);
    }
    const stops = buttons.filter((b) => b.getAttribute('tabindex') === '0').map((b) => b.getAttribute('data-m'));
    expect(new Set(stops).size).toBe(stops.length);
    expect(root.querySelector('path.sf-body__u[data-unit="male_front:upper_chest:1"]')!.getAttribute('aria-label')).toContain('approximate region');
  });

  test('pick-many toggles, pick-one replaces', async () => {
    const onChange = vi.fn();
    await picker({ mode: 'pick-many', value: ['biceps'], onChange });
    click(region('male_front:abs:1'));
    expect(onChange).toHaveBeenLastCalledWith(['biceps', 'abs']);
    click(region('male_front:biceps:1'));
    expect(onChange).toHaveBeenLastCalledWith([]);
    const one = vi.fn();
    await picker({ mode: 'pick-one', value: ['biceps'], onChange: one });
    click(region('male_front:abs:1'));
    expect(one).toHaveBeenLastCalledWith(['abs']);
  });

  test('selected value (including a parent id) gets the selected class and aria state', async () => {
    await picker({ mode: 'pick-many', value: ['chest'] });
    expect(region('male_front:upper_chest:1').classList.contains('sf-body__u--sel')).toBe(true);
    expect(region('male_front:lower_chest:2').classList.contains('sf-body__u--sel')).toBe(true);
    expect(region('male_front:abs:1').classList.contains('sf-body__u--sel')).toBe(false);
    expect(region('male_front:upper_chest:1').getAttribute('aria-pressed')).toBe('true');
    expect(region('male_front:upper_chest:1').getAttribute('aria-label')).toContain('selected');
  });

  test('heat bands render band classes and spoken value; parents roll down to children', async () => {
    await picker({ mode: 'heat', heat: { biceps: 3, chest: 5, abs: 0 } });
    expect(region('male_front:biceps:1').classList.contains('sf-body__u--heat-3')).toBe(true);
    expect(region('male_front:upper_chest:1').classList.contains('sf-body__u--heat-5')).toBe(true);
    expect(region('male_front:abs:1').classList.contains('sf-body__u--heat-0')).toBe(true);
    expect(region('male_front:biceps:1').getAttribute('aria-label')).toContain('heat 3 of 5');
  });

  test('recovery, marks and emphasis classes; marks win over selected', async () => {
    await picker({ mode: 'marks', value: ['biceps'], recovery: { quads: 'fatigued' }, marks: { biceps: 'avoid', abs: 'sore' }, emphasis: { forearms: 'primary', calves: 'secondary' } });
    expect(region('male_front:quads:1').classList.contains('sf-body__u--rec-fatigued')).toBe(true);
    expect(region('male_front:biceps:1').classList.contains('sf-body__u--avoid')).toBe(true);
    expect(region('male_front:abs:1').classList.contains('sf-body__u--sore')).toBe(true);
    expect(region('male_front:forearms:1').classList.contains('sf-body__u--pri')).toBe(true);
    expect(region('male_front:calves:1').classList.contains('sf-body__u--sec')).toBe(true);
  });

  test('keyboard: Enter and Space select; arrows move focus; Escape clears pick-one', async () => {
    const onChange = vi.fn();
    await picker({ mode: 'pick-one', value: ['abs'], onChange });
    const abs = region('male_front:abs:1');
    act(() => abs.focus());
    fire(abs, 'keydown', { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith([]);
    fire(abs, 'keydown', { key: ' ' });
    expect(onChange).toHaveBeenCalledTimes(2);
    fire(abs, 'keydown', { key: 'ArrowRight' });
    expect(document.activeElement).not.toBe(abs);
    fire(abs, 'keydown', { key: 'Escape' });
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('non-pick modes call onSelect and never onChange', async () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    await picker({ mode: 'heat', heat: {}, onSelect, onChange });
    click(region('male_front:abs:1'));
    expect(onSelect).toHaveBeenCalledWith('abs');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('swipe rule: horizontal > 60 px and > 1.5x vertical switches view; short or diagonal does not', async () => {
    const onViewChange = vi.fn();
    const onChange = vi.fn();
    await picker({ mode: 'pick-many', onViewChange, onChange });
    const svg = root.querySelector('svg')!;
    fire(svg, 'pointerdown', { clientX: 0, clientY: 0 });
    fire(svg, 'pointerup', { clientX: 90, clientY: 20 });
    expect(onViewChange).toHaveBeenCalledWith('back');
    fire(svg, 'pointerdown', { clientX: 0, clientY: 0 });
    fire(svg, 'pointerup', { clientX: 90, clientY: 80 });
    fire(svg, 'pointerdown', { clientX: 0, clientY: 0 });
    fire(svg, 'pointerup', { clientX: 40, clientY: 0 });
    expect(onViewChange).toHaveBeenCalledTimes(1);
  });

  test('long press selects the whole group (parent id)', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    await picker({ mode: 'pick-many', onChange });
    const el = region('male_front:upper_chest:1');
    fire(el, 'pointerdown');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fire(el, 'pointerup');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['chest']);
  });

  test('mini size is read-only: no buttons, no toggles, no events', async () => {
    const onChange = vi.fn();
    await picker({ mode: 'view', size: 'mini', onChange, emphasis: { biceps: 'primary' } });
    expect(root.querySelector('[role="button"]')).toBeNull();
    expect(root.querySelector('.sf-body__bar')).toBeNull();
    expect(root.querySelector('.sf-body__hit')).toBeNull();
    click(region('male_front:biceps:1'));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('every region has an invisible companion hit path; unknown ids are ignored', async () => {
    await picker({ mode: 'heat', heat: { not_a_muscle: 5 } as never, value: ['nope'] });
    expect(root.querySelectorAll('path.sf-body__hit').length).toBe(31);
  });

  test('the other sex loads on demand and the zoom button toggles', async () => {
    await picker({ mode: 'pick-many', sex: 'female', view: 'back' });
    expect(root.querySelector('svg')!.getAttribute('data-sex')).toBe('female');
    const zoomBtn = [...root.querySelectorAll('button')].find((b) => b.textContent === t('body.zoom.in'))!;
    fire(zoomBtn, 'click');
    expect(root.querySelector('.sf-body--zoom')).not.toBeNull();
  });
});

describe('MuscleChips (text twin)', () => {
  test('lists all 34 muscles grouped, each with a tier label; search filters', () => {
    mount(<MuscleChips mode="pick-many" />);
    expect(root.querySelectorAll('.sf-chips__row').length).toBe(34);
    expect(root.textContent).toContain(t('body.tier.list'));
    const input = root.querySelector('input')!;
    act(() => {
      input.value = 'delts';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const names = [...root.querySelectorAll('.sf-chips__name')].map((n) => n.textContent);
    expect(names).toEqual(expect.arrayContaining(['Front Delts', 'Side Delts', 'Rear Delts']));
    expect(names.length).toBe(3);
    act(() => {
      input.value = 'zzzz';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(root.textContent).toContain(t('body.chips.empty'));
  });

  test('same selection and same state classes as the figure; click toggles; heat shows the band', () => {
    const onChange = vi.fn();
    mount(<MuscleChips mode="pick-many" value={['chest']} onChange={onChange} />);
    expect(root.querySelector('[data-m="upper_chest"]')!.getAttribute('aria-pressed')).toBe('true');
    fire(root.querySelector('[data-m="abs"]')!, 'click');
    expect(onChange).toHaveBeenCalledWith(['chest', 'abs']);
    mount(<MuscleChips mode="heat" heat={{ biceps: 4 }} />);
    expect(root.querySelector('[data-m="biceps"]')!.querySelector('.sf-chips__meta')!.textContent).toBe('4');
    expect(root.querySelector('[data-m="biceps"]')!.className).toContain('sf-chips__row--heat-4');
  });
});

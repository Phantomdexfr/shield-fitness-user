// @vitest-environment happy-dom
// Phase 44: band rendering, period selection, compare tints, neglected strip, tap-sheet numbers.
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { BodyPicker, loadFigure } from '../../src/ui/body';
import { buildTaxonomy } from '../../src/shared/muscles';
import { allPeriod, compareHeat, heatMap, periodFor, lastDays } from '../../src/shared/heat';
import {
  bandLabelKey, canNext, canPrev, choosePeriod, compareBands, compareRows, comparePeriod, customFrom, heatBands, heatRows,
  muscleDetail, neglected, stepPeriod, trainableIds, weakGroups, type LoggedEntry,
} from '../../src/pages/heatmap/heatmapModel';
import { t } from '../../src/i18n';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => act(() => render(null, root)));
const mount = (v: ComponentChild) => act(() => render(v, root));
const region = (unit: string) => root.querySelector<SVGElement>(`path.sf-body__u[data-unit="${unit}"]`)!;

const tax = buildTaxonomy([
  { id: 'chest', parent: 'chest' }, { id: 'upper_chest', parent: 'chest' }, { id: 'lower_chest', parent: 'chest' },
  { id: 'biceps', parent: 'biceps' }, { id: 'quads', parent: 'quads' }, { id: 'full_body', parent: 'full_body' },
]);
const TODAY = '2026-11-20'; // a Friday
const e = (day: string, sets: number, weights: Record<string, number>, name = 'Bench press', variation?: string): LoggedEntry => ({
  day, sets, weights, slug: name.toLowerCase().replace(/ /g, '-'), name, ...(variation ? { variation } : {}),
});

describe('bands on the figure', () => {
  test('heat bands and the steel loss ramp render as classes with spoken words', async () => {
    await loadFigure('male', 'front');
    mount(<BodyPicker mode="heat" sex="male" view="front" heat={{ biceps: 4 }} loss={{ abs: 2 }} />);
    expect(region('male_front:biceps:1').classList.contains('sf-body__u--heat-4')).toBe(true);
    expect(region('male_front:abs:1').classList.contains('sf-body__u--loss-2')).toBe(true);
    expect(region('male_front:abs:1').getAttribute('aria-label')).toContain(t('hm.state.loss', { n: 2 }));
  });
  test('band labels: 0 has none, 1..5 are Light..Heavy and none is a number', () => {
    expect(bandLabelKey(0)).toBeNull();
    expect([1, 2, 3, 4, 5].map((b) => t(bandLabelKey(b as 1)!))).toEqual(['Light', 'Mild', 'Moderate', 'Strong', 'Heavy']);
  });
  test('heatBands: parent band first, a child own band wins; untrained is left out', () => {
    const map = heatMap([e('2026-11-18', 6, { upper_chest: 1 })], periodFor('week', TODAY), tax);
    const bands = heatBands(map);
    expect(bands.upper_chest).toBeGreaterThan(0);
    expect(bands.chest).toBe(bands.upper_chest);
    expect(bands.lower_chest).toBeUndefined();
    expect(heatRows(map).map((r) => r.id)).toEqual(['upper_chest']);
  });
});

describe('period selection', () => {
  test('chips: day, week (Monday start), month start at today; all = first logged day .. today', () => {
    expect(choosePeriod('day', TODAY, [])).toMatchObject({ from: TODAY, to: TODAY, days: 1 });
    expect(choosePeriod('week', TODAY, [])).toMatchObject({ from: '2026-11-16', to: '2026-11-22', days: 7 });
    expect(choosePeriod('month', TODAY, [])).toMatchObject({ from: '2026-11-01', to: '2026-11-30', days: 30 });
    expect(choosePeriod('all', TODAY, ['2026-09-01', '2026-10-10'])).toMatchObject({ kind: 'all', from: '2026-09-01', to: TODAY });
    expect(choosePeriod('custom', TODAY, [])).toEqual(lastDays(30, TODAY));
  });
  test('arrows: step back and forward; next is off once the period holds today; all time never moves', () => {
    const w = choosePeriod('week', TODAY, []);
    expect(canNext(w, TODAY)).toBe(false);
    const prev = stepPeriod(w, -1);
    expect(prev).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(canNext(prev, TODAY)).toBe(true);
    expect(stepPeriod(prev, 1)).toEqual(w);
    const m = stepPeriod(choosePeriod('month', TODAY, []), -1);
    expect(m).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    const all = allPeriod(['2026-09-01'], TODAY);
    expect(canPrev(all)).toBe(false);
    expect(canNext(all, TODAY)).toBe(false);
  });
  test('custom range: two days in either order; a bad date gives null', () => {
    expect(customFrom('2026-11-10', '2026-11-01')).toMatchObject({ kind: 'custom', from: '2026-11-01', to: '2026-11-10', days: 10 });
    expect(customFrom('nope', '2026-11-01')).toBeNull();
    expect(lastDays(7, TODAY)).toMatchObject({ from: '2026-11-14', to: TODAY });
  });
  test('compare period: the one before (same length for custom); none for all time', () => {
    expect(comparePeriod(periodFor('week', TODAY))).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(comparePeriod(lastDays(7, TODAY))).toMatchObject({ from: '2026-11-07', to: '2026-11-13' });
    expect(comparePeriod(allPeriod([], TODAY))).toBeNull();
  });
});

describe('compare, neglected, tap sheet', () => {
  const entries = [
    e('2026-11-17', 6, { upper_chest: 1 }), // this week
    e('2026-11-10', 3, { upper_chest: 1, biceps: 0.6 }, 'Chin up'), // last week
    e('2026-11-11', 3, { biceps: 1 }, 'Curl'), // last week
    e('2026-11-04', 3, { quads: 1 }, 'Squat'), // two weeks back
  ];
  const week = periodFor('week', TODAY);
  const mapNow = heatMap(entries, week, tax);
  const mapBefore = heatMap(entries, comparePeriod(week)!, tax);

  test('gain is gold-band, loss is steel-band; a muscle untouched in both is left out; no red', () => {
    const cmp = compareHeat(mapBefore, mapNow);
    const { gain, loss } = compareBands(cmp);
    expect(gain.upper_chest).toBeGreaterThan(0);
    expect(loss.biceps).toBeGreaterThan(0);
    expect(gain.quads ?? loss.quads).toBeUndefined();
    expect(compareRows(cmp).map((r) => r.trend)).toContain('loss');
  });
  test('neglected: untrained in the period, never-trained first, then longest ago first', () => {
    const list = neglected(entries, mapNow, ['upper_chest', 'lower_chest', 'biceps', 'quads'], TODAY);
    expect(list.map((n) => n.id)).toEqual(['lower_chest', 'quads', 'biceps']);
    expect(list.map((n) => n.daysSince)).toEqual([null, 16, 9]);
  });
  test('trainable ids drop parents with children and system ids; weak groups keep core ids', () => {
    const ids = ['chest', 'upper_chest', 'lower_chest', 'biceps', 'quads', 'full_body'];
    expect(trainableIds(ids, tax)).toEqual(['upper_chest', 'lower_chest', 'biceps', 'quads']);
    expect(weakGroups(ids, tax)).toEqual(['chest', 'biceps', 'quads']);
  });
  test('tap sheet: sets, exercises by contribution with variation, last trained; a parent covers its parts', () => {
    const more = [...entries, e('2026-11-18', 4, { upper_chest: 0.6 }, 'Incline press', 'incline')];
    const d = muscleDetail(more, week, tax, 'chest', TODAY);
    expect(d.sets).toBe(10);
    expect(d.hits.map((h) => h.name)).toEqual(['Bench press', 'Incline press']);
    expect(d.hits[1]).toMatchObject({ variation: 'incline', sets: 4 });
    expect(d.last).toBe('2026-11-18');
    const none = muscleDetail(entries, week, tax, 'quads', TODAY);
    expect(none.sets).toBe(0);
    expect(none.last).toBe('2026-11-04');
    expect(muscleDetail([], week, tax, 'quads', TODAY)).toEqual({ sets: 0, hits: [], last: null });
  });
});

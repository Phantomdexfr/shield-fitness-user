// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, test } from 'vitest';
import { loadMachineIndex, loadMachineLab } from '../../src/data/repos/machineLab';
import { MachineLabView } from '../../src/pages/machines/MachineLabPage';
import {
  bandOf, chipGroups, computeRows, exercisesReaching, indexRows, notReachable, reachedCount, rowsFor, sortIndex, textTwin, toggleChip, COMPANION_AXES,
  type LabInputs, type ReachRow, type Selection,
} from '../../src/pages/machines/machineLabModel';

const fx = (name: string) => JSON.parse(readFileSync(`contract/fixtures/${name}.json`, 'utf8'));
const table = fx('reach_table');
const combo = fx('reach_combo');

async function lab(slug: string) {
  const d = await loadMachineLab(slug);
  if (!d) throw new Error(`no lab for ${slug}`);
  return d;
}
const parts = (key: string): Selection => {
  const [axis, value] = key.split(':');
  return { [axis as string]: value } as Selection;
};

describe('reach numbers equal the compile-time table', () => {
  test('every machine, no chip and every one-chip filter, computed at runtime = compiled rows', async () => {
    const idx = await loadMachineIndex();
    expect(idx).not.toBeNull();
    let checked = 0;
    for (const m of idx!.machines) {
      const d = await lab(m.slug);
      expect(computeRows({}, d.inputs), `${m.slug} all`).toEqual(d.entry.all);
      for (const [key, rows] of Object.entries(d.entry.filters)) {
        expect(computeRows(parts(key), d.inputs), `${m.slug} ${key}`).toEqual(rows);
        checked++;
      }
    }
    expect(idx!.machines.length).toBe(55);
    expect(checked).toBeGreaterThan(100);
  });

  test('fixture reach_table.json (copied from the compiled table) = what rowsFor shows', async () => {
    for (const [slug, f] of Object.entries<any>(table.machines)) {
      const d = await lab(slug);
      expect(d.entry.n).toBe(f.n);
      expect(rowsFor(d.entry, {}).rows).toEqual(f.all);
      for (const [key, rows] of Object.entries<ReachRow[]>(f.filters)) {
        const r = rowsFor(d.entry, parts(key), d.inputs);
        expect(r.source).toBe('table');
        expect(r.rows).toEqual(rows);
      }
    }
    const d = await lab('cable-crossover');
    expect(d.file.muscles).toEqual(table.universe);
  });

  test('Cable Crossover reaches 23 of 28 mapped muscles (Phase 10 number)', async () => {
    const d = await lab('cable-crossover');
    expect(reachedCount(d.entry.all)).toBe(23);
    expect(notReachable(d.file.muscles, d.entry.all)).toEqual(['calves', 'neck', 'quads', 'soleus', 'tibialis_anterior']);
  });
});

describe('filters change results (Cable Crossover + bench + attachment)', () => {
  test('incline bench narrows the list and changes the rows', async () => {
    const d = await lab('cable-crossover');
    const inc = rowsFor(d.entry, { bench: 'incline' }, d.inputs).rows;
    expect(inc).not.toEqual(d.entry.all);
    expect(reachedCount(inc)).toBeLessThan(reachedCount(d.entry.all));
  });

  test('two chips are computed and match the independent fixture', async () => {
    const d = await lab('cable-crossover');
    for (const c of combo.cases as any[]) {
      const sel = c.selection as Selection;
      const r = rowsFor(d.entry, sel, d.inputs);
      expect(r.rows, JSON.stringify(sel)).toEqual(c.rows);
      const list = exercisesReaching(d.tax.expand(c.muscleIds[0]).concat(c.muscleIds.slice(1)), sel, d.inputs);
      expect(list.map((e) => [e.slug, e.weight, e.setup])).toEqual(c.exercises);
    }
    const two = combo.cases.find((c: any) => c.selection.handle === 'd_handle');
    expect(two.rows.length).toBeGreaterThan(0);
    expect(two.rows.length).toBeLessThanOrEqual(combo.cases[0].rows.length);
  });

  test('rope: no exercise in the data, so the honest empty state (never "cannot")', async () => {
    const d = await lab('cable-crossover');
    for (const sel of [{ handle: 'rope' }, { bench: 'incline', handle: 'rope' }] as Selection[]) {
      const r = rowsFor(d.entry, sel, d.inputs);
      expect(r.rows).toEqual([]);
      expect(notReachable(d.file.muscles, r.rows)).toEqual(d.file.muscles);
      expect(exercisesReaching(['triceps'], sel, d.inputs)).toEqual([]);
    }
  });

  test('a tapped muscle lists exercises strongest first, each with the setup that does it', async () => {
    const d = await lab('cable-crossover');
    const list = exercisesReaching(d.tax.expand('triceps'), {}, d.inputs);
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.weight).toBeGreaterThanOrEqual(list[i]!.weight);
    const chosen = exercisesReaching(['upper_chest'], { bench: 'incline' }, d.inputs);
    expect(chosen.every((e) => e.setup.bench === 'incline')).toBe(true);
  });
});

describe('model helpers', () => {
  test('chip groups: bench, handle and position come from the table; one value per axis; tap again clears', async () => {
    const d = await lab('cable-crossover');
    const g = chipGroups(d.entry);
    expect(g.map((x) => x.axis)).toEqual(['bench', 'handle', 'position']);
    expect(g[0]!.values.map((v) => v.value)).toContain('incline');
    let s: Selection = {};
    s = toggleChip(s, 'bench', 'flat');
    s = toggleChip(s, 'bench', 'incline');
    expect(s).toEqual({ bench: 'incline' });
    s = toggleChip(s, 'handle', 'rope');
    expect(s).toEqual({ bench: 'incline', handle: 'rope' });
    expect(toggleChip(s, 'bench', 'incline')).toEqual({ handle: 'rope' });
    expect(COMPANION_AXES).toEqual(['bench', 'handle', 'position']);
  });

  test('bands: 0 none, 0.2 steps, 1 = 5', () => {
    expect([0, 0.1, 0.2, 0.3, 0.6, 0.75, 1].map(bandOf)).toEqual([0, 1, 1, 2, 3, 4, 5]);
  });

  test('index: sort by reach (most first, then name), name, zone (no zone last); search by word start', async () => {
    const idx = (await loadMachineIndex())!;
    const rows = indexRows(idx.file, idx.machines);
    const byReach = sortIndex(rows, 'reach');
    expect(byReach).toHaveLength(55);
    for (let i = 1; i < byReach.length; i++) expect(byReach[i - 1]!.reached).toBeGreaterThanOrEqual(byReach[i]!.reached);
    const cable = rows.find((r) => r.slug === 'cable-crossover')!;
    expect(cable.reached).toBe(23);
    expect(cable.total).toBe(28);
    const names = sortIndex(rows, 'name').map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    const zones = sortIndex(rows, 'zone');
    const firstNoZone = zones.findIndex((r) => r.zone === null);
    if (firstNoZone >= 0) expect(zones.slice(firstNoZone).every((r) => r.zone === null)).toBe(true);
    expect(sortIndex(rows, 'name', 'lat').every((r) => /\blat/i.test(r.name))).toBe(true);
    expect(sortIndex(rows, 'name', 'zzzz')).toEqual([]);
  });

  test('text twin lists every reached muscle, strongest first', () => {
    const twin = textTwin([['biceps', 0.6, 2], ['lats', 1, 3], ['neck', 0.2, 0]]);
    expect(twin.map((r) => r.muscle)).toEqual(['lats', 'biceps', 'neck']);
    expect(twin.map((r) => r.strength)).toEqual(['strong', 'moderate', 'faint']);
  });
});

describe('Machine Lab screen (text twin, a11y)', () => {
  test('Cable Crossover: text twin names every reached muscle; chips are toggles; rope shows the honest state', async () => {
    const d = await lab('cable-crossover');
    const root = document.createElement('div');
    document.body.appendChild(root);
    await act(() => render(<MachineLabView data={d} />, root));
    const twin = root.querySelector('[data-hook="reach-twin"]')!;
    expect(twin.querySelectorAll('li').length).toBe(23);
    expect(twin.textContent).toMatch(/strong|moderate|light/);
    expect(root.querySelector('[data-hook="not-reachable"]')?.textContent).toMatch(/Not reachable with current data/);
    expect(root.textContent).not.toMatch(/cannot train|can't train|cannot be trained/i);
    expect(root.querySelector('[role="group"][aria-label]')).not.toBeNull();
    const chips = Array.from(root.querySelectorAll('button[aria-pressed]'));
    expect(chips.length).toBeGreaterThan(10);
    const incline = chips.find((b) => b.textContent?.trim() === 'Incline') as HTMLElement;
    await act(() => incline.click());
    expect(incline.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-hook="reach-twin"]')!.querySelectorAll('li').length).toBe(13);
    const rope = Array.from(root.querySelectorAll('button[aria-pressed]')).find((b) => b.textContent?.trim() === 'Rope') as HTMLElement;
    await act(() => rope.click());
    expect(root.textContent).toMatch(/Not reachable with current data/);
    expect(root.querySelector('[data-hook="reach-twin"]')!.querySelectorAll('li').length).toBe(0);
    render(null, root);
  });
});

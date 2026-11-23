// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  ANATOMY_FILES, DEFAULT_THEME, FIND_LIMIT, PRESET_IDS, SYSTEMS, THEMES, THEME_KEYS, defaultVisible, groupsOfPart, loadSettings, partGeometry,
  partSizeCm, planar16, presetVisible, saveSetting, searchParts, systemCounts, type Info, type Meta,
} from '../../src/anatomy/logic';

const read = (f: string) => readFileSync(`public/anatomy/${f}`);
const meta = JSON.parse(read('meta.json').toString('utf8')) as Meta;
const info = JSON.parse(read('info.json').toString('utf8')) as Info;

describe('Anatomy View data files (Phase 91)', () => {
  test('the three files are there and agree with each other', () => {
    expect(ANATOMY_FILES).toEqual(['mesh.bin', 'meta.json', 'info.json']);
    expect(meta.parts.length).toBe(962);
    expect(info.p.length).toBe(meta.parts.length);
    expect(info.g.length).toBeGreaterThan(100);
  });
  test('mesh.bin unpacks to exactly the sizes meta.json promises', () => {
    const raw = gunzipSync(read('mesh.bin'));
    expect(raw.length).toBe(2 * meta.nP + 2 * meta.nI);
    expect(meta.parts.reduce((n, p) => n + p[5] * 3, 0)).toBe(meta.nP);
    expect(meta.parts.reduce((n, p) => n + p[6], 0)).toBe(meta.nI);
  });
  test('every part has a known system and every group member is a real part', () => {
    for (const p of meta.parts) expect(SYSTEMS[p[1]]).toBeDefined();
    for (const g of info.g) for (const k of g[1]) expect(meta.parts[k]).toBeDefined();
  });
  test('decoding a real part gives points inside its own box and valid indexes', () => {
    const raw = new Uint8Array(gunzipSync(read('mesh.bin')));
    const { P, I } = planar16(raw, meta.nP, meta.nI);
    const part = meta.parts[0]!;
    const { pos, idx } = partGeometry(P, I, part, 0, 0);
    expect(pos.length).toBe(part[5] * 3);
    expect(idx.length).toBe(part[6]);
    for (let j = 0; j < pos.length; j++) {
      const a = j % 3;
      expect(pos[j]!).toBeGreaterThanOrEqual(part[3][a]! - 1e-6);
      expect(pos[j]!).toBeLessThanOrEqual(part[4][a]! + 1e-6);
    }
    for (const i of idx) expect(i).toBeLessThan(part[5]);
  });
});

describe('Anatomy View logic', () => {
  test('presets: skeleton, muscles, bone + muscle, organs, all', () => {
    expect(PRESET_IDS).toHaveLength(5);
    const on = (id: (typeof PRESET_IDS)[number]) => SYSTEMS.filter((_, i) => presetVisible(id)[i]).map((s) => s.id);
    expect(on('skeleton')).toEqual(['skeletal']);
    expect(on('muscles')).toEqual(['muscular']);
    expect(on('bonemuscle')).toEqual(['skeletal', 'muscular']);
    expect(on('organs')).not.toContain('skeletal');
    expect(on('organs')).not.toContain('muscular');
    expect(on('all')).toHaveLength(SYSTEMS.length);
    expect(defaultVisible().filter(Boolean)).toHaveLength(2);
  });
  test('system counts add up to the parts', () => {
    expect(systemCounts(meta).reduce((a, b) => a + b, 0)).toBe(meta.parts.length);
  });
  test('find: only visible layers, by name or by code, capped', () => {
    const vis = presetVisible('skeleton');
    const hits = searchParts(meta, vis, 'femur');
    expect(hits.length).toBeGreaterThan(0);
    for (const i of hits) expect(meta.parts[i]![1]).toBe(0);
    expect(searchParts(meta, presetVisible('muscles'), 'femur')).toEqual([]);
    const code = meta.parts[0]![2];
    expect(searchParts(meta, presetVisible('all'), code)).toContain(0);
    expect(searchParts(meta, presetVisible('all'), '').length).toBe(FIND_LIMIT);
  });
  test('groups of a part are smallest first and really contain it', () => {
    const k = info.g[0]![1][0]!;
    const gs = groupsOfPart(info, k);
    expect(gs.length).toBeGreaterThan(0);
    for (let i = 1; i < gs.length; i++) expect(gs[i]!.count).toBeGreaterThanOrEqual(gs[i - 1]!.count);
    for (const g of gs) expect(info.g[g.gi]![1]).toContain(k);
  });
  test('size in centimetres', () => {
    const s = partSizeCm(['x', 0, 'id', [0, 0, 0], [0.1, 0.2, 0.05], 0, 0]);
    expect(s).toEqual(['10.0', '20.0', '5.0']);
  });
  test('five backgrounds, gold is the default', () => {
    expect(THEME_KEYS).toEqual(['gold', 'holo', 'midnight', 'white', 'grey']);
    expect(DEFAULT_THEME).toBe('gold');
    expect(THEMES.white.light).toBe(1);
    expect(THEMES.gold.light).toBe(0);
  });
});

describe('Anatomy View settings', () => {
  beforeEach(() => localStorage.clear());
  test('defaults, then remembered values, then bad values fall back', () => {
    const d = loadSettings(false);
    expect(d).toMatchObject({ theme: 'gold', dim: 1, beam: true, quality: 1.5 });
    expect(loadSettings(true).quality).toBe(1);
    saveSetting('theme', 'white');
    saveSetting('dim', 0.7);
    saveSetting('beam', false);
    saveSetting('quality', 2);
    saveSetting('visible', SYSTEMS.map(() => true));
    const s = loadSettings(false);
    expect(s).toMatchObject({ theme: 'white', dim: 0.7, beam: false, quality: 2 });
    expect(s.visible.every(Boolean)).toBe(true);
    saveSetting('theme', 'nope');
    saveSetting('dim', 9);
    saveSetting('quality', 3);
    saveSetting('visible', [true]);
    expect(loadSettings(false)).toMatchObject({ theme: 'gold', dim: 1, quality: 1.5 });
    expect(loadSettings(false).visible).toHaveLength(SYSTEMS.length);
  });
});

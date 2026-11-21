// Phase 60 verify: fallback logic, lazy-load (three.js not in the main chunk), model asset facts. No browser, no build.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATLAS, FIRST_FRAME_MS, chooseRenderer, drawnIds, filterUnits, groupByRegion, isLowPower, lowPowerReasons, meshOwners, regionOf, sceneSettings, shouldAskBeforeDownload, textOnlyUnits, unitsForRegion } from '../../src/atlas/logic';

const root = join(__dirname, '..', '..');

describe('renderer choice (WebGL fallback)', () => {
  it('3D only when WebGL and unpacking both exist', () => {
    expect(chooseRenderer({ hasWebGL: true, hasDecompression: true })).toEqual({ kind: '3d' });
    expect(chooseRenderer({ hasWebGL: false, hasDecompression: true })).toEqual({ kind: '2d', reason: 'no-webgl' });
    expect(chooseRenderer({ hasWebGL: true, hasDecompression: false })).toEqual({ kind: '2d', reason: 'no-decompression' });
    expect(chooseRenderer({ hasWebGL: false, hasDecompression: false })).toEqual({ kind: '2d', reason: 'no-webgl' });
  });
  it('a failed, slow or cancelled 3D attempt forces the 2D figure', () => {
    expect(chooseRenderer({ hasWebGL: true, hasDecompression: true, forced2d: true })).toEqual({ kind: '2d', reason: 'chosen' });
  });
  it('first frame time limit and data-saver ask', () => {
    expect(FIRST_FRAME_MS).toBe(20000);
    expect(shouldAskBeforeDownload({ saveData: true })).toBe(true);
    expect(shouldAskBeforeDownload({})).toBe(false);
  });
});

describe('low-power mode', () => {
  it('turns on at the documented thresholds', () => {
    expect(isLowPower({})).toBe(false);
    expect(lowPowerReasons({ hardwareConcurrency: 4 })).toEqual(['cores']);
    expect(isLowPower({ hardwareConcurrency: 8 })).toBe(false);
    expect(lowPowerReasons({ deviceMemory: 2 })).toEqual(['memory']);
    expect(isLowPower({ deviceMemory: 4 })).toBe(false);
    expect(lowPowerReasons({ saveData: true })).toEqual(['save-data']);
    expect(lowPowerReasons({ batteryLevel: 0.19 })).toEqual(['battery']);
    expect(isLowPower({ batteryLevel: 0.2 })).toBe(false);
    expect(isLowPower({ batteryLevel: 0.1, batteryCharging: true })).toBe(false);
    expect(lowPowerReasons({ userSetting: true })).toEqual(['setting']);
  });
  it('scene settings: pixel ratio 1, no auto-rotate, no flicker when low power or reduced motion', () => {
    expect(sceneSettings({ lowPower: false, reducedMotion: false, devicePixelRatio: 3 })).toEqual({ pixelRatio: 2, autoRotate: true, flicker: true });
    expect(sceneSettings({ lowPower: true, reducedMotion: false, devicePixelRatio: 3 })).toEqual({ pixelRatio: 1, autoRotate: false, flicker: false });
    expect(sceneSettings({ lowPower: false, reducedMotion: true, devicePixelRatio: 2 })).toEqual({ pixelRatio: 2, autoRotate: false, flicker: false });
    expect(sceneSettings({ lowPower: false, reducedMotion: false, devicePixelRatio: NaN }).pixelRatio).toBe(1);
  });
});

describe('list, search and 2D fallback mapping', () => {
  it('search and region filter', () => {
    expect(filterUnits(ATLAS, 'glut').map((r) => r.muscleId)).toEqual(['gluteus_maximus', 'gluteus_medius_minimus']);
    expect(filterUnits(ATLAS, 'LATERAL head of triceps').map((r) => r.muscleId)).toEqual(['triceps_brachii']);
    expect(filterUnits(ATLAS, '', 'neck').map((r) => r.muscleId)).toEqual(['sternocleidomastoid']);
    expect(filterUnits(ATLAS, 'zzzz')).toEqual([]);
    expect(filterUnits(ATLAS, '')).toHaveLength(39);
  });
  it('every unit is in exactly one of the 8 region groups', () => {
    const groups = groupByRegion(ATLAS);
    expect(groups.map((g) => g.region)).toEqual(['neck', 'shoulders', 'chest', 'back', 'arms', 'core', 'hips', 'legs']);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(39);
    expect(regionOf({ group: 'Forearms' })).toBe('arms');
    expect(regionOf({ group: 'Adductors' })).toBe('hips');
    expect(regionOf({ group: 'Calves & shins' })).toBe('legs');
  });
  it('the seven units without a drawn 2D region are text-only (spec A-P58.3)', () => {
    expect(textOnlyUnits().map((r) => r.muscleId).sort()).toEqual(['iliopsoas', 'pectoralis_minor', 'rotator_cuff', 'sartorius', 'serratus_anterior', 'soleus', 'tibialis_anterior']);
  });
  it('the fitted muscles all have a drawn 2D region', () => {
    for (const r of ATLAS.filter((x) => x.shape === 'fitted')) expect(drawnIds(r).length, r.muscleId).toBeGreaterThan(0);
  });
  it('a tap on the 2D figure finds its units (children only for a parent with none of its own)', () => {
    expect(unitsForRegion('lats').map((r) => r.muscleId)).toEqual(['latissimus_dorsi']);
    expect(unitsForRegion('abs').map((r) => r.muscleId)).toEqual(['rectus_abdominis', 'transversus_abdominis']);
    expect(unitsForRegion('biceps').map((r) => r.muscleId)[0]).toBe('biceps_brachii');
    expect(unitsForRegion('chest').map((r) => r.muscleId)).toContain('pectoralis_major');
    expect(unitsForRegion('full_body')).toEqual([]);
  });
});

describe('model asset', () => {
  const dir = join(root, 'public', 'atlas');
  it('is stored as files, measured, and every mesh key is owned or Skin', () => {
    const sizes = Object.fromEntries(['body.bin', 'fit.bin', 'meta.json'].map((f) => [f, statSync(join(dir, f)).size]));
    expect(sizes).toEqual({ 'body.bin': 2003790, 'fit.bin': 625563, 'meta.json': 14581 });
    const total = Object.values(sizes).reduce((a, b) => a + b, 0);
    expect(total).toBe(2643934);
    for (const f of ['body.bin', 'fit.bin']) expect([...readFileSync(join(dir, f)).subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as { body: { meshes: { k: string }[] }; fit: { meshes: { k: string }[] } };
    const keys = new Set([...meta.body.meshes, ...meta.fit.meshes].map((m) => m.k));
    const owners = meshOwners();
    expect(keys.size).toBe(75);
    for (const k of keys) if (k !== 'Skin') expect(owners.has(k), k).toBe(true);
    expect(owners.size).toBe(74);
    expect(keys.has('Skin')).toBe(true);
    expect(owners.has('Skin')).toBe(false);
  });
  it('is not precached at install (service worker ignores atlas/ and caches it on demand)', () => {
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf8')).toMatch(/globIgnores:\s*\[[^\]]*'atlas\/\*\*'/);
    expect(readFileSync(join(root, 'src/sw.ts'), 'utf8')).toMatch(/atlas\//);
  });
});

describe('lazy load: three.js is not in the main chunk', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && files.push(p); } };
  walk(join(root, 'src'));
  const rel = (p: string) => relative(root, p).replace(/\\/g, '/');
  const src = (p: string) => readFileSync(p, 'utf8');

  it('only src/atlas/scene.ts imports three', () => {
    const users = files.filter((f) => /from\s+['"]three(\/|['"])|import\s*\(\s*['"]three/.test(src(f))).map(rel);
    expect(users).toEqual(['src/atlas/scene.ts']);
  });
  it('scene.ts is reached only through a dynamic import() in the atlas page', () => {
    const refs = files.filter((f) => /atlas\/scene/.test(src(f)) && rel(f) !== 'src/atlas/scene.ts');
    expect(refs.map(rel)).toEqual(['src/pages/atlas/AtlasPage.tsx']);
    const page = src(refs[0]!);
    expect(page).toMatch(/import\('\.\.\/\.\.\/atlas\/scene'\)/);
    // the only static reference is a type-only import (erased at build)
    for (const line of page.split('\n').filter((l) => /^import .*atlas\/scene/.test(l))) expect(line).toMatch(/^import type /);
  });
  it('the route loads the page lazily and the page module is not imported anywhere else', () => {
    expect(src(join(root, 'src/app/routes.ts'))).toMatch(/const AtlasPage = lazyPage\(\(\) => import\('\.\.\/pages\/atlas\/AtlasPage'\)\)/);
    const refs = files.filter((f) => /pages\/atlas\/AtlasPage/.test(src(f))).map(rel);
    expect(refs).toEqual(['src/app/routes.ts']);
  });
  it('the model is never base64 inside JS or TS', () => {
    for (const f of files) expect(/[A-Za-z0-9+/=]{5000,}/.test(src(f)), rel(f)).toBe(false);
    expect(existsSync(join(root, 'public/atlas/body.bin'))).toBe(true);
  });
});

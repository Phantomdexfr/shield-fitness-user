// Phase 60: pure decisions for the atlas page (no DOM, no three.js). Tested in tests/atlas/atlasPage.test.ts.
import atlasJson from './atlas.json';
import { parentOf, tierOf } from '../ui/body/taxonomy';

export interface AtlasRow {
  muscleId: string;
  name: string;
  group: string;
  shape: 'model' | 'fitted';
  meshKeys: string[];
  taxonomyIds: string[];
  inDailyLife: string[];
  whenWeak: string[];
  quickFacts: string[];
  seeAlso: string[];
  reviewed: boolean;
}

export const ATLAS: readonly AtlasRow[] = atlasJson as AtlasRow[];

/** The 8 list chips; a row's `group` is the finer 13 (docs/HOLO_ATLAS.md, "Region chips"). */
export type Region = 'neck' | 'shoulders' | 'chest' | 'back' | 'arms' | 'core' | 'hips' | 'legs';
export const REGIONS: readonly Region[] = ['neck', 'shoulders', 'chest', 'back', 'arms', 'core', 'hips', 'legs'];
const REGION_OF_GROUP: Record<string, Region> = {
  Neck: 'neck',
  Shoulders: 'shoulders',
  Chest: 'chest',
  Back: 'back',
  Arms: 'arms',
  Forearms: 'arms',
  Core: 'core',
  Glutes: 'hips',
  'Hip flexors': 'hips',
  Adductors: 'hips',
  Quadriceps: 'legs',
  Hamstrings: 'legs',
  'Calves & shins': 'legs',
};
export const regionOf = (row: Pick<AtlasRow, 'group'>): Region => REGION_OF_GROUP[row.group] ?? 'core';

export const rowById = (id: string, rows: readonly AtlasRow[] = ATLAS): AtlasRow | undefined => rows.find((r) => r.muscleId === id);

/** Mesh key -> the unit that owns it (a tap on any mesh selects its unit). `Skin` has no owner. */
export function meshOwners(rows: readonly AtlasRow[] = ATLAS): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) for (const k of r.meshKeys) m.set(k, r.muscleId);
  return m;
}

/** List filter: a query matches the name, the group or a mesh key, case-insensitive; an empty query matches all. */
export function filterUnits(rows: readonly AtlasRow[], query: string, region: Region | 'all' = 'all'): AtlasRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (region !== 'all' && regionOf(r) !== region) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q) || r.meshKeys.some((k) => k.toLowerCase().includes(q));
  });
}

/** Rows grouped by region chip, in chip order, empty groups left out. */
export function groupByRegion(rows: readonly AtlasRow[]): Array<{ region: Region; rows: AtlasRow[] }> {
  return REGIONS.map((region) => ({ region, rows: rows.filter((r) => regionOf(r) === region) })).filter((g) => g.rows.length > 0);
}

/* ---------- which renderer, and low power ---------- */

export interface RendererEnv {
  hasWebGL: boolean;
  hasDecompression: boolean;
  /** Set once a 3D attempt failed or took too long, or the person chose the 2D figure. */
  forced2d?: boolean;
}
export type RendererChoice = { kind: '3d' } | { kind: '2d'; reason: 'no-webgl' | 'no-decompression' | 'chosen' };

/** WebGL missing or no way to unpack the model: the 2D figure plus the same panel. */
export function chooseRenderer(env: RendererEnv): RendererChoice {
  if (env.forced2d) return { kind: '2d', reason: 'chosen' };
  if (!env.hasWebGL) return { kind: '2d', reason: 'no-webgl' };
  if (!env.hasDecompression) return { kind: '2d', reason: 'no-decompression' };
  return { kind: '3d' };
}

export interface PowerEnv {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  saveData?: boolean;
  /** 0..1 and not charging; omit when unknown. */
  batteryLevel?: number;
  batteryCharging?: boolean;
  /** The person's own switch on the page. */
  userSetting?: boolean;
}
export const LOW_BATTERY = 0.2;

/** Why low-power mode is on (empty = off). Thresholds from docs/HOLO_ATLAS.md. */
export function lowPowerReasons(e: PowerEnv): string[] {
  const out: string[] = [];
  if (e.userSetting) out.push('setting');
  if (e.hardwareConcurrency !== undefined && e.hardwareConcurrency <= 4) out.push('cores');
  if (e.deviceMemory !== undefined && e.deviceMemory <= 2) out.push('memory');
  if (e.saveData) out.push('save-data');
  if (e.batteryLevel !== undefined && e.batteryLevel < LOW_BATTERY && !e.batteryCharging) out.push('battery');
  return out;
}
export const isLowPower = (e: PowerEnv): boolean => lowPowerReasons(e).length > 0;

export interface SceneSettings {
  pixelRatio: number;
  autoRotate: boolean;
  flicker: boolean;
}
/** Motion and cost settings for the scene. Reduced motion and low power both stop auto-rotate and flicker; low power also caps the pixel ratio at 1. */
export function sceneSettings(opts: { lowPower: boolean; reducedMotion: boolean; devicePixelRatio: number }): SceneSettings {
  const dpr = Number.isFinite(opts.devicePixelRatio) && opts.devicePixelRatio > 0 ? opts.devicePixelRatio : 1;
  return {
    pixelRatio: opts.lowPower ? 1 : Math.min(dpr, 2),
    autoRotate: !opts.lowPower && !opts.reducedMotion,
    flicker: !opts.lowPower && !opts.reducedMotion,
  };
}

/** saveData: ask before the 2.6 MB download. */
export const shouldAskBeforeDownload = (e: { saveData?: boolean }): boolean => !!e.saveData;
/** The first frame must appear within this time of starting the 3D load, or the page falls back to the 2D figure. */
export const FIRST_FRAME_MS = 20000;

/* ---------- 2D fallback mapping ---------- */

/** Taxonomy ids of a unit that have a drawn 2D region (lats, abs, obliques, lower back and so on). */
export const drawnIds = (row: AtlasRow): string[] => row.taxonomyIds.filter((id) => tierOf(id) !== 'list' && tierOf(id) !== 'sys');
/** Units with no drawn 2D region at all: text only in the fallback. */
export const textOnlyUnits = (rows: readonly AtlasRow[] = ATLAS): AtlasRow[] => rows.filter((r) => drawnIds(r).length === 0);

/**
 * A tap on the 2D figure gives a taxonomy id (a detailed muscle or a parent such as `chest`). The units it can mean,
 * the units listed for that id, or for its children when it has none, in atlas order. The first one opens; the rest are offered as "same area".
 */
export function unitsForRegion(id: string, rows: readonly AtlasRow[] = ATLAS): AtlasRow[] {
  const exact = rows.filter((r) => r.taxonomyIds.includes(id));
  // Only a parent id with no unit of its own (chest, back, shoulders, traps) looks at its children. An id that has units keeps just those:
  // the taxonomy files hip_flexors under abs, and a tap on abs must not offer the hip flexors.
  if (exact.length > 0) return exact;
  const viaChildren = rows.filter((r) => r.taxonomyIds.some((t) => t !== id && parentOf(t) === id));
  return viaChildren;
}

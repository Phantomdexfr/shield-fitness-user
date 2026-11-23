// Phase 91: Anatomy View. Pure decisions and data helpers (no DOM, no three.js). Tested in tests/anatomy/logic.test.ts.
// Data files: public/anatomy/mesh.bin (gzip, planar 16-bit), meta.json (parts), info.json (descriptions and groups).
// The colours live in palette.json (data), so the design guard for CSS and TS colour literals stays strict.
import palette from './palette.json';

/** [name, system index, id, lo[3], hi[3], vertex count, index count] */
export type MetaPart = [string, number, string, number[], number[], number, number];
export interface Meta { parts: MetaPart[]; nP: number; nI: number }
/** p[k] = [description, also called, part of]; g[i] = [name, member part indexes, description, also called?] */
export interface Info { p: Array<[string, string[], string[]]>; g: Array<[string, number[], string, string[]?]> }

export const SYSTEMS = palette.systems as ReadonlyArray<{ id: string; name: string; color: string }>;
export type ThemeKey = keyof typeof palette.themes;
export const THEME_KEYS = Object.keys(palette.themes) as ThemeKey[];
export const THEMES = palette.themes as Record<ThemeKey, { light: number; g1: string; g2: string; acc: string }>;
export const DEFAULT_THEME: ThemeKey = 'gold';

export const ANATOMY_FILES = ['mesh.bin', 'meta.json', 'info.json'] as const;
export const ANATOMY_MB_TEXT = '9';
export const anatomyUrl = (file: (typeof ANATOMY_FILES)[number]): string => `${import.meta.env.BASE_URL}anatomy/${file}`;

export type PresetId = 'skeleton' | 'muscles' | 'bonemuscle' | 'organs' | 'all';
export const PRESET_IDS: readonly PresetId[] = ['skeleton', 'muscles', 'bonemuscle', 'organs', 'all'];
const PRESET_TEST: Record<PresetId, (sys: string) => boolean> = {
  skeleton: (s) => s === 'skeletal',
  muscles: (s) => s === 'muscular',
  bonemuscle: (s) => s === 'skeletal' || s === 'muscular',
  organs: (s) => s !== 'skeletal' && s !== 'muscular',
  all: () => true,
};
export const presetVisible = (id: PresetId): boolean[] => SYSTEMS.map((s) => PRESET_TEST[id](s.id));
/** What the lab opens with: skeleton and muscles. */
export const defaultVisible = (): boolean[] => SYSTEMS.map((_, i) => i < 2);

export function systemCounts(meta: Pick<Meta, 'parts'>): number[] {
  const n = SYSTEMS.map(() => 0);
  for (const p of meta.parts) if (n[p[1]] !== undefined) n[p[1]]! += 1;
  return n;
}

export const FIND_LIMIT = 60;
/** Part indexes whose system is visible and whose name (or code) matches. Capped for a short list. */
export function searchParts(meta: Pick<Meta, 'parts'>, visible: readonly boolean[], query: string, limit = FIND_LIMIT): number[] {
  const q = query.trim().toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < meta.parts.length && out.length < limit; i++) {
    const p = meta.parts[i]!;
    if (!visible[p[1]]) continue;
    if (q && !p[0].toLowerCase().includes(q) && p[2].toLowerCase() !== q) continue;
    out.push(i);
  }
  return out;
}

/** Groups a part belongs to, smallest first, at most `max`. */
export function groupsOfPart(info: Pick<Info, 'g'>, k: number, max = 8): Array<{ gi: number; count: number }> {
  const found: Array<{ gi: number; count: number }> = [];
  info.g.forEach((g, gi) => { if (g[1].includes(k)) found.push({ gi, count: g[1].length }); });
  found.sort((a, b) => a.count - b.count);
  return found.slice(0, max);
}

/** Size of a part in centimetres, "w x h x d". */
export function partSizeCm(part: MetaPart): [string, string, string] {
  return [0, 1, 2].map((a) => ((part[4][a]! - part[3][a]!) * 100).toFixed(1)) as [string, string, string];
}

/** The file stores each 16-bit array as all low bytes then all high bytes. Returns positions and indexes for every part. */
export function planar16(raw: Uint8Array, nP: number, nI: number): { P: Uint16Array; I: Uint16Array } {
  const P = new Uint16Array(nP);
  const I = new Uint16Array(nI);
  for (let i = 0; i < nP; i++) P[i] = raw[i]! | (raw[nP + i]! << 8);
  const o = 2 * nP;
  for (let i = 0; i < nI; i++) I[i] = raw[o + i]! | (raw[o + nI + i]! << 8);
  return { P, I };
}

/** Decode one part: positions scaled into its own box, indexes sliced. `pv` and `iv` are running offsets the caller advances. */
export function partGeometry(P: Uint16Array, I: Uint16Array, part: MetaPart, pv: number, iv: number): { pos: Float32Array; idx: Uint16Array } {
  const vc = part[5];
  const pos = new Float32Array(vc * 3);
  const lo = part[3];
  const hi = part[4];
  for (let j = 0; j < vc * 3; j++) {
    const a = j % 3;
    pos[j] = lo[a]! + (P[pv + j]! / 65535) * (hi[a]! - lo[a]!);
  }
  return { pos, idx: I.slice(iv, iv + part[6]) };
}

/** Quality choices are pixel ratios. */
export type Quality = 1 | 1.5 | 2;
export const QUALITIES: readonly Quality[] = [1, 1.5, 2];
export const QUALITY_KEY: Record<Quality, 'low' | 'med' | 'high'> = { 1: 'low', 1.5: 'med', 2: 'high' };

export interface AnatomySettings { theme: ThemeKey; dim: number; beam: boolean; quality: Quality; visible: boolean[] }
const K = (name: string): string => `sf_anat_${name}`;
function load<T>(name: string, fallback: T, ok: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(K(name));
    if (raw === null) return fallback;
    const v: unknown = JSON.parse(raw);
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveSetting(name: keyof AnatomySettings, value: unknown): void {
  try {
    localStorage.setItem(K(name), JSON.stringify(value));
  } catch {
    /* private mode or full: the setting just does not persist */
  }
}
/** Stored settings, each checked; anything odd falls back to the default. `lowPower` picks the cheaper default quality. */
export function loadSettings(lowPower: boolean): AnatomySettings {
  return {
    theme: load<ThemeKey>('theme', DEFAULT_THEME, (v) => typeof v === 'string' && v in THEMES),
    dim: load<number>('dim', 1, (v) => typeof v === 'number' && v >= 0.4 && v <= 1.4),
    beam: load<boolean>('beam', true, (v) => typeof v === 'boolean'),
    quality: load<Quality>('quality', lowPower ? 1 : 1.5, (v) => v === 1 || v === 1.5 || v === 2),
    visible: load<boolean[]>('visible', defaultVisible(), (v) => Array.isArray(v) && v.length === SYSTEMS.length && v.every((x) => typeof x === 'boolean')),
  };
}

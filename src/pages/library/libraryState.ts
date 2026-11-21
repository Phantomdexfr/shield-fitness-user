// Library state (Phase 19): URL <-> filter state, refining search hits, machine list, recent searches. Pure.

import { normalizeText } from '../../dataset/search';
import type { ExerciseRow, Machine } from '../../dataset/loader';
import { allowsMachine, type EquipmentPreset } from '../../shared/equipment';

export type LibraryTab = 'exercises' | 'machines';

export interface LibraryState {
  tab: LibraryTab;
  q: string;
  category?: string;
  sub?: string;
  kind?: string;
  difficulty?: number;
  beginner?: boolean;
  unilateral?: boolean;
  /** Exercises tab: machine slug (`''` is not used; "no machine" is not a library filter). */
  machine?: string;
  /** Machines tab: machine category (strength_machine, cable, ...). */
  mcat?: string;
}

export const EMPTY_STATE: LibraryState = { tab: 'exercises', q: '' };
const SLUG = /^[a-z0-9][a-z0-9_-]{0,80}$/;
const MAX_Q = 80;

/** Read `?tab=&q=&cat=...`. Unknown or malformed values are ignored, so any URL gives a valid state. */
export function parseLibraryUrl(search: string): LibraryState {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const s: LibraryState = { tab: p.get('tab') === 'machines' ? 'machines' : 'exercises', q: (p.get('q') ?? '').slice(0, MAX_Q) };
  const word = (k: string): string | undefined => {
    const v = p.get(k);
    return v !== null && SLUG.test(v) ? v : undefined;
  };
  const cat = word('cat'), sub = word('sub'), kind = word('kind'), machine = word('machine'), mcat = word('mcat');
  if (cat) s.category = cat;
  if (sub) s.sub = sub;
  if (kind) s.kind = kind;
  if (machine) s.machine = machine;
  if (mcat) s.mcat = mcat;
  const d = p.get('diff');
  if (d === '1' || d === '2' || d === '3') s.difficulty = Number(d);
  if (p.get('beginner') === '1') s.beginner = true;
  if (p.get('uni') === '1') s.unilateral = true;
  return s;
}

/** Inverse of `parseLibraryUrl`: a stable order, defaults left out. Empty string when nothing is set. */
export function serializeLibraryUrl(s: LibraryState): string {
  const p = new URLSearchParams();
  if (s.tab === 'machines') p.set('tab', 'machines');
  if (s.q.trim() !== '') p.set('q', s.q.slice(0, MAX_Q));
  if (s.category) p.set('cat', s.category);
  if (s.sub) p.set('sub', s.sub);
  if (s.kind) p.set('kind', s.kind);
  if (s.difficulty !== undefined) p.set('diff', String(s.difficulty));
  if (s.beginner) p.set('beginner', '1');
  if (s.unilateral) p.set('uni', '1');
  if (s.machine) p.set('machine', s.machine);
  if (s.mcat) p.set('mcat', s.mcat);
  const out = p.toString();
  return out === '' ? '' : `?${out}`;
}

/** Number of filters set in the filters sheet (the search text, tab and chips are not counted). */
export function sheetFilterCount(s: LibraryState): number {
  return [s.kind, s.difficulty, s.beginner, s.unilateral, s.machine].filter((v) => v !== undefined && v !== false).length;
}

/** Filters that the search function does not know: category, sub-category, one-side-at-a-time and the equipment preset. */
export function refineExercises(rows: readonly ExerciseRow[], s: LibraryState, preset: EquipmentPreset): ExerciseRow[] {
  return rows.filter((r) => {
    if (s.category !== undefined && r.category !== s.category) return false;
    if (s.sub !== undefined && r.subCategory !== s.sub) return false;
    if (s.unilateral && !r.unilateral) return false;
    return allowsMachine(preset, r.machine);
  });
}

export interface Count {
  value: string;
  n: number;
}

/** Counts of a field, biggest first (ties by name) so chips are ordered the same way every time. */
export function countBy(rows: readonly ExerciseRow[], field: 'category' | 'subCategory'): Count[] {
  const m = new Map<string, number>();
  for (const r of rows) if (r[field] !== '') m.set(r[field], (m.get(r[field]) ?? 0) + 1);
  return [...m].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || (a.value < b.value ? -1 : 1));
}

/** Machines for the machines tab: text, category and equipment preset; A to Z. */
export function filterMachines(list: readonly Machine[], s: LibraryState, preset: EquipmentPreset): Machine[] {
  const words = normalizeText(s.q).split(' ').filter(Boolean);
  return list
    .filter((m) => allowsMachine(preset, m.slug))
    .filter((m) => s.mcat === undefined || m.category === s.mcat)
    .filter((m) => {
      if (words.length === 0) return true;
      const hay = normalizeText(`${m.name} ${m.brand} ${m.category.replace(/_/g, ' ')}`).split(' ');
      return words.every((w) => hay.some((h) => h.startsWith(w)));
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function machineCategories(list: readonly Machine[], preset: EquipmentPreset): Count[] {
  const m = new Map<string, number>();
  for (const x of list) if (allowsMachine(preset, x.slug)) m.set(x.category, (m.get(x.category) ?? 0) + 1);
  return [...m].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || (a.value < b.value ? -1 : 1));
}

// ---------- recent searches (device only) ----------

export const MAX_RECENTS = 8;

/** Newest first, no duplicates (case and spacing ignored), 2+ characters, at most 8. Returns a new list. */
export function addRecent(list: readonly string[], q: string): string[] {
  const text = q.trim().replace(/\s+/g, ' ').slice(0, MAX_Q);
  if (text.length < 2) return [...list];
  const key = normalizeText(text);
  return [text, ...list.filter((x) => normalizeText(x) !== key)].slice(0, MAX_RECENTS);
}

export function removeRecent(list: readonly string[], q: string): string[] {
  const key = normalizeText(q);
  return list.filter((x) => normalizeText(x) !== key);
}

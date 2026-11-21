// Muscle weights (Phase 12): contract/engines.md sections 2 (muscleWeight, fallback) and 3 (applyVariation). Pure.
// Option-aware weights (section 13b, applySetup) were added in Phase 13.

import type { Taxonomy } from './muscles';
import { SETUP_AXES, type Setup } from './setup';

/** Compiled letters: role p/s/t/m (primary, secondary, stabiliser, mobility); emphasis h/m/l. Long names are accepted too (custom exercises). */
export type Role = 'p' | 's' | 't' | 'm';
export type Emphasis = 'h' | 'm' | 'l';

/** [muscleId, role, emphasis, fallback?] - the shape of a `muscle_map.json` row. */
export type MapRowTuple = readonly [string, string, string, ...number[]];

export type Weights = Record<string, number>;

export const EMPHASIS_FACTOR: Record<Emphasis, number> = { h: 1, m: 0.6, l: 0.3 };
export const STABILISER_FACTOR = 0.5;
export const VARIATION_MORE = 1.25;
export const VARIATION_LESS = 0.75;
/** Weight given to a muscle a variation adds that the base map does not have. */
export const VARIATION_ADDED = 0.3;

const ROLES: Record<string, Role> = {
  p: 'p', primary: 'p',
  s: 's', secondary: 's',
  t: 't', stabiliser: 't', stabilizer: 't',
  m: 'm', mobility: 'm',
};
const EMPHASES: Record<string, Emphasis> = { h: 'h', high: 'h', m: 'm', medium: 'm', l: 'l', low: 'l' };

export function normRole(role: string): Role | null {
  return ROLES[role] ?? null;
}
export function normEmphasis(emphasis: string): Emphasis | null {
  return EMPHASES[emphasis] ?? null;
}

/** Remove float noise (0.6 * 0.5 and friends) without changing real values. */
function tidy(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Weight of one map row: primary/secondary = emphasis factor, stabiliser x0.5, mobility 0 (not counted). Unknown role/emphasis = 0. */
export function muscleWeight(role: string, emphasis: string): number {
  const r = normRole(role);
  const e = normEmphasis(emphasis);
  if (!r || !e) return 0;
  if (r === 'm') return 0;
  const f = EMPHASIS_FACTOR[e];
  return tidy(r === 't' ? f * STABILISER_FACTOR : f);
}

/** Weights by muscle id for a list of map rows. A muscle with weight 0 (mobility) is left out; duplicates keep the highest. */
export function rowsToWeights(rows: readonly MapRowTuple[]): Weights {
  const out: Weights = {};
  for (const r of rows) {
    const w = muscleWeight(r[1], r[2]);
    if (w > 0 && w > (out[r[0]] ?? 0)) out[r[0]] = w;
  }
  return out;
}

/**
 * Section 2 fallback for an exercise with no map rows: each primary core id = primary/medium (0.6), each secondary =
 * secondary/low (0.3). A core id with detailed children expands to ALL of them (the parent row is not emitted); an id in
 * both lists counts once, as primary. Rows carry fallback = 1. Same result as the compiler's (docs/DATASET_RUNTIME.md section 7).
 */
export function fallbackRows(primary: readonly string[], secondary: readonly string[], tax: Taxonomy): Array<[string, Role, Emphasis, 1]> {
  const rows: Array<[string, Role, Emphasis, 1]> = [];
  const seen = new Set<string>();
  const emit = (id: string, role: Role, emphasis: Emphasis): void => {
    for (const m of tax.expand(id)) {
      if (seen.has(m)) continue;
      seen.add(m);
      rows.push([m, role, emphasis, 1]);
    }
  };
  for (const id of primary) emit(id, 'p', 'm');
  for (const id of secondary) if (!primary.includes(id)) emit(id, 's', 'l');
  return rows;
}

/** Variation shift rows: [muscleId, 'm' | 'more' | 'l' | 'less'] (compiled letters: m = more, l = less). */
export type ShiftRow = readonly [string, string];

/**
 * Section 3: `more` -> weight x1.25 (cap 1.0); `less` -> x0.75; a `more` muscle that is absent from the base gets 0.3.
 * A `less` muscle that is absent stays absent. Returns a new object; the input is not changed.
 */
export function applyVariation(base: Readonly<Weights>, shifts: readonly ShiftRow[]): Weights {
  const out: Weights = { ...base };
  for (const [id, dir] of shifts) {
    const more = dir === 'm' || dir === 'more';
    const less = dir === 'l' || dir === 'less';
    const cur = out[id];
    if (more) out[id] = cur === undefined ? VARIATION_ADDED : tidy(Math.min(1, cur * VARIATION_MORE));
    else if (less && cur !== undefined) out[id] = tidy(cur * VARIATION_LESS);
  }
  return out;
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The shift rows of a variation: exact text first, then trimmed/collapsed/lower-cased text. [] when there is none (base weights are used). */
export function shiftFor(table: Readonly<Record<string, readonly ShiftRow[]>> | undefined, variation: string | undefined): readonly ShiftRow[] {
  if (!table || !variation) return [];
  const exact = table[variation];
  if (exact) return exact;
  const want = norm(variation);
  for (const [text, rows] of Object.entries(table)) if (norm(text) === want) return rows;
  return [];
}

/** Setup shift table as compiled in `setup_options.json` `shift`: axis -> value -> pattern -> [muscleId, 'm' | 'l'] rows. */
export type SetupShiftTable = Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, readonly ShiftRow[]>>>>>>;

/**
 * Section 13b: the setup shift. For each chosen axis value, the rows for the exercise's pattern plus the `any` rows apply.
 * Axes stack multiplicatively (more x1.25, less x0.75, in fixed axis order) and the result is capped at 1.0 ONCE at the end.
 * A `more` muscle absent from the weights starts at 0.3; a `less` muscle that is absent stays absent.
 * Muscles in `skip` (those the exact variation row already shifted) are left alone, so nothing is counted twice.
 * Returns a new object; the input is not changed.
 */
export function applySetup(
  base: Readonly<Weights>,
  setup: Setup | undefined,
  pattern: string | undefined,
  table: SetupShiftTable | undefined,
  skip?: ReadonlySet<string>,
): Weights {
  if (!setup || !table) return { ...base };
  const out: Weights = { ...base };
  for (const axis of SETUP_AXES) {
    const value = setup[axis];
    if (!value) continue;
    const byPattern = table[axis]?.[value];
    if (!byPattern) continue;
    const rows = [...(pattern ? byPattern[pattern] ?? [] : []), ...(byPattern['any'] ?? [])];
    for (const [id, dir] of rows) {
      if (skip?.has(id)) continue;
      const more = dir === 'm' || dir === 'more';
      const less = dir === 'l' || dir === 'less';
      const cur = out[id];
      if (more) out[id] = cur === undefined ? VARIATION_ADDED : cur * VARIATION_MORE;
      else if (less && cur !== undefined) out[id] = cur * VARIATION_LESS;
    }
  }
  for (const id of Object.keys(out)) {
    if (out[id] !== base[id]) out[id] = tidy(Math.min(1, out[id]!));
  }
  return out;
}

/** The optional setup part of `exerciseWeights`: the chosen setup, the exercise's pattern and the compiled setup shift table. */
export interface SetupInput {
  setup?: Setup;
  pattern?: string;
  table?: SetupShiftTable;
}

/**
 * Weights of one exercise as logged: base rows (section 2), then the variation's shift if it has one (section 3), then the
 * setup shift (section 13b). A muscle the exact variation row shifted is skipped by the setup shift. Callers with no
 * setup pass nothing extra and get the Phase 12 result.
 */
export function exerciseWeights(
  rows: readonly MapRowTuple[],
  variation?: string,
  shiftTable?: Readonly<Record<string, readonly ShiftRow[]>>,
  setupInput?: SetupInput,
): Weights {
  const shifts = shiftFor(shiftTable, variation);
  const withVariation = applyVariation(rowsToWeights(rows), shifts);
  if (!setupInput?.setup) return withVariation;
  return applySetup(withVariation, setupInput.setup, setupInput.pattern, setupInput.table, new Set(shifts.map((r) => r[0])));
}

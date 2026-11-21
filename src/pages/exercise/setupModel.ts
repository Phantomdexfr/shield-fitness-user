// Setup picker model (Phase 22). Pure. Spec: docs/SETUP_OPTIONS.md, contract/engines.md 13-13b.
// The weights themselves come from `exerciseWeights` (Phase 13); nothing here re-implements the shift.

import { SETUP_AXES, SETUP_VALUES, type Setup, type SetupAxis } from '../../shared/setup';
import { exerciseWeights, type MapRowTuple, type SetupShiftTable, type ShiftRow, type Weights } from '../../shared/weights';

/** What one exercise offers: axis -> values (only axes it actually has). */
export type SetupOffer = Partial<Record<SetupAxis, string[]>>;

/** The slice of `setup_options.json` the picker reads. */
export interface SetupData {
  exercises: Record<string, SetupOffer>;
  patterns: Record<string, string>;
  shift: SetupShiftTable;
}

/** Narrow the untyped compiled file. Anything malformed gives `null` (the picker then simply does not show). */
export function parseSetupData(raw: unknown): SetupData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.exercises || typeof r.exercises !== 'object' || !r.shift || typeof r.shift !== 'object') return null;
  const patterns = r.patterns && typeof r.patterns === 'object' ? (r.patterns as Record<string, string>) : {};
  return { exercises: r.exercises as Record<string, SetupOffer>, patterns, shift: r.shift as SetupShiftTable };
}

/** Axes in UI order that the exercise offers, with their values in vocabulary order. Unknown axes/values are dropped. */
export function offeredAxes(offer: SetupOffer | undefined): Array<{ axis: SetupAxis; values: string[] }> {
  if (!offer) return [];
  const out: Array<{ axis: SetupAxis; values: string[] }> = [];
  for (const axis of SETUP_AXES) {
    const have = offer[axis];
    if (!Array.isArray(have)) continue;
    const known: readonly string[] = SETUP_VALUES[axis];
    const values = known.filter((v) => have.includes(v));
    if (values.length > 0) out.push({ axis, values });
  }
  return out;
}

/** Keep only choices the exercise offers (a remembered or url setup may be stale). Result is `{}` = the default. */
export function cleanSetup(setup: Setup | undefined, offer: SetupOffer | undefined): Setup {
  const out: Record<string, string> = {};
  if (!setup) return {};
  for (const { axis, values } of offeredAxes(offer)) {
    const v = setup[axis];
    if (typeof v === 'string' && values.includes(v)) out[axis] = v;
  }
  return out as Setup;
}

/** Choose a value on an axis; choosing the chosen value again clears it (back to the default). */
export function chooseOnAxis(setup: Setup, axis: SetupAxis, value: string): Setup {
  const next: Record<string, unknown> = { ...setup };
  if (next[axis] === value) delete next[axis];
  else next[axis] = value;
  return next as Setup;
}

export const isDefaultSetup = (setup: Setup | undefined): boolean => !setup || SETUP_AXES.every((a) => setup[a] === undefined);

/** `?setup=<axis>:<value>` from the library chip. Returns `{}` when absent or malformed. */
export function setupFromSearch(search: string): Setup {
  const raw = new URLSearchParams(search).get('setup') ?? '';
  const [axis, value] = raw.split(':');
  if (!axis || !value || !(SETUP_AXES as readonly string[]).includes(axis)) return {};
  return { [axis]: value } as Setup;
}

/** Weights of the exercise as it would be logged with this variation and setup (the heatmap and recovery read these). */
export function setupWeights(rows: readonly MapRowTuple[], variation: string | undefined, shiftTable: Readonly<Record<string, readonly ShiftRow[]>>, data: SetupData | null, slug: string, setup: Setup | undefined): Weights {
  const input = data && !isDefaultSetup(setup) ? { setup: setup as Setup, pattern: data.patterns[slug], table: data.shift } : undefined;
  return exerciseWeights(rows, variation, shiftTable, input);
}

export interface SetupEffect {
  more: string[];
  less: string[];
}

/** Muscles whose weight rose or fell against the default setup. Ordered by size of change. */
export function setupEffect(base: Readonly<Weights>, withSetup: Readonly<Weights>): SetupEffect {
  const ids = new Set([...Object.keys(base), ...Object.keys(withSetup)]);
  const diffs = [...ids].map((id) => ({ id, d: (withSetup[id] ?? 0) - (base[id] ?? 0) })).filter((x) => Math.abs(x.d) > 1e-9);
  const by = (sign: 1 | -1) => diffs.filter((x) => x.d * sign > 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || a.id.localeCompare(b.id)).map((x) => x.id);
  return { more: by(1), less: by(-1) };
}

/** Muscles the setup adds that the exercise does not list at all (shown as secondary on the mini body). */
export const addedBySetup = (base: Readonly<Weights>, withSetup: Readonly<Weights>): string[] => Object.keys(withSetup).filter((id) => (withSetup[id] ?? 0) > 0 && !(id in base));

// ---------- what a logged item stores ----------

export interface SetItemFields {
  exercise: string;
  variation?: string;
  /** Omitted when the default is used. */
  setup?: Setup;
}

/** The fields a routine item / logged set stores. No setup chosen = no `setup` key (the default). */
export function itemFields(exercise: string, variation: string | undefined, setup: Setup | undefined): SetItemFields {
  const out: SetItemFields = { exercise };
  if (variation) out.variation = variation;
  if (!isDefaultSetup(setup)) out.setup = { ...setup };
  return out;
}

/** PR board key. With "separate PRs per grip" on, the grip is part of the key; off (default) all grips share one record. */
export function prKey(slug: string, setup: Setup | undefined, separateByGrip: boolean): string {
  return separateByGrip && setup?.grip ? `${slug}#grip:${setup.grip}` : slug;
}

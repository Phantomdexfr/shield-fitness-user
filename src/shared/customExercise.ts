// Custom exercise rules (Phase 27). Pure: no DOM, no store, no dataset imports. The repo (`src/data/repos/customExercises.ts`)
// gathers the taken names and the machine / muscle lookups and passes them in. Shape = engines.md `CustomExercise`
// plus the optional `patternId` + `param` the movement figure reads (A-P24.4).

import { validateName, validateRepRange } from './validators';

export type CustomKind = 'strength' | 'cardio' | 'bodyweight';
export type CustomRole = 'primary' | 'secondary' | 'stabiliser';
export type CustomEmphasis = 'high' | 'medium' | 'low';

export const KINDS: readonly CustomKind[] = ['strength', 'cardio', 'bodyweight'];
export const NOTES_MAX = 500;
export const DEFAULT_REPS = { min: 8, max: 12 } as const;

export interface CustomMuscle {
  id: string;
  role: CustomRole;
  emphasis: CustomEmphasis;
}

/** What the form holds while the person types (strings stay strings until validated). */
export interface CustomDraft {
  name: string;
  kind: CustomKind;
  /** Machine slug, or '' for none / other. */
  machineSlug: string;
  muscles: CustomMuscle[];
  repMin: number;
  repMax: number;
  youtube: string;
  notes: string;
  /** Movement pattern id, or '' for none. */
  patternId: string;
  /** `key=value;key=value` (same string a dataset exercise's map uses). */
  param: string;
}

/** A custom exercise as saved (extra store fields such as client_id are added by the repo). */
export interface CustomExerciseValue {
  name: string;
  slug: string;
  kind: CustomKind;
  machineSlug: string | null;
  muscles: CustomMuscle[];
  repMin: number;
  repMax: number;
  youtubeUrl?: string;
  notes?: string;
  patternId?: string;
  param?: string;
}

export type CustomField = 'name' | 'muscles' | 'reps' | 'youtube' | 'notes' | 'machine' | 'kind';
/** Error codes; screens show `t('cx.err.<code>')` (name and rep errors reuse `validation.<code>`). */
export type CustomErrors = Partial<Record<CustomField, string>>;

export const EMPTY_DRAFT: CustomDraft = {
  name: '',
  kind: 'strength',
  machineSlug: '',
  muscles: [],
  repMin: DEFAULT_REPS.min,
  repMax: DEFAULT_REPS.max,
  youtube: '',
  notes: '',
  patternId: '',
  param: '',
};

/** Lower case, accents and punctuation gone, spaces collapsed: "Cable  Curl!" and "cable curl" are the same name. */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when another exercise (dataset or the person's own) already has this name. `taken` must not include the one being edited. */
export function isDuplicateName(name: string, taken: Iterable<string>): boolean {
  const key = nameKey(name);
  if (key === '') return false;
  for (const n of taken) if (nameKey(n) === key) return true;
  return false;
}

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);

/** Empty is fine (no link). Otherwise: https only, a YouTube host, nothing else (never a script or data URL). */
export function validateYoutubeUrl(raw: string): { ok: true; value: string } | { ok: false; error: 'url_not_https' | 'url_invalid' | 'url_not_youtube' } {
  const s = raw.trim();
  if (s === '') return { ok: true, value: '' };
  if (!/^https:\/\//i.test(s)) return { ok: false, error: /^[a-z][a-z0-9+.-]*:/i.test(s) ? 'url_not_https' : 'url_invalid' };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'url_invalid' };
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '') return { ok: false, error: 'url_invalid' };
  if (!YT_HOSTS.has(u.hostname.toLowerCase())) return { ok: false, error: 'url_not_youtube' };
  return { ok: true, value: u.href };
}

// ---------- muscle list helpers (the Body Picker adds and removes; the list below it sets role and emphasis) ----------

/** Tapping a muscle: removes it if present; else adds it (the first one is primary/high, later ones secondary/medium). */
export function toggleMuscle(list: readonly CustomMuscle[], id: string): CustomMuscle[] {
  if (list.some((m) => m.id === id)) return list.filter((m) => m.id !== id);
  const first = !list.some((m) => m.role === 'primary');
  return [...list, { id, role: first ? 'primary' : 'secondary', emphasis: first ? 'high' : 'medium' }];
}

/** The ids the Body Picker reports after a tap, applied to the list (adds new ones, drops missing ones, keeps settings of the rest). */
export function applyPicked(list: readonly CustomMuscle[], picked: readonly string[]): CustomMuscle[] {
  let next = list.filter((m) => picked.includes(m.id));
  for (const id of picked) if (!next.some((m) => m.id === id)) next = toggleMuscle(next, id);
  return next;
}

export function setMuscle(list: readonly CustomMuscle[], id: string, change: Partial<Pick<CustomMuscle, 'role' | 'emphasis'>>): CustomMuscle[] {
  return list.map((m) => (m.id === id ? { ...m, ...change } : m));
}

/** Body Picker colouring: primary gold, everything else secondary (a stabiliser is drawn as secondary). */
export function pickerEmphasis(list: readonly CustomMuscle[]): Record<string, 'primary' | 'secondary'> {
  const out: Record<string, 'primary' | 'secondary'> = {};
  for (const m of list) out[m.id] = m.role === 'primary' ? 'primary' : 'secondary';
  return out;
}

// ---------- the whole form ----------

export interface CustomContext {
  /** Names already used by the dataset and the person's other custom exercises (NOT the one being edited). */
  takenNames: Iterable<string>;
  /** Slugs already used by the dataset and the person's other custom exercises (NOT the one being edited). */
  takenSlugs: Iterable<string>;
  hasMachine: (slug: string) => boolean;
  hasMuscle: (id: string) => boolean;
  hasPattern?: (id: string) => boolean;
  /** Keep this slug (editing). A new exercise gets `my-<kebab>`. */
  slug?: string;
  /** Builds a new slug from the cleaned name. Injected so this file stays free of the slug module's rules. */
  makeSlug: (name: string, taken: Iterable<string>) => string;
}

export type CustomResult = { ok: true; value: CustomExerciseValue } | { ok: false; errors: CustomErrors };

const isKind = (k: string): k is CustomKind => (KINDS as readonly string[]).includes(k);

export function validateCustom(d: CustomDraft, ctx: CustomContext): CustomResult {
  const errors: CustomErrors = {};

  const name = validateName(d.name);
  if (!name.ok) errors.name = name.error;
  else if (isDuplicateName(name.value, ctx.takenNames)) errors.name = 'name_taken';

  if (!isKind(d.kind)) errors.kind = 'kind_invalid';

  if (d.machineSlug !== '' && !ctx.hasMachine(d.machineSlug)) errors.machine = 'machine_unknown';

  const seen = new Set<string>();
  let hasPrimary = false;
  for (const m of d.muscles) {
    if (!ctx.hasMuscle(m.id)) {
      errors.muscles = 'muscle_unknown';
      break;
    }
    if (seen.has(m.id)) {
      errors.muscles = 'muscle_twice';
      break;
    }
    seen.add(m.id);
    if (m.role === 'primary') hasPrimary = true;
  }
  if (!errors.muscles && !hasPrimary) errors.muscles = 'muscle_primary_needed';

  const reps = validateRepRange(d.repMin, d.repMax);
  if (!reps.ok) errors.reps = reps.error;

  const yt = validateYoutubeUrl(d.youtube);
  if (!yt.ok) errors.youtube = yt.error;

  const notes = d.notes.trim();
  if (notes.length > NOTES_MAX) errors.notes = 'notes_too_long';

  const patternId = d.patternId !== '' && ctx.hasPattern && !ctx.hasPattern(d.patternId) ? '' : d.patternId;

  if (Object.keys(errors).length > 0 || !name.ok || !reps.ok || !yt.ok) return { ok: false, errors };

  const value: CustomExerciseValue = {
    name: name.value,
    slug: ctx.slug ?? ctx.makeSlug(name.value, ctx.takenSlugs),
    kind: d.kind,
    machineSlug: d.machineSlug === '' ? null : d.machineSlug,
    muscles: d.muscles.map((m) => ({ id: m.id, role: m.role, emphasis: m.emphasis })),
    repMin: reps.value.repMin,
    repMax: reps.value.repMax,
  };
  if (yt.value !== '') value.youtubeUrl = yt.value;
  if (notes !== '') value.notes = notes;
  if (patternId !== '') {
    value.patternId = patternId;
    if (d.param !== '') value.param = d.param;
  }
  return { ok: true, value };
}

/** A stored row back into form state (for the edit screen). Anything missing or malformed gets the default. */
export function draftFromStored(c: Partial<CustomExerciseValue> | undefined): CustomDraft {
  if (!c) return { ...EMPTY_DRAFT, muscles: [] };
  return {
    name: typeof c.name === 'string' ? c.name : '',
    kind: c.kind && isKind(c.kind) ? c.kind : 'strength',
    machineSlug: c.machineSlug ?? '',
    muscles: Array.isArray(c.muscles) ? c.muscles.map((m) => ({ id: m.id, role: m.role, emphasis: m.emphasis })) : [],
    repMin: typeof c.repMin === 'number' ? c.repMin : DEFAULT_REPS.min,
    repMax: typeof c.repMax === 'number' ? c.repMax : DEFAULT_REPS.max,
    youtube: c.youtubeUrl ?? '',
    notes: c.notes ?? '',
    patternId: c.patternId ?? '',
    param: c.param ?? '',
  };
}

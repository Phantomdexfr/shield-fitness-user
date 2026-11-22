// Settings (Phase 62): the list of preferences, their defaults and how a stored value is read. Pure: no DOM, no store.
// Every pref has a default; anything stored that is wrong falls back to it. Gym locks never edit the stored value (SETTINGS_MAP).

export type PrefValue = string | number | boolean;

export type PrefKind =
  | { type: 'bool'; def: boolean }
  | { type: 'choice'; def: string; options: readonly string[] }
  | { type: 'int'; def: number; min: number; max: number; step: number }
  | { type: 'text'; def: string; max: number };

/** Where a pref lives: its own row `settings:<key>`, or a field of a row another screen already reads. */
export type PrefStore = { id: string; field: string } | null;

export interface PrefDef {
  key: string;
  kind: PrefKind;
  store: PrefStore;
  /** Catalogue feature that a gym can lock; the row then says "Set by your gym". */
  feature?: string;
}

const LOGGER = 'logger:prefs';
const OVERLOAD = 'overload:prefs';

export const PREF_DEFS: readonly PrefDef[] = [
  { key: 'account.name', kind: { type: 'text', def: '', max: 30 }, store: null },
  { key: 'account.birthDate', kind: { type: 'text', def: '', max: 10 }, store: null },
  { key: 'account.birthYear', kind: { type: 'text', def: '', max: 4 }, store: null },
  { key: 'account.heightCm', kind: { type: 'int', def: 0, min: 0, max: 250, step: 1 }, store: null },
  { key: 'account.heightUnit', kind: { type: 'choice', def: 'cm', options: ['cm', 'ft'] }, store: null },
  { key: 'account.level', kind: { type: 'choice', def: 'unset', options: ['unset', 'beginner', 'intermediate', 'advanced'] }, store: null },
  { key: 'training.units', kind: { type: 'choice', def: 'kg', options: ['kg', 'lb'] }, store: null },
  { key: 'training.smartRest', kind: { type: 'bool', def: true }, store: null, feature: 'smart_rest_timer' },
  { key: 'training.restSec', kind: { type: 'int', def: 90, min: 15, max: 600, step: 15 }, store: null },
  { key: 'training.overloadMode', kind: { type: 'choice', def: 'double', options: ['double', 'linear', 'off'] }, store: { id: OVERLOAD, field: 'mode' }, feature: 'overload_suggestions' },
  { key: 'training.intensity', kind: { type: 'choice', def: 'moderate', options: ['light', 'moderate', 'hard', 'beast'] }, store: { id: OVERLOAD, field: 'intensity' }, feature: 'intensity_dial' },
  { key: 'flow.suggestions', kind: { type: 'bool', def: true }, store: null, feature: 'suggestions' },
  { key: 'flow.warmups', kind: { type: 'bool', def: true }, store: null, feature: 'warmup_suggestions' },
  { key: 'flow.askWhySkip', kind: { type: 'bool', def: true }, store: null },
  { key: 'flow.autoFill', kind: { type: 'bool', def: true }, store: null },
  { key: 'flow.keepAwake', kind: { type: 'bool', def: true }, store: null },
  { key: 'body.heatPeriod', kind: { type: 'choice', def: 'week', options: ['week', 'month', 'all'] }, store: null, feature: 'heatmap' },
  { key: 'body.recovery', kind: { type: 'bool', def: true }, store: null, feature: 'recovery_clock' },
  { key: 'appearance.motion', kind: { type: 'choice', def: 'full', options: ['full', 'reduced'] }, store: null },
  { key: 'appearance.haptics', kind: { type: 'bool', def: true }, store: null },
  { key: 'appearance.density', kind: { type: 'choice', def: 'comfortable', options: ['comfortable', 'compact'] }, store: null },
  { key: 'mode.level', kind: { type: 'choice', def: 'simple', options: ['simple', 'advanced'] }, store: { id: LOGGER, field: 'mode' } },
];

const byKey = new Map(PREF_DEFS.map((d) => [d.key, d]));

export function prefDef(key: string): PrefDef | undefined {
  return byKey.get(key);
}

export function defaultOf(key: string): PrefValue {
  const d = byKey.get(key);
  return d ? d.kind.def : '';
}

/** Turn whatever was stored into a valid value for the pref (default when missing or wrong). Unknown key = ''. */
export function parsePref(key: string, raw: unknown): PrefValue {
  const d = byKey.get(key);
  if (!d) return '';
  const k = d.kind;
  switch (k.type) {
    case 'bool':
      return typeof raw === 'boolean' ? raw : k.def;
    case 'choice':
      return typeof raw === 'string' && k.options.includes(raw) ? raw : k.def;
    case 'int': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return k.def;
      const n = Math.round(raw / k.step) * k.step;
      return n < k.min || n > k.max ? k.def : n;
    }
    case 'text':
      return typeof raw === 'string' ? raw.trim().slice(0, k.max) : k.def;
  }
}

/** Birth year: empty, or a whole year 1900..2100 (the page shows an error otherwise). */
export function parseBirthYear(text: string): { ok: true; value: string } | { ok: false } {
  const s = text.trim();
  if (s === '') return { ok: true, value: '' };
  if (!/^\d{4}$/.test(s)) return { ok: false };
  const n = Number(s);
  return n >= 1900 && n <= 2100 ? { ok: true, value: s } : { ok: false };
}

// ---------- groups and rows ----------

export type RowSpec =
  | { kind: 'toggle'; pref: string; label: string; hint?: string }
  | { kind: 'segmented'; pref: string; label: string; options: readonly { value: string; label: string }[] }
  | { kind: 'stepper'; pref: string; label: string; unit: string }
  | { kind: 'text'; pref: string; label: string; hint?: string }
  /** A number with a sane range chosen in a sheet; stored 0 = not set (Phase 85: height). */
  | { kind: 'number'; pref: string; label: string; min: number; max: number; start: number; unit: string }
  /** A date chosen on the calendar; `yearPref` (if set) is kept equal to its year so older code and installs still read a birth year. */
  | { kind: 'date'; pref: string; label: string; hint?: string; yearPref?: string }
  | { kind: 'link'; label: string; to: string; hint?: string; feature?: string }
  | { kind: 'note'; text: string };

export interface GroupDef {
  slug: string;
  /** Icon name already in the icon set. */
  icon: 'user-circle' | 'barbell' | 'check' | 'info' | 'image' | 'magnifying-glass' | 'download-simple' | 'device-mobile' | 'books';
  /** Prefs whose values make the one-line summary on the list. */
  summary: readonly string[];
}

export const GROUPS: readonly GroupDef[] = [
  { slug: 'account', icon: 'user-circle', summary: ['account.level'] },
  { slug: 'training', icon: 'barbell', summary: ['training.units', 'training.overloadMode'] },
  { slug: 'workout-flow', icon: 'check', summary: ['flow.suggestions'] },
  { slug: 'body', icon: 'info', summary: ['body.heatPeriod'] },
  { slug: 'appearance', icon: 'image', summary: ['appearance.motion', 'appearance.density'] },
  { slug: 'mode', icon: 'magnifying-glass', summary: ['mode.level'] },
];

/** Phase 63: pages that hold no prefs of their own (data, privacy, reminders, gym, about, credits). Each is its own route and page. */
export const MORE_GROUPS: readonly GroupDef[] = [
  { slug: 'data', icon: 'download-simple', summary: [] },
  { slug: 'privacy', icon: 'info', summary: [] },
  { slug: 'reminders', icon: 'check', summary: [] },
  { slug: 'gym', icon: 'device-mobile', summary: [] },
  { slug: 'about', icon: 'info', summary: [] },
  { slug: 'credits', icon: 'books', summary: [] },
];

export function groupBySlug(slug: string): GroupDef | undefined {
  return GROUPS.find((g) => g.slug === slug);
}

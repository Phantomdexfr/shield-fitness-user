// Phase 96: the Interface style switches (Premium / Classic / Custom). Pure: no DOM, no storage.
// Premium = every switch on (the default for everyone). Classic = every switch off = the 1.2.0 look. Custom = a mix.
// Phase 113 appended a tenth switch, `tidy` (Tidy layout), LAST. An older 9-character mirror has no 10th character: that reads as ON.
// Stored in the device prefs row `appearance:ux` and mirrored (as one short string) in localStorage so index.html can apply it before first paint.

export const UX_KEYS = ['surfaces', 'icons', 'tabbar', 'headers', 'controls', 'wheels', 'sheets', 'motion', 'layout', 'tidy'] as const;
export type UxKey = (typeof UX_KEYS)[number];
export type UxStyle = 'premium' | 'classic';
export type UxMaster = UxStyle | 'custom';
export type UxSwitches = Record<UxKey, boolean>;

/** The localStorage key of the early-apply mirror. index.html reads the same key and the same key order. */
export const UX_MIRROR_KEY = 'sf.ux';
/** The device prefs row. */
export const UX_ROW = 'appearance:ux';

export const allSwitches = (on: boolean): UxSwitches => Object.fromEntries(UX_KEYS.map((k) => [k, on])) as UxSwitches;

/** Premium for everyone until they choose otherwise. */
export const DEFAULT_SWITCHES: UxSwitches = allSwitches(true);

/** Anything unknown or missing falls back to Premium (on). Accepts the stored row value. */
export function parseSwitches(raw: unknown): UxSwitches {
  const src = raw && typeof raw === 'object' ? ((raw as { switches?: unknown }).switches as Record<string, unknown> | undefined) : undefined;
  const out = allSwitches(true);
  if (src && typeof src === 'object') for (const k of UX_KEYS) if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
  return out;
}

export function masterOf(s: UxSwitches): UxMaster {
  const on = UX_KEYS.filter((k) => s[k]).length;
  return on === UX_KEYS.length ? 'premium' : on === 0 ? 'classic' : 'custom';
}

/** The value written to the prefs row. The master is derived, kept for readers of the file. */
export function toRow(s: UxSwitches): { master: UxMaster; switches: UxSwitches } {
  return { master: masterOf(s), switches: s };
}

/** One character per key, in `UX_KEYS` order: 1 premium, 0 classic. */
export const toMirror = (s: UxSwitches): string => UX_KEYS.map((k) => (s[k] ? '1' : '0')).join('');

/** Missing, short or odd text means premium for that key. */
export function fromMirror(text: string | null | undefined): UxSwitches {
  const out = allSwitches(true);
  if (text) UX_KEYS.forEach((k, i) => (out[k] = text.charAt(i) !== '0'));
  return out;
}

export const styleOf = (on: boolean): UxStyle => (on ? 'premium' : 'classic');

/** Choosing Premium or Classic sets every switch; Custom changes nothing (it only appears when switches are mixed). */
export function withMaster(s: UxSwitches, master: UxMaster): UxSwitches {
  return master === 'custom' ? s : allSwitches(master === 'premium');
}

export const withSwitch = (s: UxSwitches, key: UxKey, on: boolean): UxSwitches => ({ ...s, [key]: on });

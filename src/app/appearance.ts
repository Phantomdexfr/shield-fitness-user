// Applies Settings -> Appearance to the page: motion (full / reduced), density, haptics. Loaded once at start.
import { onPrefChange, readPref } from '../data/repos/prefs';
import { setHapticsEnabled } from '../ui/components/haptics';
import { onUxChange, readUx, syncMirror } from '../data/repos/ux';
import { UX_KEYS, styleOf, type UxSwitches } from '../shared/ux';

/** Set `data-ux-<key>="premium|classic"` on the root (index.html sets the same before first paint). */
export function applyUx(s: UxSwitches): void {
  if (typeof document === 'undefined') return;
  for (const k of UX_KEYS) document.documentElement.setAttribute(`data-ux-${k}`, styleOf(s[k]));
}

export function applyAppearance(key: string, value: unknown): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (key === 'appearance.motion') root.dataset.motion = value === 'reduced' ? 'reduced' : 'full';
  else if (key === 'appearance.density') root.dataset.density = value === 'compact' ? 'compact' : 'comfortable';
  else if (key === 'appearance.haptics') setHapticsEnabled(value !== false);
}

let started = false;

/** Read the three appearance prefs, apply them, and keep following changes. Safe to call twice. */
export async function loadAppearance(): Promise<void> {
  if (started) return;
  started = true;
  onPrefChange((k, v) => applyAppearance(k, v));
  onUxChange(applyUx);
  const ux = await readUx();
  applyUx(ux);
  syncMirror(ux);
  for (const k of ['appearance.motion', 'appearance.density', 'appearance.haptics']) {
    applyAppearance(k, await readPref(k));
  }
}

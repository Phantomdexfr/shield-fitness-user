// Applies Settings -> Appearance to the page: motion (full / reduced), density, haptics. Loaded once at start.
import { onPrefChange, readPref } from '../data/repos/prefs';
import { setHapticsEnabled } from '../ui/components/haptics';

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
  for (const k of ['appearance.motion', 'appearance.density', 'appearance.haptics']) {
    applyAppearance(k, await readPref(k));
  }
}

// 8 ms tick on Android (Vibration API). iOS has no vibration API: nothing happens there, never rely on it.
export const TICK_MS = 8;

let enabled = true;

/** Settings -> Appearance -> Haptics. Off means `tick()` does nothing. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function tick(): void {
  if (!enabled || !canVibrate()) return;
  try {
    navigator.vibrate(TICK_MS);
  } catch {
    /* some browsers throw without a user gesture: ignore */
  }
}

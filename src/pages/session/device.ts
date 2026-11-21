// Device helpers for the set logger (Phase 38): keep the screen awake and vibrate when a rest ends.
// Both are best effort: iOS has no Vibration API and Wake Lock needs a recent browser, so nothing here may throw or be relied on.

type Lock = { release: () => Promise<void> };
let lock: Lock | null = null;

export function canWake(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/** Asks the browser to keep the screen on. Returns false when it cannot (no support, battery saver, hidden page). */
export async function keepAwake(): Promise<boolean> {
  if (!canWake()) return false;
  try {
    if (lock) return true;
    lock = (await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<Lock> } }).wakeLock.request('screen')) as Lock;
    return true;
  } catch {
    lock = null;
    return false;
  }
}

export async function letSleep(): Promise<void> {
  const l = lock;
  lock = null;
  try {
    await l?.release();
  } catch {
    /* already released */
  }
}

/** Short buzz pattern when a rest ends (Android). A no-op elsewhere. */
export function buzz(pattern: number | number[] = [120, 80, 120]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* needs a user gesture in some browsers */
  }
}

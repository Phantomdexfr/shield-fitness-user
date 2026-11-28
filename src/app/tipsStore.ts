// Phase 117: live page-tips setting shared by the "i" button (Shell) and the Settings row. null = not read yet (nothing is drawn).
import { useEffect, useState } from 'preact/hooks';
import { readTipsOn, saveTipsOn } from '../data/repos/tips';

let value: boolean | null = null;
const listeners = new Set<(v: boolean | null) => void>();
const emit = () => listeners.forEach((fn) => fn(value));

/** Read the stored setting again (also after the tour wrote its first record on a new install). */
export async function refreshTips(): Promise<void> {
  const v = await readTipsOn();
  if (v !== value) {
    value = v;
    emit();
  }
}

/** The person's choice: stored, and applied app-wide at once. */
export async function setTipsOn(on: boolean): Promise<void> {
  value = on;
  emit();
  await saveTipsOn(on);
}

export function useTipsOn(): boolean | null {
  const [v, setV] = useState<boolean | null>(value);
  useEffect(() => {
    listeners.add(setV);
    if (value === null) void refreshTips();
    else setV(value);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

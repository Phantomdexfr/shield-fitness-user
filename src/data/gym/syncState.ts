// The sync chip's state (Phase 67): a tiny store the engine writes and the chip reads. Memory only.

import { useEffect, useState } from 'preact/hooks';
import { chipState, type ChipInput, type ChipState } from '../../shared/sync';

let input: ChipInput = { connected: false, running: false, online: true, waiting: 0, failed: 0, authPaused: false, versionMismatch: false, lastSyncedAt: null };
const subs = new Set<() => void>();

export const getChipInput = (): ChipInput => input;
export function setChipInput(p: Partial<ChipInput>): void {
  input = { ...input, ...p };
  subs.forEach((f) => f());
}
export const currentChip = (): ChipState | null => chipState(input);
export const subscribeChip = (f: () => void): (() => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** The chip state for a component; null while standalone. */
export function useChip(): ChipState | null {
  const [, force] = useState(0);
  useEffect(() => subscribeChip(() => force((n) => n + 1)), []);
  return chipState(input);
}

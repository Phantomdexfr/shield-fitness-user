// The gym code that passed the checks and waits for the confirm screen (Phase 66). Memory only: nothing is stored
// until the user confirms and connecting succeeds (Phase 67), so closing the app forgets it.

import { parseGymConfig, type GymConfig, type GymConfigResult } from '../../shared/gymConfig';

let pending: { config: GymConfig; host: string } | null = null;

export const getPendingGym = () => pending;
export const clearPendingGym = (): void => {
  pending = null;
};

/** Build-time pin to the owner's own projects (`VITE_ALLOWED_GYM_HOSTS`, comma separated). Empty = any `.supabase.co`. */
export function allowedGymHosts(): string[] {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_ALLOWED_GYM_HOSTS ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Check a pasted, scanned or linked code. On success it becomes the pending gym. */
export function checkGymCode(text: string): GymConfigResult {
  const r = parseGymConfig(text, { allowedHosts: allowedGymHosts() });
  pending = r.ok ? { config: r.config, host: r.host } : null;
  return r;
}

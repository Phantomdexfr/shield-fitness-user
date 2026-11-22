// Plan-share relay client (Phase 42): the four calls of contract/plan-share.md section 4. Nothing here runs until a caller invokes
// one of them, so no network request is made on import or on page load. The secret is never an argument: only the derived id and the ciphertext.
// URL: the relay is a Supabase Edge Functions base, e.g. https://<project>.supabase.co/functions/v1 (the calls append /share_create etc.).

import { freeConfig } from '../../app/freeBuild';

export interface RelayConfig {
  url: string;
  anon: string;
}

let gym: RelayConfig | null = null;

/** Connected mode (Phase 66+): the gym's functions URL from SFCFG1 replaces the build default. `null` goes back to the default. */
export function setGymRelay(cfg: RelayConfig | null): void {
  gym = cfg && cfg.url ? cfg : null;
}

/**
 * Gym relay when connected, else the build values `VITE_SHARE_RELAY_URL` / `VITE_SHARE_RELAY_ANON`, else (Phase 82) the core functions URL and
 * public anon key already baked in for free backup (`VITE_CORE_FUNCTIONS_URL` / `VITE_CORE_ANON_KEY`, where the `share_*` functions live),
 * else `null` (sharing is hidden).
 */
export function relayConfig(): RelayConfig | null {
  if (gym) return gym;
  const url = (import.meta.env.VITE_SHARE_RELAY_URL as string | undefined)?.trim();
  if (url) return { url, anon: ((import.meta.env.VITE_SHARE_RELAY_ANON as string | undefined) ?? '').trim() };
  const core = freeConfig();
  if (/^https:\/\//.test(core.functionsUrl) && core.coreAnon.length >= 8) return { url: core.functionsUrl, anon: core.coreAnon };
  return null;
}

export const relayAvailable = (): boolean => relayConfig() !== null;

export type RelayErrorCode = 'rate_limited' | 'too_large' | 'relay_full' | 'bad_request' | 'not_found' | 'offline' | 'not_configured' | 'server';

export class RelayError extends Error {
  constructor(public readonly code: RelayErrorCode) {
    super(code);
  }
}

export interface RelayDeps {
  fetch?: typeof fetch;
  config?: RelayConfig | null;
}

const KNOWN: readonly string[] = ['rate_limited', 'too_large', 'relay_full', 'bad_request', 'not_found'];

async function call<T>(name: string, body: Record<string, unknown>, deps: RelayDeps): Promise<T> {
  const cfg = deps.config === undefined ? relayConfig() : deps.config;
  if (!cfg) throw new RelayError('not_configured');
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await doFetch(`${cfg.url.replace(/\/+$/, '')}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.anon ? { apikey: cfg.anon, Authorization: `Bearer ${cfg.anon}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RelayError('offline');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok) return json as T;
  const code = (json as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && KNOWN.includes(code)) throw new RelayError(code as RelayErrorCode);
  throw new RelayError(res.status === 404 ? 'not_found' : res.status === 429 ? 'rate_limited' : 'server');
}

export const shareCreate = (id: string, ctBase64: string, deps: RelayDeps = {}): Promise<{ expiresAt: string }> => call('share_create', { id, ct: ctBase64 }, deps);

export type ShareStatus = { state: 'waiting'; secondsLeft: number } | { state: 'gone' };
export const shareStatus = (id: string, deps: RelayDeps = {}): Promise<ShareStatus> => call('share_status', { id }, deps);

export const shareClaim = (id: string, deps: RelayDeps = {}): Promise<{ ct: string }> => call('share_claim', { id }, deps);

export const shareCancel = (id: string, deps: RelayDeps = {}): Promise<{ ok: true }> => call('share_cancel', { id }, deps);

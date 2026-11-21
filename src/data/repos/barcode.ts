// Barcode lookup (Phase 56). The one deliberate network call of the standalone app: it happens only inside `lookupBarcode`,
// which a screen calls from a tap on Scan or Look up. Nothing here runs on import, on page load or in the background.
// The last 50 looked-up products are kept in one `prefs` row (device only: prefs never reach the outbox).

import { prefsRepo } from '../local';
import { OFF_ORIGIN, addToCache, findInCache, normalizeBarcode, parseCache, parseProduct, productUrl, type BarcodeError, type CacheEntry, type Product } from '../../shared/barcode';

const CACHE_ID = 'barcode:cache';
const TIMEOUT_MS = 10000;

export type LookupResult =
  | { status: 'found'; product: Product; fromCache: boolean }
  | { status: 'not_found' }
  | { status: 'offline' }
  | { status: 'malformed' }
  | { status: 'server' }
  | { status: 'invalid'; error: BarcodeError };

export interface LookupDeps {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export async function loadCache(): Promise<CacheEntry[]> {
  const row = await prefsRepo.get(CACHE_ID).catch(() => undefined);
  return parseCache(row?.value);
}

async function saveCache(list: CacheEntry[]): Promise<void> {
  await prefsRepo.put({ client_id: CACHE_ID, value: list }).catch(() => undefined);
}

/**
 * Looks one barcode up. The network is tried first; when it cannot be reached (or the server fails) a saved copy of the same code
 * is returned with `fromCache: true`, and with no saved copy the answer is `offline` / `server` (no invented data).
 */
export async function lookupBarcode(raw: string, deps: LookupDeps = {}): Promise<LookupResult> {
  const norm = normalizeBarcode(raw);
  if (!norm.ok) return { status: 'invalid', error: norm.error };
  const url = productUrl(norm.code);
  if (url === null || !url.startsWith(`${OFF_ORIGIN}/`)) return { status: 'invalid', error: 'length' };
  const doFetch = deps.fetch ?? globalThis.fetch?.bind(globalThis);
  const now = deps.now ?? Date.now;
  const fallback = async (status: 'offline' | 'server'): Promise<LookupResult> => {
    const hit = findInCache(await loadCache(), norm.code);
    return hit ? { status: 'found', product: hit.product, fromCache: true } : { status };
  };
  if (!doFetch) return fallback('offline');

  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), deps.timeoutMs ?? TIMEOUT_MS) : 0;
  let res: Response;
  try {
    res = await doFetch(url, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', ...(ctl ? { signal: ctl.signal } : {}) });
  } catch {
    return fallback('offline');
  } finally {
    if (timer) clearTimeout(timer);
  }

  let json: unknown = null;
  let bodyOk = true;
  try {
    json = await res.json();
  } catch {
    bodyOk = false;
  }
  if (res.status === 404) return { status: 'not_found' };
  if (!res.ok) return fallback('server');
  if (!bodyOk) return { status: 'malformed' };
  const parsed = parseProduct(json, norm.code);
  if (!parsed.ok) return { status: parsed.error };
  await saveCache(addToCache(await loadCache(), parsed.product, now()));
  return { status: 'found', product: parsed.product, fromCache: false };
}

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { listOutbox, resetDb, setClock, setOutboxEnabled } from '../../src/data/local';
import { loadCache, lookupBarcode } from '../../src/data/repos/barcode';

let tick = 1000;
beforeEach(async () => {
  await resetDb();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  setOutboxEnabled(false);
  tick = 1000;
  setClock(() => ++tick);
});

const CODE = '3017620422003';
const okBody = (name = 'Spread') => ({ status: 1, code: CODE, product: { product_name: name, brands: 'B', serving_size: '15 g', nutriments: { proteins_100g: 6.3, 'energy-kcal_100g': 539 } } });
const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function counting(fn: (url: string) => Promise<Response>) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(String(url));
    return fn(String(url));
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('barcode lookup (mocked network)', () => {
  it('found: calls only the Open Food Facts host, once, and caches the product', async () => {
    const { f, calls } = counting(reply(okBody()));
    const r = await lookupBarcode('3017-6204-22003', { fetch: f });
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(r.fromCache).toBe(false);
    expect(r.product.per100.protein).toBe(6.3);
    expect(r.product.perServing.protein).toBe(0.9);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0] as string).origin).toBe('https://world.openfoodfacts.org');
    expect((await loadCache()).map((e) => e.code)).toEqual([CODE]);
  });
  it('a UPC-A typed by hand is looked up as its EAN-13', async () => {
    const { f, calls } = counting(reply(okBody()));
    await lookupBarcode('737628064502', { fetch: f });
    expect(calls[0]).toContain('/product/0737628064502.json');
  });
  it('not found (status 0 and HTTP 404) writes nothing to the cache', async () => {
    const a = await lookupBarcode(CODE, { fetch: reply({ status: 0, status_verbose: 'product not found' }) as unknown as typeof fetch });
    const b = await lookupBarcode(CODE, { fetch: reply({ status: 0 }, 404) as unknown as typeof fetch });
    expect(a).toEqual({ status: 'not_found' });
    expect(b).toEqual({ status: 'not_found' });
    expect(await loadCache()).toEqual([]);
  });
  it('offline with no saved copy: a clear status and no invented data', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await lookupBarcode(CODE, { fetch: f })).toEqual({ status: 'offline' });
    expect(await loadCache()).toEqual([]);
  });
  it('offline with a saved copy of the same code: the saved copy, marked as cached', async () => {
    await lookupBarcode(CODE, { fetch: reply(okBody('Saved')) as unknown as typeof fetch });
    const f = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const r = await lookupBarcode(CODE, { fetch: f });
    expect(r.status).toBe('found');
    if (r.status === 'found') {
      expect(r.fromCache).toBe(true);
      expect(r.product.name).toBe('Saved');
    }
    expect(await lookupBarcode('96385074', { fetch: f })).toEqual({ status: 'offline' });
  });
  it('malformed JSON and a wrong shape', async () => {
    const bad = (async () => new Response('<html>oops', { status: 200 })) as unknown as typeof fetch;
    expect(await lookupBarcode(CODE, { fetch: bad })).toEqual({ status: 'malformed' });
    expect(await lookupBarcode(CODE, { fetch: reply([1, 2, 3]) as unknown as typeof fetch })).toEqual({ status: 'malformed' });
    expect(await loadCache()).toEqual([]);
  });
  it('server error: status server, or the saved copy when there is one', async () => {
    const down = reply({ error: 'x' }, 503) as unknown as typeof fetch;
    expect(await lookupBarcode(CODE, { fetch: down })).toEqual({ status: 'server' });
    await lookupBarcode(CODE, { fetch: reply(okBody()) as unknown as typeof fetch });
    expect(await lookupBarcode(CODE, { fetch: down })).toMatchObject({ status: 'found', fromCache: true });
  });
  it('a bad code never reaches the network', async () => {
    const { f, calls } = counting(reply(okBody()));
    expect(await lookupBarcode('', { fetch: f })).toEqual({ status: 'invalid', error: 'empty' });
    expect(await lookupBarcode('12ab', { fetch: f })).toEqual({ status: 'invalid', error: 'chars' });
    expect(await lookupBarcode('1234567', { fetch: f })).toEqual({ status: 'invalid', error: 'length' });
    expect(await lookupBarcode('3017620422004', { fetch: f })).toEqual({ status: 'invalid', error: 'checksum' });
    expect(calls).toHaveLength(0);
  });
  it('the cache keeps the last 50 products only and never reaches the outbox, even when connected', async () => {
    setOutboxEnabled(true);
    const base = 100000000000;
    for (let i = 0; i < 53; i++) {
      // build valid EAN-13 codes: 12 digits + check digit
      const body = String(base + i).padStart(12, '0');
      let sum = 0;
      for (let k = 0; k < 12; k++) sum += Number(body[k]) * (k % 2 === 0 ? 1 : 3);
      const code = `${body}${(10 - (sum % 10)) % 10}`;
      const r = await lookupBarcode(code, { fetch: reply(okBody(`P${i}`)) as unknown as typeof fetch });
      expect(r.status).toBe('found');
    }
    const cache = await loadCache();
    expect(cache).toHaveLength(50);
    expect(cache[0]?.product.name).toBe('P52');
    expect(cache.some((e) => e.product.name === 'P0')).toBe(false);
    expect(await listOutbox()).toHaveLength(0);
  });
  it('no request fires without a call to lookupBarcode (reading the cache and importing the modules make none)', async () => {
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string) => { calls.push(String(u)); return new Response('{}'); }) as unknown as typeof fetch;
    try {
      await loadCache();
      await import('../../src/shared/barcode');
      await import('../../src/data/repos/barcode');
      expect(calls).toHaveLength(0);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('where the request may go', () => {
  it('the documented CSP connect-src lists the Open Food Facts host, and the lookup URL is on it', () => {
    const doc = readFileSync('docs/security/SECURITY_MODEL.md', 'utf8');
    const m = /connect-src ([^;]+);/.exec(doc);
    expect(m).not.toBeNull();
    const hosts = (m?.[1] ?? '').split(' ');
    expect(hosts).toContain('https://world.openfoodfacts.org');
    // the only non-self, non-gym host this phase adds
    expect(hosts.filter((h) => h.includes('openfoodfacts'))).toEqual(['https://world.openfoodfacts.org']);
  });
  it('the scan code makes the call only from lookupBarcode, never in an effect of the page on mount', () => {
    const page = readFileSync('src/pages/intake/ScanPage.tsx', 'utf8');
    expect(page.match(/lookupBarcode\(/g)).toHaveLength(1);
    expect(page).not.toMatch(/useEffect\([^)]*lookupBarcode/s);
    expect(page).not.toMatch(/fetch\(/);
    const det = readFileSync('src/pages/intake/detector.ts', 'utf8');
    expect(det).not.toMatch(/jsdelivr|unpkg|cdn\./i);
    expect(det).toContain('locateFile');
  });
});

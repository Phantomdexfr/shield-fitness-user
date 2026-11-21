import { describe, expect, it } from 'vitest';
import { createBackupRemote, type HttpFetch } from '../../src/data/gym/backupSupabase';
import { decodeChunk } from '../../src/shared/chunks';

type Req = { method: string; url: string; headers: Record<string, string>; body?: unknown };
function http(answer: (r: Req) => { status: number; body?: string | Uint8Array; throws?: boolean }) {
  const calls: Req[] = [];
  const fetchFn: HttpFetch = async (url, init) => {
    const r: Req = { method: init.method, url, headers: init.headers, body: init.body };
    calls.push(r);
    const a = answer(r);
    if (a.throws) throw new TypeError('Failed to fetch');
    const bytes = typeof a.body === 'string' ? new TextEncoder().encode(a.body) : (a.body ?? new Uint8Array());
    return { status: a.status, json: async () => JSON.parse(new TextDecoder().decode(bytes)), text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
  };
  return { calls, fetchFn };
}
const remote = (fetchFn: HttpFetch, token: string | null = 'tok') =>
  createBackupRemote({ url: 'https://x.supabase.co/', anonKey: 'anon', getToken: async () => token, ownerUid: 'u1', memberId: 'm1', shardId: 'B', fetchFn, functions: { url: 'https://core.supabase.co/functions/v1', coreAnon: 'coreanon' } });
const ROW = { key: 'sessions:2026-11', rev: 2, sha256: 'a'.repeat(64), content_sha256: 'b'.repeat(64), bytes: 10, rows: 3, schema: 1, prev_sha256: 'c'.repeat(64), prev_bytes: 9 };
const NEW = { key: 'sessions:2026-11', sha256: 'a'.repeat(64), content_sha256: 'b'.repeat(64), bytes: 10, rows: 3, schema: 1 };

describe('backup Supabase adapter (fake fetch)', () => {
  it('readManifest: filters by key, sends the token, maps the row; empty array = no manifest', async () => {
    const h = http(() => ({ status: 200, body: JSON.stringify([ROW]) }));
    const out = await remote(h.fetchFn).readManifest('sessions:2026-11');
    expect(out.row).toEqual(ROW);
    expect(h.calls[0]!.url).toContain('/rest/v1/backup_manifest?select=');
    expect(h.calls[0]!.url).toContain('key=eq.sessions%3A2026-11');
    expect(h.calls[0]!.headers.Authorization).toBe('Bearer tok');
    expect((await remote(http(() => ({ status: 200, body: '[]' })).fetchFn).readManifest('small')).row).toBeNull();
  });

  it('a 200 with an HTML login page is a network error, never data', async () => {
    const out = await remote(http(() => ({ status: 200, body: '<!doctype html><html>login</html>' })).fetchFn).readManifest('small');
    expect(out.error).toMatchObject({ status: 0, offline: true });
    expect(out.row).toBeNull();
  });

  it('signed out: 401 without sending anything', async () => {
    const h = http(() => ({ status: 200, body: '[]' }));
    expect((await remote(h.fetchFn, null).readManifest('small')).error?.status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });

  it('network failure is offline', async () => {
    expect((await remote(http(() => ({ status: 0, throws: true })).fetchFn).readManifest('small')).error?.offline).toBe(true);
  });

  it('upload: path encoded, no upsert; 409 and a 400 "Duplicate" are success; 413 SFE703 keeps its code', async () => {
    const h = http(() => ({ status: 200, body: '{}' }));
    expect(await remote(h.fetchFn).upload('u1/sessions_2026-11/ab.bin', new Uint8Array([1, 2]))).toEqual({});
    expect(h.calls[0]!.url).toBe('https://x.supabase.co/storage/v1/object/backups/u1/sessions_2026-11/ab.bin');
    expect(h.calls[0]!.headers['x-upsert']).toBe('false');
    expect(await remote(http(() => ({ status: 409, body: '{"error":"Duplicate"}' })).fetchFn).upload('p', new Uint8Array())).toEqual({});
    expect(await remote(http(() => ({ status: 400, body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' })).fetchFn).upload('p', new Uint8Array())).toEqual({});
    const big = await remote(http(() => ({ status: 413, body: '{"message":"SFE703 too big"}' })).fetchFn).upload('p', new Uint8Array());
    expect(big.error).toMatchObject({ status: 413, code: 'SFE703' });
  });

  it('insertManifest: ignore-duplicates; an empty answer means the row already existed (lost race)', async () => {
    const h = http(() => ({ status: 201, body: JSON.stringify([{ ...ROW, rev: 1 }]) }));
    expect(await remote(h.fetchFn).insertManifest(NEW)).toEqual({ inserted: true });
    expect(h.calls[0]!.headers.Prefer).toContain('resolution=ignore-duplicates');
    expect(JSON.parse(h.calls[0]!.body as string)).toMatchObject({ rev: 1, owner_uid: 'u1', member_id: 'm1' });
    expect(await remote(http(() => ({ status: 201, body: '[]' })).fetchFn).insertManifest(NEW)).toEqual({ inserted: false });
  });

  it('updateManifest: filters on rev=eq.<old>, writes rev+1 and prev_*; an empty PATCH answer = lost race', async () => {
    const h = http(() => ({ status: 200, body: JSON.stringify([ROW]) }));
    expect(await remote(h.fetchFn).updateManifest(2, { ...NEW, prev_sha256: 'p'.repeat(64), prev_bytes: 7 })).toEqual({ updated: true });
    expect(h.calls[0]!.method).toBe('PATCH');
    expect(h.calls[0]!.url).toContain('rev=eq.2');
    expect(h.calls[0]!.url).toContain('owner_uid=eq.u1');
    expect(JSON.parse(h.calls[0]!.body as string)).toMatchObject({ rev: 3, prev_sha256: 'p'.repeat(64), prev_bytes: 7 });
    expect(await remote(http(() => ({ status: 200, body: '[]' })).fetchFn).updateManifest(2, { ...NEW, prev_sha256: 'p', prev_bytes: 1 })).toEqual({ updated: false });
  });

  it('SFE704 / SFE706 on a manifest write keep their codes', async () => {
    const r = await remote(http(() => ({ status: 409, body: '{"code":"P0001","message":"SFE704 too many parts"}' })).fetchFn).insertManifest(NEW);
    expect(r.error).toMatchObject({ status: 409, code: 'SFE704' });
  });

  it('download: bytes as they are (HTML included, the decoder rejects it); 404 = no object; 5xx = error', async () => {
    const html = await remote(http(() => ({ status: 200, body: '<html>login</html>' })).fetchFn).download('u1/small/x.bin');
    expect(html.bytes).toBeTruthy();
    const dec = await decodeChunk(html.bytes!, { key: 'small' });
    expect(dec).toEqual({ ok: false, reason: 'html' });
    expect(await remote(http(() => ({ status: 404, body: '{}' })).fetchFn).download('p')).toEqual({});
    expect((await remote(http(() => ({ status: 503, body: 'down' })).fetchFn).download('p')).error?.status).toBe(503);
    const h = http(() => ({ status: 200, body: new Uint8Array([1, 0, 9]) }));
    expect(Array.from((await remote(h.fetchFn).download('u1/small/x.bin')).bytes!)).toEqual([1, 0, 9]);
    expect(h.calls[0]!.url).toContain('/storage/v1/object/authenticated/backups/');
  });

  it('remove: 200 and 404 are fine; ingest posts the shard, key and hash and never throws', async () => {
    expect(await remote(http(() => ({ status: 404, body: '{}' })).fetchFn).remove('p')).toEqual({});
    const h = http(() => ({ status: 200, body: '{"ok":true,"data":{"accepted":true}}' }));
    expect(await remote(h.fetchFn).ingest('small', 'ff')).toEqual({});
    expect(h.calls[0]!.url).toBe('https://core.supabase.co/functions/v1/ingest');
    expect(JSON.parse(h.calls[0]!.body as string)).toEqual({ shard: 'B', key: 'small', sha256: 'ff' });
    const bad = await remote(http(() => ({ status: 422, body: '{"ok":false,"error":{"code":"SFE706"}}' })).fetchFn).ingest('small', 'ff');
    expect(bad.error?.code).toBe('SFE706');
  });
});

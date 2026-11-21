// Phase 76-b1: the real `BackupRemote` over plain fetch (PostgREST for `backup_manifest`, Storage REST for bucket `backups`,
// the `ingest` Edge Function). It does NOT import the Supabase library: the caller hands it the shard URL, the anon key and a
// token getter (the signed-in session of that shard). Only src/data/gym/ may talk to a server (CLAUDE_MUST_READ).
// Shapes follow contract/connected-api.md 1.1.0 "Backups and free accounts". Unproven until it runs on a real Supabase.
import type { RemoteError } from '../../shared/sync';
import { callFunction, type FetchLike } from './functions';
import type { ManifestRow, NewManifest, RestoreRemote } from './backupRemote';

export type HttpFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string | Uint8Array; signal?: AbortSignal }) => Promise<{
  status: number;
  headers?: { get(name: string): string | null };
  json?(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface BackupHttpOptions {
  /** Shard REST base, e.g. `https://abc.supabase.co`. */
  url: string;
  anonKey: string;
  /** The signed-in access token of THIS shard, or null when signed out (every call then fails with 401 and the pass pauses). */
  getToken: () => Promise<string | null>;
  /** The auth uid in this shard (first folder of an object path; `owner_uid` of a manifest row). */
  ownerUid: string;
  /** Train shards: the Shard A member id. Free shards: omit. */
  memberId?: string | null;
  /** `B`, `C`, `F1`...: the shard id the `ingest` function expects. */
  shardId: string;
  /** Core functions URL + anon key, for `ingest`. Omit to skip ingest (it is best effort anyway). */
  functions?: { url: string; coreAnon: string };
  fetchFn?: HttpFetch;
  timeoutMs?: number;
}

const COLS = 'key,rev,sha256,content_sha256,bytes,rows,schema,prev_sha256,prev_bytes';
const TABLE = 'backup_manifest';
const BUCKET = 'backups';

/** An `SFE###` code anywhere in an error body wins (413 `SFE703`, 409 `SFE704`, 422 `SFE706`...). */
function errorFrom(status: number, body: string): RemoteError {
  const sfe = /SFE\d{3}/.exec(body)?.[0];
  let code: string | undefined = sfe;
  let message: string | undefined;
  try {
    const j = JSON.parse(body) as { code?: unknown; message?: unknown; error?: unknown };
    if (!code && typeof j.code === 'string') code = j.code;
    message = typeof j.message === 'string' ? j.message : typeof j.error === 'string' ? j.error : undefined;
  } catch {
    /* not JSON: keep the status only */
  }
  return { status, code, message };
}
const offline = (message: string): RemoteError => ({ status: 0, offline: true, message });

export function createBackupRemote(o: BackupHttpOptions): RestoreRemote {
  const base = o.url.replace(/\/$/, '');
  const doFetch: HttpFetch = o.fetchFn ?? ((u, i) => fetch(u, i as RequestInit) as never);

  async function call(method: string, path: string, init: { headers?: Record<string, string>; body?: string | Uint8Array } = {}): Promise<{ status: number; text: string; res?: Awaited<ReturnType<HttpFetch>> } | { error: RemoteError }> {
    const token = await o.getToken();
    if (!token) return { error: { status: 401, message: 'signed out' } };
    const ctl = typeof AbortController === 'undefined' ? undefined : new AbortController();
    const timer = ctl ? setTimeout(() => ctl.abort(), o.timeoutMs ?? 30_000) : undefined;
    try {
      const res = await doFetch(`${base}${path}`, { method, headers: { apikey: o.anonKey, Authorization: `Bearer ${token}`, ...init.headers }, body: init.body, signal: ctl?.signal });
      return { status: res.status, text: '', res };
    } catch (e) {
      return { error: offline(e instanceof Error ? e.message : 'network') };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** A JSON array answer. A 200 whose body is not JSON (a login page, a captive portal) is a network error, never data. */
  async function jsonRows(r: Awaited<ReturnType<typeof call>>): Promise<{ rows: Record<string, unknown>[] } | { error: RemoteError }> {
    if ('error' in r) return r;
    const text = await r.res!.text();
    if (r.status < 200 || r.status >= 300) return { error: errorFrom(r.status, text) };
    try {
      const j = JSON.parse(text) as unknown;
      if (!Array.isArray(j)) return { error: offline('unexpected body') };
      return { rows: j as Record<string, unknown>[] };
    } catch {
      return { error: offline('not JSON') };
    }
  }

  const toRow = (x: Record<string, unknown>): ManifestRow => ({
    key: String(x.key), rev: Number(x.rev), sha256: String(x.sha256), content_sha256: String(x.content_sha256), bytes: Number(x.bytes),
    rows: Number(x.rows), schema: Number(x.schema),
    prev_sha256: typeof x.prev_sha256 === 'string' ? x.prev_sha256 : null, prev_bytes: typeof x.prev_bytes === 'number' ? x.prev_bytes : null,
  });
  const q = (v: string): string => encodeURIComponent(v);
  const objPath = (p: string): string => p.split('/').map(q).join('/');

  return {
    async listManifests() {
      const r = await jsonRows(await call('GET', `/rest/v1/${TABLE}?select=${COLS}&order=key.asc&limit=1000`)); // SFE704 caps a shard account well below 1000 keys
      if ('error' in r) return { rows: [], error: r.error };
      return { rows: r.rows.map(toRow) };
    },

    async readManifest(key) {
      const r = await jsonRows(await call('GET', `/rest/v1/${TABLE}?select=${COLS}&key=eq.${q(key)}&limit=1`));
      if ('error' in r) return { row: null, error: r.error };
      return { row: r.rows[0] ? toRow(r.rows[0]) : null };
    },

    async upload(path, bytes) {
      const r = await call('POST', `/storage/v1/object/${BUCKET}/${objPath(path)}`, { headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }, body: bytes });
      if ('error' in r) return { error: r.error };
      const text = await r.res!.text();
      // Objects are content-addressed: the same bytes already there (409 / "Duplicate") is success.
      if (r.status === 409 || /duplicate|already exists/i.test(text) && r.status >= 400 && r.status < 500 && r.status !== 413) return {};
      if (r.status >= 200 && r.status < 300) return {};
      return { error: errorFrom(r.status, text) };
    },

    async insertManifest(row: NewManifest) {
      const body = JSON.stringify({ ...row, rev: 1, owner_uid: o.ownerUid, member_id: o.memberId ?? null });
      const r = await jsonRows(await call('POST', `/rest/v1/${TABLE}`, { headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body }));
      if ('error' in r) return { inserted: false, error: r.error };
      return { inserted: r.rows.length > 0 }; // empty answer = the row already existed (lost race)
    },

    async updateManifest(oldRev, row) {
      const body = JSON.stringify({ sha256: row.sha256, content_sha256: row.content_sha256, bytes: row.bytes, rows: row.rows, schema: row.schema, rev: oldRev + 1, prev_sha256: row.prev_sha256, prev_bytes: row.prev_bytes });
      const r = await jsonRows(await call('PATCH', `/rest/v1/${TABLE}?key=eq.${q(row.key)}&owner_uid=eq.${q(o.ownerUid)}&rev=eq.${oldRev}`, { headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body }));
      if ('error' in r) return { updated: false, error: r.error };
      return { updated: r.rows.length > 0 }; // empty answer = someone else moved `rev` first (lost race)
    },

    async download(path) {
      const r = await call('GET', `/storage/v1/object/authenticated/${BUCKET}/${objPath(path)}`);
      if ('error' in r) return { error: r.error };
      if (r.status === 404 || r.status === 400) return {}; // no such object (Storage answers 400 or 404)
      if (r.status < 200 || r.status >= 300) return { error: errorFrom(r.status, await r.res!.text()) };
      // Bytes are returned as they are, HTML included: `decodeChunk` rejects a body that starts with `<` (never data).
      return { bytes: new Uint8Array(await r.res!.arrayBuffer()) };
    },

    async remove(path) {
      const r = await call('DELETE', `/storage/v1/object/${BUCKET}/${objPath(path)}`);
      if ('error' in r) return { error: r.error };
      return r.status >= 200 && r.status < 300 || r.status === 404 ? {} : { error: errorFrom(r.status, await r.res!.text()) };
    },

    async ingest(key, sha256) {
      if (!o.functions) return {};
      const token = await o.getToken();
      if (!token) return { error: { status: 401 } };
      const res = await callFunction({ functions: o.functions.url, core: { url: '', anon: o.functions.coreAnon } } as never, 'ingest', { shard: o.shardId, key, sha256 }, token, ((u, i) => doFetch(u, i as never) as never) as FetchLike);
      return res.ok ? {} : { error: { status: 0, code: res.code, message: res.message } };
    },
  };
}

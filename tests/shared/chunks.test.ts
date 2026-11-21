import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  type Chunk,
  canonicalJson,
  chunkKeyFor,
  decodeChunk,
  encodeChunk,
  fingerprintOf,
  groupIntoChunks,
  id22ToUuid,
  istMonth,
  makeChunk,
  mergeChunk,
  mergeRows,
  planSync,
  restoreOrder,
  sha256Hex,
  toWireRow,
  fromWireRow,
  uuidToId22,
  ChunkError,
} from '../../src/shared/chunks';

const fx = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}`, 'utf8'));
const d1 = fx('chunks_01_diff_table.json');
const d2 = fx('chunks_02_merge.json');
const d3 = fx('chunks_03_encoding.json');
const enc = new TextEncoder();
const stored = (marker: number, body: Uint8Array) => {
  const b = new Uint8Array(body.length + 1);
  b[0] = marker;
  b.set(body, 1);
  return b;
};

describe('chunks_01 diff table', () => {
  for (const c of d1.cases) {
    it(`${c.id}: ${c.why}`, () => {
      expect(planSync({ L: c.L, B: c.B, S: c.S, rowsL: c.rowsL, rowsB: c.rowsB })).toBe(c.expect);
    });
  }
  it('never pushes an empty chunk over a server copy', () => {
    expect(planSync({ L: 'EMPTY', B: 'h1', S: 'h2', rowsL: 0, rowsB: 10 })).toBe('RESTORE');
  });
});

describe('chunks_02 merge', () => {
  for (const c of d2.cases) {
    it(`${c.id}: ${c.why}`, () => {
      const out = mergeRows(c.local, c.server, { key: c.key ?? 'client_id', deleted: 'x', isFinal: (r) => r.st === 'done' && r.e != null });
      expect(out).toEqual(c.result);
    });
  }
  it('merge is symmetric', () => {
    for (const c of d2.cases) {
      const o = { key: c.key ?? 'client_id', deleted: 'x', isFinal: (r: Record<string, unknown>) => r.st === 'done' && r.e != null };
      expect(mergeRows(c.server, c.local, o)).toEqual(mergeRows(c.local, c.server, o));
    }
  });
});

describe('chunks_03 encoding', () => {
  const logical = d3.chunk_logical as Chunk;
  it('uuid <-> id22', () => {
    expect(uuidToId22(d3.uuid_to_id22.uuid)).toBe(d3.uuid_to_id22.id22);
    expect(id22ToUuid(d3.uuid_to_id22.id22)).toBe(d3.uuid_to_id22.uuid);
  });
  it('IST month keys', () => {
    for (const m of d3.ist_month_key) expect(`sessions:${istMonth(Date.parse(m.utc) / 1000)}`).toBe(m.key);
  });
  it('canonical JSON and hashes', async () => {
    expect(canonicalJson(logical)).toBe(d3.canonical_json);
    const e = await encodeChunk(logical, { gzip: false });
    expect(e.bytes[0]).toBe(0);
    expect(e.bytes.length).toBe(d3.stored_bytes_raw_form.total_bytes);
    expect(e.sha256).toBe(d3.stored_bytes_raw_form.sha256);
    expect(e.contentSha256).toBe(d3.stored_bytes_raw_form.content_sha256);
    expect(await fingerprintOf(logical)).toBe(d3.stored_bytes_raw_form.content_sha256);
  });
  it('gzip round trip keeps the content fingerprint', async () => {
    const e = await encodeChunk(logical);
    expect(e.gzip).toBe(true);
    const r = await decodeChunk(e.bytes, { key: logical.key, sha256: e.sha256 });
    expect(r.ok && r.contentSha256).toBe(d3.stored_bytes_raw_form.content_sha256);
    expect(r.ok && r.chunk.rows).toBe(3);
  });
  it('tamper cases', async () => {
    const raw = (await encodeChunk(logical, { gzip: false })).bytes;
    const k = logical.key;
    expect(await decodeChunk(stored(2, raw.subarray(1)), { key: k })).toEqual({ ok: false, reason: 'unknown_marker' });
    expect(await decodeChunk(enc.encode('<html>login</html>'), { key: k })).toEqual({ ok: false, reason: 'html' });
    expect(await decodeChunk(raw, { key: k, sha256: 'ab'.repeat(32) })).toEqual({ ok: false, reason: 'hash_mismatch' });
    const v2 = { ...logical, schema: 2 };
    expect(await decodeChunk((await encodeChunk(v2, { gzip: false })).bytes, { key: k })).toEqual({ ok: false, reason: 'too_new' });
    expect(await decodeChunk(raw, { key: 'sessions:2026-10' })).toEqual({ ok: false, reason: 'key_mismatch' });
  });
  it('truncated gzip, bad rows count, empty, oversize and zip bomb are rejected', async () => {
    const e = await encodeChunk(logical);
    expect((await decodeChunk(e.bytes.subarray(0, 12), { key: logical.key })).ok).toBe(false);
    const bad = { ...logical, rows: 99 };
    expect(await decodeChunk((await encodeChunk(bad, { gzip: false })).bytes, { key: logical.key })).toEqual({ ok: false, reason: 'rows_mismatch' });
    expect(await decodeChunk(new Uint8Array(0), { key: 'small' })).toEqual({ ok: false, reason: 'empty' });
    expect(await decodeChunk(new Uint8Array(600 * 1024), { key: 'small' })).toEqual({ ok: false, reason: 'too_large' });
    const bomb = new Uint8Array(9 * 1024 * 1024).fill(32);
    const z = await new Response(new Blob([bomb]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    expect(await decodeChunk(stored(1, new Uint8Array(z)), { key: 'small' })).toEqual({ ok: false, reason: 'bad_gzip' });
  });
});

describe('wire rows, keys, grouping, merge of chunks', () => {
  const u = '11111111-2222-4333-8444-555555555555';
  it('toWireRow / fromWireRow', () => {
    const w = toWireRow('workout_sessions', { client_id: u, started_at: 1793840400000, ended_at: '2026-11-05T02:05:00Z', status: 'done', extra: { b: 1, a: 2 }, u: 5, deleted_at: null });
    expect(w.client_id).toBe('ERERESIiQzOERFVVVVVVVQ');
    expect(w.started_at).toBe(1793840400);
    expect(JSON.stringify(w.extra)).toBe('{"a":2,"b":1}');
    expect(fromWireRow('workout_sessions', w).client_id).toBe(u);
    expect(fromWireRow('workout_sessions', w).started_at).toBe(1793840400000);
    expect(() => toWireRow('routines', { client_id: 'abcdefghijklmnopqrstuv', d: {}, u: 1 })).toThrow(ChunkError);
  });
  it('sets go with their session, orphans are reported', () => {
    const s = toWireRow('workout_sessions', { client_id: 's1', started_at: Date.parse('2026-10-31T19:00:00Z'), u: 1 });
    const set = toWireRow('workout_sets', { client_id: 's1:0:0', session_id: 's1', u: 1 });
    const lost = toWireRow('workout_sets', { client_id: 'x:0:0', session_id: 'nope', u: 1 });
    const g = groupIntoChunks({ workout_sessions: [s], workout_sets: [set, lost] });
    expect(g.chunks.map((c) => c.key)).toEqual(['sessions:2026-11']);
    expect(g.chunks[0]!.rows).toBe(2);
    expect(g.orphans).toHaveLength(1);
    expect(chunkKeyFor('body_stats', { measured_on: '2026-11-05' })).toBe('body:2026-11');
    expect(chunkKeyFor('routines', {})).toBe('small');
  });
  it('mergeChunk: tombstone wins, tombstones count as rows, unknown columns kept, merge equal to one side is no new revision', () => {
    const a = makeChunk('small', { routines: [toWireRow('routines', { client_id: 'r1', d: { n: 1 }, u: 100, deleted_at: null })] });
    const b = makeChunk('small', { routines: [toWireRow('routines', { client_id: 'r1', d: { n: 2 }, u: 50, deleted_at: 60000 })] });
    const m = mergeChunk(a, b);
    expect(m.chunk.rows).toBe(1);
    expect(rowsDeleted(m.chunk)).toBe(true);
    expect(m.changedRemote).toBe(false);
    expect(m.changedLocal).toBe(true);
    const x = JSON.parse(JSON.stringify(b)) as Chunk;
    x.t.routines!.c.push('zzz');
    x.t.routines!.r[0]!.push('keep');
    expect(mergeChunk(a, x).chunk.t.routines!.c).toContain('zzz');
    expect(mergeChunk(a, a).changedLocal).toBe(false);
  });
  it('restoreOrder: newest month first, then small, then older', () => {
    expect(restoreOrder(['sessions:2026-09', 'small', 'body:2026-11', 'sessions:2026-11', 'sessions:2026-10'])).toEqual(['body:2026-11', 'sessions:2026-11', 'small', 'sessions:2026-10', 'sessions:2026-09']);
  });
});
function rowsDeleted(c: Chunk): boolean {
  const t = c.t.routines!;
  return t.r[0]![t.c.indexOf('deleted_at')] != null;
}

describe('speed: 1,000 sessions', () => {
  it('group, encode, decode, merge in a few seconds', async () => {
    const sessions: Record<string, unknown>[] = [];
    const sets: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) {
      const sid = `sess-${String(i).padStart(5, '0')}`;
      const at = Date.parse('2025-01-01T05:00:00Z') + i * 20 * 3600_000;
      sessions.push(toWireRow('workout_sessions', { client_id: sid, started_at: at, ended_at: at + 3600_000, status: 'done', extra: { items: [] }, u: at }));
      for (let k = 0; k < 24; k++) sets.push(toWireRow('workout_sets', { client_id: `${sid}:${k % 6}:${k}`, session_id: sid, exercise_ref: 'barbell-bench-press', set_no: k, weight_kg: 60 + k, reps: 8, extra: { o: k % 6, i: k }, u: at }));
    }
    const t0 = performance.now();
    const g = groupIntoChunks({ workout_sessions: sessions, workout_sets: sets });
    let bytes = 0;
    for (const c of g.chunks) {
      const e = await encodeChunk(c);
      bytes += e.bytes.length;
      const r = await decodeChunk(e.bytes, { key: c.key, sha256: e.sha256 });
      expect(r.ok).toBe(true);
      expect(mergeChunk(c, c).changedLocal).toBe(false);
    }
    const ms = performance.now() - t0;
    console.log(`1000 sessions: ${g.chunks.length} chunks, ${bytes} stored bytes, ${Math.round(ms)} ms`);
    expect(g.orphans).toHaveLength(0);
    expect(ms).toBeLessThan(8000);
    expect(await sha256Hex(enc.encode('a'))).toHaveLength(64);
  });
});

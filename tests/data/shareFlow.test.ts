import { describe, expect, it } from 'vitest';
import { RelayError, relayAvailable, relayConfig, setGymRelay, shareStatus, type RelayConfig } from '../../src/data/relay/client';
import { cancelShare, pollShare, receivePlan, startShare, type FlowEnv } from '../../src/data/relay/shareFlow';
import { buildEnvelope, type PlanEnvelope } from '../../src/shared/planShare/envelope';
import { secretToCode } from '../../src/shared/planShare/secret';
import type { Routine } from '../../src/shared/routine';

const CFG: RelayConfig = { url: 'https://relay.example/functions/v1/', anon: 'anon-key' };

/** An in-memory relay that follows contract/plan-share.md section 4 and records every request. */
function mockRelay() {
  const rows = new Map<string, { ct: string; expires: number }>();
  const log: { name: string; body: string; headers: Record<string, string> }[] = [];
  const st = { now: 1_000_000, rate: false, full: false, down: false };
  const respond = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (url: string, init: RequestInit) => {
    if (st.down) throw new TypeError('network');
    const name = String(url).split('/').pop() as string;
    log.push({ name, body: String(init.body), headers: init.headers as Record<string, string> });
    for (const [k, v] of rows) if (v.expires < st.now) rows.delete(k);
    if (st.rate) return respond(429, { code: 'rate_limited', message: 'x' });
    const b = JSON.parse(String(init.body)) as { id: string; ct?: string };
    if (name === 'share_create') {
      if (st.full) return respond(503, { code: 'relay_full', message: 'x' });
      if (rows.has(b.id)) return respond(400, { code: 'bad_request', message: 'dup' });
      rows.set(b.id, { ct: b.ct as string, expires: st.now + 180_000 });
      return respond(200, { expiresAt: new Date(st.now + 180_000).toISOString() });
    }
    if (name === 'share_status') {
      const r = rows.get(b.id);
      return respond(200, r ? { state: 'waiting', secondsLeft: Math.ceil((r.expires - st.now) / 1000) } : { state: 'gone' });
    }
    if (name === 'share_claim') {
      const r = rows.get(b.id);
      if (!r) return respond(404, { code: 'not_found', message: 'x' });
      rows.delete(b.id);
      return respond(200, { ct: r.ct });
    }
    if (name === 'share_cancel') {
      rows.delete(b.id);
      return respond(200, { ok: true });
    }
    return respond(404, { code: 'not_found', message: 'x' });
  }) as unknown as typeof fetch;
  return { rows, log, st, fetchImpl };
}

let seed = 1;
const random = (n: number) => Uint8Array.from({ length: n }, () => ((seed = (seed * 48271) % 2147483647), seed & 255));
const mk = (m: ReturnType<typeof mockRelay>, major = 1): FlowEnv => ({ relay: { fetch: m.fetchImpl, config: CFG }, random, contractMajor: major });

const routine = { id: 'r1', name: 'Plan A', source: 'mine', daysPerWeek: 2, weekdays: [], splitStyle: 'custom', active: true, days: [{ id: 'd1', name: 'Upper', targetMuscles: [], items: [{ ref: { kind: 'lib', slug: 'lat-pulldown' }, sets: 3, repMin: 8, repMax: 12, restSec: 90 }] }] } as unknown as Routine;
const envelope = (): PlanEnvelope => buildEnvelope({ routine, customs: [], createdAt: '2026-11-20T00:00:00.000Z', contractMajor: 1, from: 'Asha' }).envelope;
const instant = { sleep: async () => undefined };

describe('relay client', () => {
  it('makes no request when nothing is called (no network before a tap)', () => {
    const m = mockRelay();
    mk(m);
    expect(m.log).toHaveLength(0);
  });
  it('relay missing -> not configured, feature hidden, nothing sent', async () => {
    setGymRelay(null);
    expect(relayAvailable()).toBe(relayConfig() !== null); // no VITE_SHARE_RELAY_URL in the test env
    expect(relayConfig()).toBeNull();
    const m = mockRelay();
    await expect(shareStatus('x', { fetch: m.fetchImpl, config: null })).rejects.toMatchObject({ code: 'not_configured' });
    const r = await startShare({ ...mk(m), relay: { fetch: m.fetchImpl, config: null } }, envelope());
    expect(r).toEqual({ ok: false, error: 'not_configured' });
    expect(m.log).toHaveLength(0);
  });
  it('a gym relay replaces the default and is cleared by null', () => {
    setGymRelay({ url: 'https://gym.example/f', anon: 'a' });
    expect(relayConfig()?.url).toBe('https://gym.example/f');
    expect(relayAvailable()).toBe(true);
    setGymRelay(null);
    expect(relayConfig()).toBeNull();
  });
  it('sends the anon key and posts to <url>/<function> without a double slash', async () => {
    const m = mockRelay();
    await startShare(mk(m), envelope());
    expect(m.log[0]?.name).toBe('share_create');
    expect(m.log[0]?.headers.apikey).toBe('anon-key');
  });
  it('maps network failure to offline and error codes to RelayError', async () => {
    const m = mockRelay();
    m.st.down = true;
    await expect(shareStatus('x', mk(m).relay)).rejects.toBeInstanceOf(RelayError);
    await expect(shareStatus('x', mk(m).relay)).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('share and receive against a mock relay', () => {
  it('create -> receive -> delivered; the row is gone after the claim', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    expect(m.rows.size).toBe(1);
    expect(s.value.expiresAtMs - m.st.now).toBe(180_000);
    const got = await receivePlan(e, s.value.secret);
    expect(got).toMatchObject({ ok: true });
    if (got.ok) expect(got.value.routine.name).toBe('Plan A');
    expect(m.rows.size).toBe(0);
    const poll = await pollShare(s.value.id, e.relay, { ...instant, now: () => m.st.now, expiresAtMs: s.value.expiresAtMs, isCancelled: () => false });
    expect(poll).toBe('delivered');
  });
  it('a second claim of the same code fails (single use)', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    expect((await receivePlan(e, s.value.secret)).ok).toBe(true);
    expect(await receivePlan(e, s.value.secret)).toEqual({ ok: false, error: 'gone' });
  });
  it('after 3 minutes the claim fails and the poll says expired', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    m.st.now += 181_000;
    expect(await receivePlan(e, s.value.secret)).toEqual({ ok: false, error: 'gone' });
    expect(await pollShare(s.value.id, e.relay, { ...instant, now: () => m.st.now, expiresAtMs: s.value.expiresAtMs, isCancelled: () => false })).toBe('expired');
  });
  it('cancel deletes the row, the poll reports cancelled and a later claim fails', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    await cancelShare(s.value.id, e.relay);
    expect(m.rows.size).toBe(0);
    expect(await pollShare(s.value.id, e.relay, { ...instant, now: () => m.st.now, expiresAtMs: s.value.expiresAtMs, isCancelled: () => true })).toBe('cancelled');
    expect(await receivePlan(e, s.value.secret)).toEqual({ ok: false, error: 'gone' });
  });
  it('polls every 3 s at most 60 times, then expired', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    const waits: number[] = [];
    const end = await pollShare(s.value.id, e.relay, { sleep: async (ms) => void waits.push(ms), now: () => m.st.now, expiresAtMs: s.value.expiresAtMs, isCancelled: () => false });
    expect(end).toBe('expired');
    expect(waits).toHaveLength(60);
    expect(new Set(waits)).toEqual(new Set([3000]));
    expect(m.log.filter((l) => l.name === 'share_status')).toHaveLength(60);
  });
  it('three failed polls in a row end with error; one failure is retried', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    m.st.down = true;
    expect(await pollShare(s.value.id, e.relay, { ...instant, now: () => m.st.now, expiresAtMs: s.value.expiresAtMs, isCancelled: () => false })).toBe('error');
  });
  it('rate limited and relay full are reported on both sides', async () => {
    const m = mockRelay();
    m.st.rate = true;
    expect(await startShare(mk(m), envelope())).toEqual({ ok: false, error: 'rate_limited' });
    expect(await receivePlan(mk(m), random(10))).toEqual({ ok: false, error: 'rate_limited' });
    m.st.rate = false;
    m.st.full = true;
    expect(await startShare(mk(m), envelope())).toEqual({ ok: false, error: 'relay_full' });
  });
  it('offline on receive says offline, and the claim did not consume anything', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    m.st.down = true;
    expect(await receivePlan(e, s.value.secret)).toEqual({ ok: false, error: 'offline' });
    m.st.down = false;
    expect((await receivePlan(e, s.value.secret)).ok).toBe(true);
  });
  it('a wrong code finds nothing (gone); a newer plan is too_new; garbage ciphertext is corrupt', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    expect(await receivePlan(e, random(10))).toEqual({ ok: false, error: 'gone' });
    expect(await receivePlan(mk(m, 0), s.value.secret)).toEqual({ ok: false, error: 'too_new' });
    const s2 = await startShare(e, envelope());
    if (!s2.ok) throw new Error('start');
    m.rows.get(s2.value.id)!.ct = 'AAAA';
    expect(await receivePlan(e, s2.value.secret)).toEqual({ ok: false, error: 'corrupt' });
  });
  it('the secret never appears in any request, in any encoding', async () => {
    const m = mockRelay();
    const e = mk(m);
    const s = await startShare(e, envelope());
    if (!s.ok) throw new Error('start');
    await receivePlan(e, s.value.secret);
    await cancelShare(s.value.id, e.relay);
    await pollShare(s.value.id, e.relay, { ...instant, now: () => m.st.now, expiresAtMs: s.value.expiresAtMs, isCancelled: () => false });
    const code = secretToCode(s.value.secret);
    const forms = [code, code.replace(/-/g, ''), code.toLowerCase(), code.replace(/-/g, '').toLowerCase(), Buffer.from(s.value.secret).toString('hex'), Buffer.from(s.value.secret).toString('base64')];
    const all = m.log.map((l) => `${l.name} ${l.body} ${JSON.stringify(l.headers)}`).join('\n');
    for (const f of forms) expect(all).not.toContain(f);
    expect(m.log.every((l) => /^\{"id":"[0-9a-f]{32}"(,"ct":"[A-Za-z0-9+/=]+")?\}$/.test(l.body))).toBe(true);
    expect(all).not.toContain('Plan A');
  });
  it('an oversized plan is refused on the device before any request', async () => {
    const m = mockRelay();
    const big = { ...envelope(), note: undefined } as PlanEnvelope;
    big.routine = { ...big.routine, name: 'x'.repeat(70000) };
    expect(await startShare(mk(m), big)).toEqual({ ok: false, error: 'too_large' });
    expect(m.log).toHaveLength(0);
  });
});

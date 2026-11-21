// Plan-share flow (Phase 42): glue between the pure planShare modules and the relay client. No storage, no UI.
// Every function runs only when called (the screens call them on a tap); nothing is sent in the background.

import type { Result } from '../../shared/validators';
import { generateSecret, type SecretError } from '../../shared/planShare/secret';
import { decryptEnvelope, deriveId, encryptEnvelope, fromBase64, toBase64 } from '../../shared/planShare/crypto';
import type { PlanEnvelope } from '../../shared/planShare/envelope';
import { RelayError, shareCancel, shareClaim, shareCreate, shareStatus, type RelayDeps, type RelayErrorCode } from './client';

export interface FlowEnv {
  relay: RelayDeps;
  random: (n: number) => Uint8Array;
  contractMajor: number;
}

export const POLL_MS = 3000;
export const POLL_MAX = 60;

export type StartError = 'too_large' | 'offline' | 'rate_limited' | 'relay_full' | 'not_configured' | 'server';
export interface Started {
  secret: Uint8Array;
  id: string;
  expiresAtMs: number;
}

const startCode = (c: RelayErrorCode): StartError => (c === 'too_large' || c === 'offline' || c === 'rate_limited' || c === 'relay_full' || c === 'not_configured' ? c : 'server');

/** Share tap: new secret, encrypt on the device, upload `{id, ct}` only. The relay (not the client) sets the 3-minute expiry. */
export async function startShare(env: FlowEnv, envelope: PlanEnvelope): Promise<Result<Started, StartError>> {
  const secret = generateSecret(env.random);
  const enc = await encryptEnvelope(envelope, secret, { iv: env.random(12) });
  if (!enc.ok) return { ok: false, error: 'too_large' };
  const id = await deriveId(secret);
  try {
    const r = await shareCreate(id, toBase64(enc.value), env.relay);
    const at = Date.parse(r.expiresAt);
    if (Number.isNaN(at)) return { ok: false, error: 'server' };
    return { ok: true, value: { secret, id, expiresAtMs: at } };
  } catch (e) {
    return { ok: false, error: startCode(e instanceof RelayError ? e.code : 'server') };
  }
}

export type PollEnd = 'delivered' | 'expired' | 'cancelled' | 'error';

export interface PollOptions {
  /** Wait between polls; tests pass an instant one. */
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  expiresAtMs: number;
  isCancelled: () => boolean;
  intervalMs?: number;
  max?: number;
}

/**
 * Poll `share_status` every 3 s, at most 60 times. `gone` before the expiry and no cancel = Delivered. Reaching the expiry or the
 * poll limit = Expired. Three network failures in a row = error (the screen then offers Cancel / Share again).
 */
export async function pollShare(id: string, relay: RelayDeps, o: PollOptions): Promise<PollEnd> {
  const every = o.intervalMs ?? POLL_MS;
  let fails = 0;
  for (let i = 0; i < (o.max ?? POLL_MAX); i += 1) {
    if (o.isCancelled()) return 'cancelled';
    if (o.now() >= o.expiresAtMs) return 'expired';
    try {
      const s = await shareStatus(id, relay);
      fails = 0;
      if (o.isCancelled()) return 'cancelled';
      if (s.state === 'gone') return o.now() < o.expiresAtMs ? 'delivered' : 'expired';
    } catch {
      fails += 1;
      if (fails >= 3) return 'error';
    }
    await o.sleep(every);
  }
  return 'expired';
}

/** Cancel tap. Errors are swallowed: the row is purged at 3 minutes anyway. */
export async function cancelShare(id: string, relay: RelayDeps): Promise<void> {
  try {
    await shareCancel(id, relay);
  } catch {
    /* it expires by itself */
  }
}

export type ReceiveError = 'offline' | 'gone' | 'rate_limited' | 'corrupt' | 'too_new' | 'too_large' | 'not_configured' | 'server';

/** Receive tap: derive id, claim (single use: the relay deletes the row), decrypt, validate. A second call with the same secret returns `gone`. */
export async function receivePlan(env: FlowEnv, secret: Uint8Array): Promise<Result<PlanEnvelope, ReceiveError>> {
  const id = await deriveId(secret);
  let ct: Uint8Array | null;
  try {
    ct = fromBase64((await shareClaim(id, env.relay)).ct);
  } catch (e) {
    const code = e instanceof RelayError ? e.code : 'server';
    return { ok: false, error: code === 'not_found' ? 'gone' : code === 'offline' || code === 'rate_limited' || code === 'not_configured' || code === 'too_large' ? code : 'server' };
  }
  if (!ct) return { ok: false, error: 'corrupt' };
  const d = await decryptEnvelope(ct, secret, env.contractMajor);
  if (d.ok) return d;
  return { ok: false, error: d.error === 'too_new' ? 'too_new' : d.error === 'too_large' ? 'too_large' : 'corrupt' };
}

export type { SecretError };

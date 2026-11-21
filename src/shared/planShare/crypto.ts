// Plan-share crypto (Phase 41). WebCrypto only; no clock, no storage. Spec: contract/plan-share.md sections 2-3.
// id = hex(SHA-256("sfplan/id/v1" || secret))[0..32]; key = HKDF-SHA256(secret, salt "sfplan/salt/v1", info "sfplan/aes/v1");
// AES-256-GCM, 12-byte IV, stored as iv || ciphertext+tag. Plaintext stream = 1 flag byte (0x01 gzip / 0x00 raw) + JSON.

import type { Result } from '../validators';
import { parseEnvelope, type PlanEnvelope } from './envelope';

export const PLAINTEXT_CAP = 64 * 1024;
export const CIPHERTEXT_CAP = 48 * 1024;
export const IV_BYTES = 12;
const enc = new TextEncoder();

export type CryptoError = 'too_large' | 'corrupt' | 'secret_invalid';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function toHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** What the relay sees: 32 hex characters that cannot be turned back into the secret. */
export async function deriveId(secret: Uint8Array): Promise<string> {
  const prefix = enc.encode('sfplan/id/v1');
  const all = new Uint8Array(prefix.length + secret.length);
  all.set(prefix, 0);
  all.set(secret, prefix.length);
  return toHex(new Uint8Array(await subtle().digest('SHA-256', buf(all)))).slice(0, 32);
}

export async function deriveKey(secret: Uint8Array): Promise<CryptoKey> {
  const ikm = await subtle().importKey('raw', buf(secret), 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(enc.encode('sfplan/salt/v1')), info: buf(enc.encode('sfplan/aes/v1')) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const hasStreams = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array | null> {
  const writer = t.writable.getWriter();
  void writer.write(data as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch((e) => void reader.cancel(e).catch(() => undefined));
  const reader = t.readable.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface EncryptOptions {
  /** 12 random bytes from the caller. */
  iv: Uint8Array;
  /** Default true; falls back to raw when CompressionStream is missing. */
  gzip?: boolean;
}

/** Envelope -> iv || ciphertext+tag. `too_large` when the plaintext passes 64 KB or the result passes 48 KB. */
export async function encryptEnvelope(envelope: PlanEnvelope, secret: Uint8Array, opts: EncryptOptions): Promise<Result<Uint8Array, CryptoError>> {
  if (opts.iv.length !== IV_BYTES) return { ok: false, error: 'corrupt' };
  const json = enc.encode(JSON.stringify(envelope));
  if (json.length > PLAINTEXT_CAP) return { ok: false, error: 'too_large' };
  let flag = 0;
  let body: Uint8Array = json;
  if (opts.gzip !== false && hasStreams()) {
    const z = await pipe(json, new CompressionStream('gzip'), PLAINTEXT_CAP + 1024);
    if (z) {
      flag = 1;
      body = z;
    }
  }
  const plain = new Uint8Array(body.length + 1);
  plain[0] = flag;
  plain.set(body, 1);
  const key = await deriveKey(secret);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(opts.iv) }, key, buf(plain)));
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(opts.iv, 0);
  out.set(ct, IV_BYTES);
  if (out.length > CIPHERTEXT_CAP) return { ok: false, error: 'too_large' };
  return { ok: true, value: out };
}

export type DecryptError = CryptoError | 'too_new' | 'invalid';

/** iv || ciphertext+tag -> envelope. Wrong secret, a flipped bit, bad gzip or a bad shape all come back as `corrupt`. */
export async function decryptEnvelope(ct: Uint8Array, secret: Uint8Array, supportedMajor: number): Promise<Result<PlanEnvelope, DecryptError>> {
  if (ct.length > CIPHERTEXT_CAP) return { ok: false, error: 'too_large' };
  if (ct.length < IV_BYTES + 17) return { ok: false, error: 'corrupt' };
  let plain: Uint8Array;
  try {
    const key = await deriveKey(secret);
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: buf(ct.subarray(0, IV_BYTES)) }, key, buf(ct.subarray(IV_BYTES))));
  } catch {
    return { ok: false, error: 'corrupt' };
  }
  let body = plain.subarray(1);
  if (plain[0] === 1) {
    if (!hasStreams()) return { ok: false, error: 'corrupt' };
    const raw = await pipe(body, new DecompressionStream('gzip'), PLAINTEXT_CAP);
    if (!raw) return { ok: false, error: 'corrupt' };
    body = raw;
  } else if (plain[0] !== 0) return { ok: false, error: 'corrupt' };
  if (body.length > PLAINTEXT_CAP) return { ok: false, error: 'too_large' };
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return { ok: false, error: 'corrupt' };
  }
  const parsed = parseEnvelope(json, supportedMajor);
  return parsed.ok ? parsed : { ok: false, error: parsed.error === 'too_new' ? 'too_new' : 'corrupt' };
}

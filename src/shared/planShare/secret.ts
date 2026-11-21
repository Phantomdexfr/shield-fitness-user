// Plan-share secret (Phase 41). Pure: random bytes come from the caller. Spec: contract/plan-share.md section 2.
// 80 random bits, shown as 16 Crockford base32 characters grouped XXXX-XXXX-XXXX-XXXX.

import type { Result } from '../validators';

export const SECRET_BYTES = 10;
export const SECRET_CHARS = 16;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 10 bytes -> 16 characters, 5 bits each, grouped in fours. */
export function secretToCode(bytes: Uint8Array): string {
  if (bytes.length !== SECRET_BYTES) throw new Error('secret must be 10 bytes');
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return out.match(/.{4}/g)!.join('-');
}

/** New secret from the caller's random source (`crypto.getRandomValues` in the app, a fixed array in tests). */
export function generateSecret(randomBytes: (n: number) => Uint8Array): Uint8Array {
  const b = randomBytes(SECRET_BYTES);
  if (b.length !== SECRET_BYTES) throw new Error('random source returned the wrong length');
  return Uint8Array.from(b);
}

export type SecretError = 'secret_length' | 'secret_chars';

/** Typed code -> bytes. Case-insensitive; spaces and hyphens ignored; I and L read as 1, O as 0. */
export function codeToSecret(input: string): Result<Uint8Array, SecretError> {
  const s = input.toUpperCase().replace(/[\s-]+/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (s.length !== SECRET_CHARS) return { ok: false, error: 'secret_length' };
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { ok: false, error: 'secret_chars' };
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >> (bits - 8)) & 255);
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  return { ok: true, value: Uint8Array.from(out) };
}

/** The secret from a share link (`https://host/base/share#CODE`) or a bare code. Only the fragment is read. */
export function secretFromLink(input: string): Result<Uint8Array, SecretError> {
  const t = input.trim();
  const i = t.indexOf('#');
  return codeToSecret(i >= 0 ? t.slice(i + 1) : t);
}

/** `https://<app-base>/share#<secret>`: the secret rides in the fragment, which no server ever receives. */
export function shareLink(appBase: string, secret: Uint8Array): string {
  return `${appBase.replace(/\/+$/, '')}/share#${secretToCode(secret)}`;
}

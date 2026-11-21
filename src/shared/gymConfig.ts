// Gym config (Phase 66): parse and validate the public `SFCFG1` document (contract/gym-config.md, docs/GYM_CONNECTION.md section 2).
// Pure: no DOM, no network, no clock. A scanned or pasted config is untrusted; only the first failing check is reported,
// and a failure never carries the input back (so a wrong key can never end up in a log or a screen).

import { z } from 'zod';

export const GYM_CONFIG_PREFIX = 'SFCFG1.';
export const MAX_CONFIG_BYTES = 4096;
/** The contract MAJOR this app speaks (contract/VERSION 1.0.0). */
export const APP_CONTRACT_MAJOR = 1;

export type GymConfigCode = 'GCF_PREFIX' | 'GCF_DECODE' | 'GCF_SCHEMA' | 'GCF_VERSION' | 'GCF_HOST' | 'GCF_MAJOR' | 'GCF_SECRET';

export interface GymEndpoint {
  url: string;
  anon: string;
}
export interface GymTrainEndpoint extends GymEndpoint {
  id: string;
}
export interface GymConfig {
  v: 1;
  name: string;
  contract: string;
  core: GymEndpoint;
  train: GymTrainEndpoint[];
  functions: string;
  issued: string;
}

export type GymConfigResult = { ok: true; config: GymConfig; host: string } | { ok: false; code: GymConfigCode; allowListMiss?: boolean };

export interface GymConfigOptions {
  /** Build-time `ALLOWED_GYM_HOSTS`; empty or missing = any `.supabase.co` host. */
  allowedHosts?: readonly string[];
  /** Defaults to the app's own contract major. */
  contractMajor?: number;
}

const endpoint = z.object({ url: z.string().min(1).max(200), anon: z.string().min(8).max(2000) });
const schema = z.object({
  v: z.number().int(),
  name: z.string().trim().min(1).max(60),
  contract: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
  core: endpoint,
  train: z.array(endpoint.extend({ id: z.string().min(1).max(20) })).min(1).max(8),
  functions: z.string().min(1).max(200),
  issued: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Plain words for each code (docs/GYM_CONNECTION.md section 2). The page turns a code into one of these. */
export const GYM_CONFIG_MESSAGES: Record<GymConfigCode, string> = {
  GCF_PREFIX: "That code doesn't look right. Ask your gym for a new one.",
  GCF_DECODE: "That code doesn't look right. Ask your gym for a new one.",
  GCF_SCHEMA: 'That code is from a different kind of app.',
  GCF_VERSION: 'This code needs a newer version of the app.',
  GCF_HOST: "This code points to a server we don't trust.",
  GCF_MAJOR: 'This gym needs a newer version of the app.',
  GCF_SECRET: 'That code contains something it should not. Do not use it. Tell your gym.',
};
export const GYM_ALLOWLIST_MESSAGE = 'This app is set up for a specific gym and this code is for another one.';

function fromBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Cut the `SFCFG1.<payload>` part out of pasted text, a `/connect#SFCFG1.` link or a QR read. Spaces and line breaks are ignored. */
export function extractPayload(text: string): string | null {
  const t = text.replace(/\s+/g, '');
  const i = t.indexOf(GYM_CONFIG_PREFIX);
  if (i < 0) return null;
  // Only a bare code or a link whose fragment starts with it (never text that merely contains the prefix somewhere).
  if (i !== 0 && !(/^https?:\/\//i.test(t) && t.slice(0, i).endsWith('#'))) return null;
  const rest = t.slice(i + GYM_CONFIG_PREFIX.length);
  return rest.length ? rest : null;
}

function hostOf(raw: string, kind: 'base' | 'functions'): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) return null;
  if (!u.hostname.endsWith('.supabase.co') || u.hostname.length <= '.supabase.co'.length) return null;
  const path = u.pathname.replace(/\/+$/, '');
  if (kind === 'base' ? path !== '' : path !== '/functions/v1') return null;
  return u.hostname;
}

/** `anon`/publishable keys pass; a service-role JWT or a `sb_secret_` key does not. Anything else readable as a JWT must say role "anon". */
function isPublicKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return false;
  if (key.startsWith('sb_publishable_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  const json = fromBase64Url(parts[1]!);
  if (!json) return false;
  try {
    const p = JSON.parse(json) as { role?: unknown };
    return p.role === 'anon';
  } catch {
    return false;
  }
}

export function parseGymConfig(text: string, opts: GymConfigOptions = {}): GymConfigResult {
  const payload = extractPayload(text);
  if (!payload) return { ok: false, code: 'GCF_PREFIX' };
  const json = fromBase64Url(payload);
  if (!json || new TextEncoder().encode(json).length > MAX_CONFIG_BYTES) return { ok: false, code: 'GCF_DECODE' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, code: 'GCF_DECODE' };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'GCF_SCHEMA' };
  const c = parsed.data;
  if (c.v !== 1) return { ok: false, code: 'GCF_VERSION' };

  const coreHost = hostOf(c.core.url, 'base');
  const trainHosts = c.train.map((x) => hostOf(x.url, 'base'));
  const fnHost = hostOf(c.functions, 'functions');
  if (!coreHost || !fnHost || trainHosts.some((h) => !h) || fnHost !== coreHost) return { ok: false, code: 'GCF_HOST' };
  const allow = (opts.allowedHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allow.length && ![coreHost, ...(trainHosts as string[])].every((h) => allow.includes(h))) return { ok: false, code: 'GCF_HOST', allowListMiss: true };

  const major = Number(c.contract.split('.')[0]);
  if (major !== (opts.contractMajor ?? APP_CONTRACT_MAJOR)) return { ok: false, code: 'GCF_MAJOR' };
  if (![c.core.anon, ...c.train.map((x) => x.anon)].every(isPublicKey)) return { ok: false, code: 'GCF_SECRET' };

  return {
    ok: true,
    host: coreHost,
    config: {
      v: 1,
      name: c.name,
      contract: c.contract,
      core: { url: c.core.url.replace(/\/+$/, ''), anon: c.core.anon },
      train: c.train.map((x) => ({ id: x.id, url: x.url.replace(/\/+$/, ''), anon: x.anon })),
      functions: c.functions.replace(/\/+$/, ''),
      issued: c.issued,
    },
  };
}

/** The sentence for a failed result. */
export function gymConfigMessage(r: Extract<GymConfigResult, { ok: false }>): string {
  return r.allowListMiss ? GYM_ALLOWLIST_MESSAGE : GYM_CONFIG_MESSAGES[r.code];
}

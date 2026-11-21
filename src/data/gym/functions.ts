// Edge Function calls (contract/connected-api.md "Edge Functions"). POST only, JSON, the frozen envelope.
// The password goes in the request body of change-password only; nothing is stored here.

import type { GymConfig } from '../../shared/gymConfig';

export type FnResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; code: string; message?: string; retry_after?: number; fields?: { field: string; problem: string }[] };

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

const TIMEOUT_MS = 15_000;

/** `OFFLINE` when there is no network, `ASLEEP` when the server does not answer properly (paused project, 5xx). Never throws. */
export async function callFunction<T = Record<string, unknown>>(
  config: Pick<GymConfig, 'functions' | 'core'>,
  name: string,
  body: Record<string, unknown>,
  token?: string,
  fetchFn: FetchLike = (u, i) => fetch(u, i) as never,
  online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine !== false,
): Promise<FnResult<T>> {
  if (!online) return { ok: false, code: 'OFFLINE' };
  const ctl = typeof AbortController === 'undefined' ? undefined : new AbortController();
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : undefined;
  try {
    const res = await fetchFn(`${config.functions.replace(/\/$/, '')}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.core.anon, Authorization: `Bearer ${token ?? config.core.anon}` },
      body: JSON.stringify(body),
      signal: ctl?.signal,
    });
    let j: unknown;
    try {
      j = await res.json();
    } catch {
      return { ok: false, code: res.status >= 500 || res.status === 0 ? 'ASLEEP' : 'UNKNOWN' };
    }
    const o = j as { ok?: boolean; data?: T; error?: { code?: string; message?: string; retry_after?: number; fields?: { field: string; problem: string }[] } };
    if (o?.ok === true) return { ok: true, data: (o.data ?? {}) as T };
    if (o?.error?.code) return { ok: false, code: o.error.code, message: o.error.message, retry_after: o.error.retry_after, fields: o.error.fields };
    return { ok: false, code: res.status >= 500 ? 'ASLEEP' : 'UNKNOWN' };
  } catch {
    return { ok: false, code: typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'ASLEEP' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Resolve what the member typed (code or phone) to the synthetic sign-in email. Always answers with one (unknown input gets a dummy). */
export async function lookupLogin(config: GymConfig, identifier: string, fetchFn?: FetchLike): Promise<FnResult<{ email: string }>> {
  return callFunction<{ email: string }>(config, 'lookup-login', { identifier: identifier.trim() }, undefined, fetchFn);
}

export async function changePasswordCall(config: GymConfig, token: string, current: string, next: string, fetchFn?: FetchLike): Promise<FnResult<{ changed: boolean }>> {
  return callFunction<{ changed: boolean }>(config, 'change-password', { current_password: current, new_password: next }, token, fetchFn);
}

export async function syncSummaryCall(config: GymConfig, token: string, fetchFn?: FetchLike): Promise<FnResult<{ updated: boolean }>> {
  return callFunction<{ updated: boolean }>(config, 'sync-summary', {}, token, fetchFn);
}

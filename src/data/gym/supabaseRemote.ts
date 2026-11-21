// The real Remote: the ONLY file that imports @supabase/supabase-js, and only through a dynamic import(), so a standalone
// user never downloads it (CLAUDE_MUST_READ hard rule). One client per shard: `core` (Shard A) and the member's train shard.
// Sessions are kept by the Supabase client in this origin's storage (refresh token only; no password is ever stored).

import type { GymConfig } from '../../shared/gymConfig';
import type { Cursor, RemoteError } from '../../shared/sync';
import { pullFilter, pullOrder } from '../../shared/sync';
import type { AuthResult, MemberProfile, PullResult, Remote, RemoteResult } from './types';

type Sb = typeof import('@supabase/supabase-js');
// A minimal view of the client; the library's own types are not imported at the top level.
interface Client {
  auth: {
    signInWithPassword(c: { email: string; password: string }): Promise<{ data: { session: { access_token: string } | null }; error: { status?: number; message: string } | null }>;
    signOut(o?: { scope?: 'local' | 'global' | 'others' }): Promise<unknown>;
    getSession(): Promise<{ data: { session: { access_token: string } | null } }>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

let lib: Promise<Sb> | null = null;
const loadLib = (): Promise<Sb> => (lib ??= import('@supabase/supabase-js'));

function toError(e: { status?: number; code?: string; message?: string } | null | undefined): RemoteError | undefined {
  if (!e) return undefined;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const offline = status === 0 || /failed to fetch|network|load failed/i.test(e.message ?? '');
  return { status, code: e.code, message: e.message, offline };
}

export interface RemoteOptions {
  config: GymConfig;
  /** The member's train shard id once known (stored in the connection record); else it is read at sign-in. */
  trainShard?: string;
  /** Called when the train shard becomes known. */
  onTrainShard?: (id: string) => void;
}

export async function createSupabaseRemote(opts: RemoteOptions): Promise<Remote> {
  const sb = await loadLib();
  const { config } = opts;
  const host = new URL(config.core.url).hostname.split('.')[0];
  const make = (url: string, anon: string, shard: string): Client =>
    sb.createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `sf-gym-${host}-${shard}` },
    }) as unknown as Client;

  const core = make(config.core.url, config.core.anon, 'core');
  const trains = new Map<string, Client>();
  let trainId = opts.trainShard;
  const trainClient = (): Client | null => {
    if (!trainId) return null;
    const ep = config.train.find((x) => x.id === trainId);
    if (!ep) return null;
    let c = trains.get(trainId);
    if (!c) {
      c = make(ep.url, ep.anon, trainId);
      trains.set(trainId, c);
    }
    return c;
  };

  const noTrain: RemoteError = { status: 400, code: 'NO_TRAIN_SHARD', message: 'No training shard for this member.' };

  const profile = async (): Promise<{ profile?: MemberProfile; error?: RemoteError }> => {
      const pr = await core.from('profiles').select('must_change_password').maybeSingle();
      if (pr.error) return { error: toError(pr.error) };
      const mr = await core.from('members').select('member_code,phone,train_shard').maybeSingle();
      if (mr.error) return { error: toError(mr.error) };
      const profile: MemberProfile = {
        must_change_password: pr.data?.must_change_password === true,
        member_code: mr.data?.member_code,
        phone: mr.data?.phone,
        train_shard: mr.data?.train_shard,
      };
      return { profile };
    };

  return {
    async signIn(email, password): Promise<AuthResult> {
      const r = await core.auth.signInWithPassword({ email, password });
      if (r.error || !r.data.session) return { ok: false, error: toError(r.error) ?? { status: 400 } };
      const p = await profile();
      if (p.error) return { ok: false, error: p.error };
      const id = p.profile?.train_shard;
      if (id && id !== trainId) {
        trainId = id;
        opts.onTrainShard?.(id);
      }
      const tc = trainClient();
      if (tc) {
        const t = await tc.auth.signInWithPassword({ email, password });
        if (t.error) return { ok: false, error: toError(t.error) ?? { status: 400 } };
      }
      return { ok: true };
    },
    async signOut() {
      await core.auth.signOut({ scope: 'local' }).catch(() => undefined);
      for (const c of trains.values()) await c.auth.signOut({ scope: 'local' }).catch(() => undefined);
      const tc = trainClient();
      if (tc && !trains.has(trainId!)) await tc.auth.signOut({ scope: 'local' }).catch(() => undefined);
    },
    async hasSession() {
      try {
        return !!(await core.auth.getSession()).data.session;
      } catch {
        return false;
      }
    },
    async accessToken() {
      try {
        return (await core.auth.getSession()).data.session?.access_token ?? null;
      } catch {
        return null;
      }
    },
    profile,
    async backupAccess() {
      try {
        const ep = trainId ? config.train.find((x) => x.id === trainId) : undefined;
        const tc = trainClient();
        if (!ep || !tc || !trainId) return null;
        const s = (await tc.auth.getSession()).data.session as { user?: { id?: string } } | null;
        if (!s?.user?.id) return null;
        const m = (await core.from('members').select('id').maybeSingle().catch(() => null)) as { data?: { id?: string } } | null;
        return { url: ep.url, anon: ep.anon, shardId: trainId, ownerUid: s.user.id, memberId: m?.data?.id ?? null, getToken: async () => (await tc.auth.getSession()).data.session?.access_token ?? null };
      } catch {
        return null;
      }
    },
    async publicSettings() {
      const r = await core.from('gym_settings').select('key,value').in('key', ['policy', 'contract_version']);
      if (r.error) return { error: toError(r.error) };
      const rows = (r.data ?? []) as { key: string; value: unknown }[];
      const cv = rows.find((x) => x.key === 'contract_version')?.value;
      return { policy: rows.find((x) => x.key === 'policy')?.value, contract_version: typeof cv === 'string' ? cv : cv != null ? String((cv as { value?: unknown }).value ?? cv) : undefined };
    },
    async upsert(table, rows, o): Promise<RemoteResult> {
      const c = trainClient();
      if (!c) return { error: noTrain };
      const r = await c.from(table).upsert(rows, { onConflict: o.onConflict, ignoreDuplicates: o.ignoreDuplicates });
      return { error: toError(r.error) };
    },
    async softDelete(table, clientId, body): Promise<RemoteResult> {
      const c = trainClient();
      if (!c) return { error: noTrain };
      const r = await c.from(table).update(body).eq('client_id', clientId);
      return { error: toError(r.error) };
    },
    async pull(table, columns, cursor: Cursor | null, limit): Promise<PullResult> {
      const isCore = table === 'gym_settings';
      const c = isCore ? core : trainClient();
      if (!c) return { rows: [], error: noTrain };
      let q = c.from(table).select(columns);
      const f = pullFilter(table, cursor);
      if (f) q = q.or(f);
      for (const col of pullOrder(table)) q = q.order(col, { ascending: true });
      const r = await q.limit(limit);
      return { rows: (r.data ?? []) as Record<string, unknown>[], error: toError(r.error) };
    },
    async readOwn(table, columns, limit): Promise<PullResult> {
      const r = await core.from(table).select(columns).limit(limit);
      return { rows: (r.data ?? []) as Record<string, unknown>[], error: toError(r.error) };
    },
    async markInboxRead(id, readAt): Promise<RemoteResult> {
      const r = await core.from('inbox').update({ read_at: readAt }).eq('id', id);
      return { error: toError(r.error) };
    },
    async insertRequest(row): Promise<RemoteResult> {
      const r = await core.from('requests').upsert(row, { onConflict: 'client_id', ignoreDuplicates: true });
      return { error: toError(r.error) };
    },
    async insertProposal(row): Promise<RemoteResult> {
      const r = await core.from('custom_exercises_shared').upsert(row, { onConflict: 'client_id', ignoreDuplicates: true });
      return { error: toError(r.error) };
    },
  };
}

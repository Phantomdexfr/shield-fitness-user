// The seam between the sync engine and the network (Phase 67). The engine only knows this interface, so tests use a fake
// and `supabaseRemote.ts` (the only file that imports @supabase/supabase-js, lazily) is the real one.

import type { Cursor, RemoteError } from '../../shared/sync';

export interface RemoteResult {
  error?: RemoteError;
}
export interface PullResult {
  rows: Record<string, unknown>[];
  error?: RemoteError;
}
export interface MemberProfile {
  must_change_password: boolean;
  member_code?: string;
  phone?: string;
  train_shard?: string;
}
export type AuthResult = { ok: true } | { ok: false; error: RemoteError };

export interface Remote {
  /** Sign in to the core shard and the member's train shard with the same credentials. The password is used once and never kept. */
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** True when a stored session exists (read from storage; works offline). */
  hasSession(): Promise<boolean>;
  /** The current core access token, for the credential functions; null when signed out. */
  accessToken(): Promise<string | null>;
  /** The member's own `profiles` + `members` row. */
  profile(): Promise<{ profile?: MemberProfile; error?: RemoteError }>;
  /** Public reads (anon): `gym_settings` keys `policy` and `contract_version`. */
  publicSettings(): Promise<{ policy?: unknown; contract_version?: string; error?: RemoteError }>;
  upsert(table: string, rows: Record<string, unknown>[], opts: { onConflict: string; ignoreDuplicates: boolean }): Promise<RemoteResult>;
  softDelete(table: string, clientId: string, body: Record<string, unknown>): Promise<RemoteResult>;
  pull(table: string, columns: string, cursor: Cursor | null, limit: number): Promise<PullResult>;
  /** Phase 68: read the member's own rows from a core-shard table (RLS limits them to this member). Small tables only. */
  readOwn(table: GymReadTable, columns: string, limit: number): Promise<PullResult>;
  /** Phase 68: `PATCH inbox {read_at}` by id (the only write the member makes to `inbox`). */
  markInboxRead(id: string, readAt: string): Promise<RemoteResult>;
  /** Phase 68: insert one request on the core shard, ignore-duplicates on `client_id`, `status:'open'` only. */
  insertRequest(row: Record<string, unknown>): Promise<RemoteResult>;
  /** Phase 69: insert one proposal to the gym library (`custom_exercises_shared`), ignore-duplicates on `client_id`. */
  insertProposal(row: Record<string, unknown>): Promise<RemoteResult>;
  /** Phase 76-b2: what the backup adapter needs from the member's train shard; null when not signed in there. Optional so test fakes need no change. */
  backupAccess?(): Promise<BackupAccess | null>;
}
export interface BackupAccess { url: string; anon: string; shardId: string; ownerUid: string; memberId: string | null; getToken: () => Promise<string | null> }

/** Core-shard tables the gym area reads (contract/connected-api.md). */
export type GymReadTable = 'memberships' | 'membership_plans' | 'attendance' | 'announcements' | 'inbox' | 'requests' | 'programs' | 'program_days' | 'program_items' | 'member_programs';

// The stored gym connection (Phase 67). Device-only: it lives in the local `prefs` store, which is never synced.
// It holds the gym config (public URLs and anon keys), never a password and never a token (the Supabase client keeps its own refresh token).

import { prefsRepo } from '../local';
import type { GymConfig } from '../../shared/gymConfig';

const ROW = 'gym:connection';
const CURSOR_PREFIX = 'gym:cursor:';
const SYNC_ROW = 'gym:synclog';
const UNSYNCED_ROW = 'gym:unsynced';

export interface Connection {
  config: GymConfig;
  host: string;
  connectedAt: number;
  /** The member's train shard id once known. */
  trainShard?: string;
  /** True once the member has signed in on this device at least once (a session may still have expired). */
  signedIn: boolean;
  /** `profiles.must_change_password` at the last sign-in; the gym area shows only the change screen while true. */
  mustChangePassword: boolean;
  /** Set when `gym_settings.contract_version` had a different major: behave as standalone. */
  versionMismatch: boolean;
  /** The member's code from the last sign-in; the member QR is drawn from it, so it works with no network (Phase 68). */
  memberCode?: string;
}

let cache: Connection | null | undefined;

export async function getConnection(): Promise<Connection | null> {
  if (cache !== undefined) return cache;
  try {
    const row = await prefsRepo.get(ROW);
    cache = (row?.value as Connection | undefined) ?? null;
  } catch {
    cache = null;
  }
  return cache;
}
/** The last loaded connection without touching the store (null before the first load). */
export const connectionNow = (): Connection | null => cache ?? null;

export async function saveConnection(c: Connection): Promise<void> {
  cache = c;
  await prefsRepo.put({ client_id: ROW, value: c } as never);
}
export async function patchConnection(p: Partial<Connection>): Promise<Connection | null> {
  const c = await getConnection();
  if (!c) return null;
  const next = { ...c, ...p };
  await saveConnection(next);
  return next;
}

export async function dropConnection(): Promise<void> {
  cache = null;
  await prefsRepo.remove(ROW).catch(() => undefined);
}

// ---------- cursors (per table) and the sync log ----------

export async function readCursor(table: string): Promise<{ u: string; t: string } | null> {
  const row = await prefsRepo.get(CURSOR_PREFIX + table);
  return (row?.value as { u: string; t: string } | undefined) ?? null;
}
export async function writeCursor(table: string, c: { u: string; t: string }): Promise<void> {
  await prefsRepo.put({ client_id: CURSOR_PREFIX + table, value: c } as never);
}
export async function dropCursors(tables: readonly string[]): Promise<void> {
  for (const t of tables) await prefsRepo.remove(CURSOR_PREFIX + t).catch(() => undefined);
}

export interface SyncLog {
  lastSyncedAt: number | null;
  authPaused: boolean;
}
export async function readSyncLog(): Promise<SyncLog> {
  const row = await prefsRepo.get(SYNC_ROW);
  return (row?.value as SyncLog | undefined) ?? { lastSyncedAt: null, authPaused: false };
}
export async function writeSyncLog(l: SyncLog): Promise<void> {
  await prefsRepo.put({ client_id: SYNC_ROW, value: l } as never);
}

/** Rows that were waiting when the member disconnected; Phase 69 (upload my history) sends them. */
export interface UnsyncedRef {
  table: string;
  client_id: string;
}
export async function readUnsynced(): Promise<UnsyncedRef[]> {
  const row = await prefsRepo.get(UNSYNCED_ROW);
  return (row?.value as UnsyncedRef[] | undefined) ?? [];
}
export async function writeUnsynced(list: UnsyncedRef[]): Promise<void> {
  await prefsRepo.put({ client_id: UNSYNCED_ROW, value: list } as never);
}

export const __resetConnectionCache = (): void => {
  cache = undefined;
};

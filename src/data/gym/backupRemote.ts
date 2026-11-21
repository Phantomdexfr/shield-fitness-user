// Phase 76-a: the remote a backup push talks to. An interface only; the real Supabase adapter (Storage + the
// `backup_manifest` table) is Phase 76-b and lives under src/data/gym/ because only this folder may talk to Supabase.
import type { RemoteError } from '../../shared/sync';

/** One `backup_manifest` row (contract connected-api 1.1.0). */
export interface ManifestRow {
  key: string;
  rev: number;
  sha256: string;
  content_sha256: string;
  bytes: number;
  rows: number;
  schema: number;
  prev_sha256: string | null;
  prev_bytes: number | null;
}
export type NewManifest = Omit<ManifestRow, 'rev' | 'prev_sha256' | 'prev_bytes'> & Partial<Pick<ManifestRow, 'prev_sha256' | 'prev_bytes'>>;

export interface BackupRemote {
  /** `row: null` and no error = no manifest yet. */
  readManifest(key: string): Promise<{ row: ManifestRow | null; error?: RemoteError }>;
  /** Content-addressed: the adapter maps 409 / duplicate to success. */
  upload(path: string, bytes: Uint8Array): Promise<{ error?: RemoteError }>;
  /** First time: POST with ignore-duplicates, rev 1. `inserted: false` = a row already existed (lost race). */
  insertManifest(row: NewManifest): Promise<{ inserted: boolean; error?: RemoteError }>;
  /** Compare-and-swap: PATCH ... rev=eq.<oldRev>, new rev = oldRev + 1. `updated: false` (empty answer) = lost race. */
  updateManifest(oldRev: number, row: NewManifest & { prev_sha256: string; prev_bytes: number }): Promise<{ updated: boolean; error?: RemoteError }>;
  /** A login page or HTML body must come back as bytes; the decoder rejects it (never data). */
  download(path: string): Promise<{ bytes?: Uint8Array; error?: RemoteError }>;
  remove(path: string): Promise<{ error?: RemoteError }>;
  /** Best effort; a failed ingest never fails a push. */
  ingest(key: string, sha256: string): Promise<{ error?: RemoteError }>;
}

/** Phase 76-b2: what a restore needs on top of a push: the list of every manifest row of this account. */
export interface RestoreRemote extends BackupRemote {
  listManifests(): Promise<{ rows: ManifestRow[]; error?: RemoteError }>;
}

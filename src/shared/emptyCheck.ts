// Restore safety net (Phase 73, RECOVERY_PLAN 4.5 S1 and S5, section 6). Pure: no store, no clock, no network.

/** [A-R9] Lost more than 30% of the rows the device last synced = too small to trust (S1). */
export const SHRINK_THRESHOLD = 0.3;

export type EmptyVerdict = 'ok' | 'restore_offer' | 'block_push' | 'different_owner';

export interface EmptyCheckInput {
  /** Live (not deleted) synced rows on this phone now. */
  localRows: number;
  /** Live rows the phone had at its last good sync (0 = never synced). */
  baseRows: number;
  /** true / false when the server was asked; null when not known (offline, signed out). */
  serverHasData: boolean | null;
  /** The owner written on this phone (`member:<code>`, later `free:<id>`); null = never stamped. */
  stampedOwner: string | null;
  /** Who is signed in now; null when nobody is. */
  currentOwner: string | null;
}

/**
 * - `different_owner`: the stamp names someone else. Never merge, never push: export, then start fresh.
 * - `restore_offer`: the phone holds nothing but the server (or the last sync) did. Offer Restore.
 * - `block_push`: the phone shrank by more than the threshold but is not empty. Stop pushing, offer Restore.
 * - `ok`: nothing wrong (a brand-new member with nothing anywhere is `ok`).
 */
export function emptyCheck(i: EmptyCheckInput): EmptyVerdict {
  if (i.stampedOwner && i.currentOwner && i.stampedOwner !== i.currentOwner) return 'different_owner';
  const local = Math.max(0, i.localRows);
  const base = Math.max(0, i.baseRows);
  if (local === 0 && (base > 0 || i.serverHasData === true)) return 'restore_offer';
  if (base > 0 && local < base * (1 - SHRINK_THRESHOLD)) return 'block_push';
  return 'ok';
}

/** RECOVERY_PLAN section 6 item 12: rows gone but the pull cursors survived, so a delta pull would fetch nothing. */
export const shouldResetCursors = (localRows: number, cursorCount: number): boolean => localRows === 0 && cursorCount > 0;

/** A restore merges and never overwrites (S5, section 6 item 3). */
export type MergeAction = 'add' | 'replace' | 'skip';
interface Stamped {
  updated_at: number;
  deleted_at?: number | null;
}
/**
 * No local row: add. A local tombstone is a final state and is never revived by an older or equal copy; otherwise the
 * newer `updated_at` wins and a tie keeps the phone's row. A restore never deletes a local row that is not in the data.
 */
export function mergeAction(local: Stamped | undefined, incoming: Stamped): MergeAction {
  if (!local) return 'add';
  if (local.deleted_at != null && incoming.deleted_at == null) return 'skip';
  return incoming.updated_at > local.updated_at ? 'replace' : 'skip';
}

/** Whether pushes are held back by this verdict (`ok` is the only one that lets them go). */
export const blocksPush = (v: EmptyVerdict): boolean => v !== 'ok';

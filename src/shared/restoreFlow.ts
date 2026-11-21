// Phase 77: the decision for a gym member's new-device restore (RECOVERY_PLAN section 6, SYNC_SPEC B7). Pure: no store, no clock,
// no network. The caller gathers the facts; this says what to do and which message to show. Order of the checks is the order of
// section 6 so the first thing that applies wins.

/** Section 6 item 9: more than this many rows in the manifest = the Wi-Fi line. */
export const WIFI_ROWS = 500;

export interface ManifestFact {
  key: string;
  rows: number;
  schema: number;
}

export interface AutoRestoreInput {
  signedIn: boolean;
  /** Item 1: the forced password change comes first. */
  mustChangePassword: boolean;
  cloudBackupOn: boolean;
  autoRestoreOn: boolean;
  /** Item 7: the member's train shard is in this app's config (false = closed or moved). */
  shardKnown: boolean;
  /** Item 2: the owner stamp on the phone and who is signed in now. */
  stampedOwner: string | null;
  currentOwner: string | null;
  /** Live synced rows on this phone. */
  localRows: number;
  /** The manifest rows of this member; null = could not be read (offline, error). */
  manifests: readonly ManifestFact[] | null;
  /** The highest chunk schema this app understands (item 11). */
  supportedSchema: number;
  /** A `backup:restore` record says `running` (item 4). */
  restoreRunning: boolean;
  /** Item 5 [A-R4]: carried so the rule is visible; it never changes the decision. */
  memberStatus?: 'active' | 'expired' | 'frozen' | 'unknown';
}

export type WaitWhy = 'signin' | 'password' | 'offline';

export type AutoRestoreDecision =
  /** Not now: the caller tries again at the next sign-in step, open or `online`. */
  | { kind: 'wait'; why: WaitWhy }
  /** Nothing to do (feature off, or the server holds nothing). */
  | { kind: 'none' }
  /** Another member's phone: export, then start fresh. Never a merge. */
  | { kind: 'owner' }
  | { kind: 'closed' }
  | { kind: 'update' }
  /** Show the button (the phone has data, or `auto_restore` is off). A restore only ever merges. */
  | { kind: 'offer'; rows: number; parts: number; wifi: boolean }
  /** Start by itself. `resume` = a killed run continues with the keys left. */
  | { kind: 'start'; rows: number; parts: number; wifi: boolean; resume: boolean };

export const manifestRows = (m: readonly ManifestFact[]): number => m.reduce((n, x) => n + Math.max(0, x.rows), 0);

export function planAutoRestore(i: AutoRestoreInput): AutoRestoreDecision {
  if (!i.signedIn) return { kind: 'wait', why: 'signin' };
  if (i.mustChangePassword) return { kind: 'wait', why: 'password' };
  if (i.stampedOwner && i.currentOwner && i.stampedOwner !== i.currentOwner) return { kind: 'owner' };
  if (!i.shardKnown) return { kind: 'closed' };
  if (!i.cloudBackupOn) return { kind: 'none' };
  if (i.manifests === null) return { kind: 'wait', why: 'offline' };
  if (i.manifests.length === 0) return { kind: 'none' };
  if (i.manifests.some((m) => m.schema > i.supportedSchema)) return { kind: 'update' };
  const rows = manifestRows(i.manifests);
  const parts = i.manifests.length;
  const wifi = rows > WIFI_ROWS;
  if (i.restoreRunning) return { kind: 'start', rows, parts, wifi, resume: true };
  if (i.localRows > 0 || !i.autoRestoreOn) return { kind: 'offer', rows, parts, wifi };
  return { kind: 'start', rows, parts, wifi, resume: false };
}

/** The screen state a decision maps to (the page shows one block per state). */
export type RestoreScreen = 'checking' | 'signin' | 'password' | 'offline' | 'none' | 'owner' | 'closed' | 'update' | 'offer' | 'running';
export function screenFor(d: AutoRestoreDecision): RestoreScreen {
  switch (d.kind) {
    case 'wait': return d.why === 'signin' ? 'signin' : d.why === 'password' ? 'password' : 'offline';
    case 'start': return 'running';
    default: return d.kind;
  }
}

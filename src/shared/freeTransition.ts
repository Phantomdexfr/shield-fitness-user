// Phase 80: free backup -> gym backup, the rules. Pure: no store, no clock, no network (docs/GYM_CONNECTION.md R10, R12).
// The order is fixed: connect, sign in, password change (all Phase 67), then the FIRST gym backup is written, and only then does
// the mode become `connected`; the free account is deleted after that. Any failure before the flip leaves the old mode untouched.
import type { BackupMode } from './backupPlan';

/** What the phone remembers about a move in progress (`meta` key `free:move`; never exported, never synced). */
export interface MoveRec {
  /** "Is this your data?" answered: true = mine, false = not mine. Absent = not asked or not needed. */
  mine?: boolean;
  /** The person tapped "Move my backup" after reading the gym-can-read-it line. */
  agreed?: boolean;
  /** `writing`: the first gym backup is being written (mode still free). `flipped`: mode is `connected`, the free account is not yet deleted. */
  phase?: 'writing' | 'flipped';
  freeId?: string;
  /** The owner stamp before the move began, put back when the move fails. */
  oldStamp?: string | null;
  /** The free account's backup bookkeeping (`backup:*` except the mode), put back when the move fails. */
  snapshot?: { key: string; value: unknown }[];
  /** The last failure, for the one plain line on screen. */
  failCode?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseMove(v: unknown): MoveRec | null {
  if (!isObj(v)) return null;
  const r: MoveRec = {};
  if (typeof v.mine === 'boolean') r.mine = v.mine;
  if (typeof v.agreed === 'boolean') r.agreed = v.agreed;
  if (v.phase === 'writing' || v.phase === 'flipped') r.phase = v.phase;
  if (typeof v.freeId === 'string') r.freeId = v.freeId;
  if (typeof v.oldStamp === 'string' || v.oldStamp === null) r.oldStamp = v.oldStamp;
  if (Array.isArray(v.snapshot)) r.snapshot = v.snapshot.filter((e): e is { key: string; value: unknown } => isObj(e) && typeof e.key === 'string');
  if (typeof v.failCode === 'string') r.failCode = v.failCode;
  return r;
}

/** The keys of the backup bookkeeping that belong to ONE target (everything but the mode). */
export const moveKeys = (all: readonly string[]): string[] => all.filter((k) => k.startsWith('backup:') && k !== 'backup:mode');

export type OwnerPrompt = 'mine' | 'ask' | 'other';
/**
 * "Is this your data?" (shared phone). Asked only when the phone holds rows stamped for someone else (the free id, or another
 * member); an empty phone, an unstamped phone and a phone already stamped with this member never ask. A stored answer wins.
 */
export function ownerPrompt(i: { stamp: string | null; memberOwner: string | null; rows: number; answer?: boolean }): OwnerPrompt {
  if (i.answer === true) return 'mine';
  if (i.answer === false) return 'other';
  if (i.rows <= 0 || !i.stamp || !i.memberOwner || i.stamp === i.memberOwner) return 'mine';
  return 'ask';
}

export type MoveDecision = 'none' | 'wait' | 'rollback' | 'delete_free' | 'restore_first' | 'start';
export interface MoveInput {
  mode: BackupMode;
  rec: MoveRec | null;
  hasSession: boolean;
  mustChange: boolean;
  online: boolean;
  prompt: OwnerPrompt;
  rows: number;
  /** The free account's server copy holds data: true / false, or null when it could not be asked. */
  freeHasData: boolean | null;
  /** A move of this same run is executing (so a `writing` record is alive, not left by a dead phone). */
  running: boolean;
}
/** What the next sync should do about a move. Pure. */
export function moveDecision(i: MoveInput): MoveDecision {
  if (i.rec?.phase === 'writing') return i.running ? 'wait' : 'rollback'; // a dead phone left it: undo, then the normal path retries
  if (i.rec?.phase === 'flipped') return i.mode === 'connected' && i.hasSession && !i.mustChange && i.online ? 'delete_free' : 'wait';
  if (i.mode !== 'free_backup') return 'none';
  if (!i.hasSession || i.mustChange || !i.online) return 'wait';
  if (!i.rec?.agreed || i.prompt !== 'mine') return 'wait';
  if (i.freeHasData === null) return 'wait';
  if (i.freeHasData && i.rows === 0) return 'restore_first'; // never write an empty gym backup over a free copy that holds the data
  return 'start';
}

/** Which copy an EMPTY phone restores from: the free copy first while it still exists on this phone's account (it is complete until the move finishes). */
export const restoreSourceFor = (i: { mode: BackupMode; hasFreeAccount: boolean }): 'free' | 'gym' => (i.mode === 'free_backup' && i.hasFreeAccount ? 'free' : 'gym');

/** R10: after leaving a gym, offer "Switch to free backup" only when the phone was backing up to that gym and has no free account yet. */
export const switchOffer = (i: { wasConnected: boolean; cloudBackupOn: boolean; freeAccountOn: boolean; configReady: boolean; hasFreeAccount: boolean }): boolean =>
  i.wasConnected && i.cloudBackupOn && i.freeAccountOn && i.configReady && !i.hasFreeAccount;

export type MoveView = 'hidden' | 'ask' | 'other' | 'consent' | 'waiting' | 'restore_first' | 'kept';
/** What the R12 block shows (gym screens). `waiting` = agreed, the next sync does it. */
export function moveView(i: { mode: BackupMode; rec: MoveRec | null; gymSignedIn: boolean; mustChange: boolean; prompt: OwnerPrompt; restoreFirst?: boolean }): MoveView {
  if (i.rec?.phase === 'flipped') return 'kept';
  if (i.mode !== 'free_backup' || !i.gymSignedIn || i.mustChange) return 'hidden';
  if (i.prompt === 'other') return 'other';
  if (i.prompt === 'ask') return 'ask';
  if (!i.rec?.agreed) return 'consent';
  return i.restoreFirst ? 'restore_first' : 'waiting';
}

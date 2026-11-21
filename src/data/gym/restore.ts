// Restore safety net (Phase 73): empty check, owner stamp, cursor reset, and a restore that refills the phone from the
// server by the EXISTING delta pull (`pullTable`). Rules in `src/shared/emptyCheck.ts`. No new tables, no contract change.

import { BACKUP_TABLES, getDb, isOutboxEnabled, setOutboxEnabled, type EntityStore, type Row } from '../local';
import { emptyCheck, mergeAction, shouldResetCursors, type EmptyVerdict } from '../../shared/emptyCheck';
import { addSetToSession, FLAT_RESTORE, finishSession, localFromServer } from '../../shared/restoreMap';
import { dropCursors, getConnection, readCursor } from './connection';
import { classifyError } from '../../shared/sync';
import { pullTable, type EngineDeps, type PullTarget } from './syncEngine';
import type { Remote } from './types';

const OWNER_KEY = 'owner';
const BASE_KEY = 'restoreBase';
const RESTORE_TABLES = ['workout_sessions', 'workout_sets', 'cardio_logs', ...Object.keys(FLAT_RESTORE)] as const;
/** Synced stores only: prefs and photos never leave the phone, so they never count. */
const COUNTED = BACKUP_TABLES.filter((s) => s !== 'prefs') as EntityStore[];

// ---------- owner stamp and base count (`meta`, never exported, never synced) ----------

export async function readOwner(): Promise<string | null> {
  const r = await (await getDb()).get('meta', OWNER_KEY);
  return typeof r?.value === 'string' ? r.value : null;
}
export async function writeOwner(owner: string): Promise<void> {
  await (await getDb()).put('meta', { key: OWNER_KEY, value: owner });
}
export async function readBase(): Promise<number> {
  const r = await (await getDb()).get('meta', BASE_KEY);
  return typeof r?.value === 'number' ? r.value : 0;
}
export async function writeBase(n: number): Promise<void> {
  await (await getDb()).put('meta', { key: BASE_KEY, value: n });
}

/** Live rows in the synced stores. */
export async function liveRowCount(): Promise<number> {
  const db = await getDb();
  let n = 0;
  for (const s of COUNTED) n += (await db.getAll(s)).filter((r) => (r as Row).deleted_at == null).length;
  return n;
}

/** The owner of the signed-in member, from the stored member code; null when unknown. */
export async function currentOwner(): Promise<string | null> {
  const c = await getConnection();
  return c?.memberCode ? `member:${c.memberCode.toUpperCase()}` : null;
}

/** Stamp the phone with its owner the first time a member is known (an existing stamp is never replaced here). */
export async function stampOwnerIfNone(): Promise<void> {
  const [have, now] = [await readOwner(), await currentOwner()];
  if (!have && now) await writeOwner(now);
}

let lastVerdict: EmptyVerdict = 'ok';
/** The verdict of the last sync run (memory only), so a screen can offer Restore without asking the server again. */
export const getLastVerdict = (): EmptyVerdict => lastVerdict;
export const setLastVerdict = (v: EmptyVerdict): void => {
  lastVerdict = v;
};

export async function checkRestore(serverHasData: boolean | null): Promise<EmptyVerdict> {
  return emptyCheck({ localRows: await liveRowCount(), baseRows: await readBase(), serverHasData, stampedOwner: await readOwner(), currentOwner: await currentOwner() });
}

/** After a good sync the phone's row count is the new base (so a later shrink can be seen). Never called when the check blocked. */
export async function recordBase(): Promise<void> {
  await writeBase(await liveRowCount());
}

/** Does the server hold any session of this member? null when it cannot be told (offline, error). */
export async function serverHasData(remote: Remote): Promise<boolean | null> {
  const r = await remote.pull('workout_sessions', 'client_id', null, 1);
  return r.error ? null : r.rows.length > 0;
}

// ---------- restore ----------

const cursorKeys = (): string[] => [...RESTORE_TABLES];

async function customIdSet(): Promise<Set<string>> {
  const rows = (await (await getDb()).getAll('customExercises')) as Row[];
  return new Set(rows.flatMap((r) => [r.client_id, typeof r.slug === 'string' ? r.slug : ''].filter(Boolean)));
}

async function mergeInto(store: EntityStore, rows: Row[]): Promise<{ added: number; replaced: number }> {
  const db = await getDb();
  const out = { added: 0, replaced: 0 };
  const tx = db.transaction(store, 'readwrite'); // no outbox store: restored rows are never pushed back
  for (const row of rows) {
    const local = (await tx.store.get(row.client_id)) as Row | undefined;
    const a = mergeAction(local, row);
    if (a === 'skip') continue;
    await tx.store.put(row);
    if (a === 'add') out.added += 1;
    else out.replaced += 1;
  }
  await tx.done;
  return out;
}

export interface RestoreProgress {
  step: number;
  of: number;
  table: string;
}
export interface RestoreResult {
  ok: boolean;
  added: number;
  replaced: number;
  /** Why it stopped: no internet, the sign-in ended, or the server said no. Nothing is lost; run it again. */
  error?: 'offline' | 'auth' | 'server';
}

/** Pull targets for the personal tables. Each `apply` merges by client_id; sets and cardio rows are placed into their session. */
export function personalTargets(counts: { added: number; replaced: number }, customIds: Set<string>): PullTarget[] {
  const tally = (r: { added: number; replaced: number }) => {
    counts.added += r.added;
    counts.replaced += r.replaced;
  };
  const sessions: PullTarget = {
    table: 'workout_sessions',
    columns: '*',
    async apply(rows) {
      tally(await mergeInto('sessions', rows.map(localFromServer).filter((r): r is Row => r !== null)));
    },
  };
  const setsInto = (table: 'workout_sets' | 'cardio_logs'): PullTarget => ({
    table,
    columns: '*',
    async apply(rows) {
      const db = await getDb();
      const tx = db.transaction('sessions', 'readwrite');
      for (const set of rows) {
        const sid = set.session_client_id;
        if (typeof sid !== 'string') continue;
        const s = (await tx.store.get(sid)) as Row | undefined;
        if (!s || s.deleted_at != null) continue; // a deleted or unknown session gets no sets back
        await tx.store.put(finishSession(addSetToSession(s, set, customIds)));
      }
      await tx.done;
    },
  });
  const flat = Object.entries(FLAT_RESTORE).map(
    ([table, store]): PullTarget => ({
      table,
      columns: '*',
      async apply(rows) {
        tally(await mergeInto(store, rows.map(localFromServer).filter((r): r is Row => r !== null)));
      },
    }),
  );
  return [sessions, setsInto('workout_sets'), setsInto('cardio_logs'), ...flat];
}

/**
 * Refill the phone. Pushes are held off for the whole run (S6) and put back as they were. When the phone holds no rows the
 * pull cursors are reset first (a kept cursor would make the pull fetch nothing). The cursor of a table moves only after its
 * rows are stored, so a killed run starts again where it stopped (the stores are merged, so a repeat changes nothing).
 */
export async function runRestore(deps: EngineDeps, onProgress?: (p: RestoreProgress) => void): Promise<RestoreResult> {
  const was = isOutboxEnabled();
  setOutboxEnabled(false);
  const counts = { added: 0, replaced: 0 };
  try {
    if (shouldResetCursors(await liveRowCount(), (await Promise.all(cursorKeys().map(readCursor))).filter(Boolean).length)) await dropCursors(cursorKeys());
    const targets = personalTargets(counts, await customIdSet());
    let step = 0;
    for (const t of targets) {
      onProgress?.({ step: step + 1, of: targets.length, table: t.table });
      const r = await pullTable(deps, t);
      if (r.error) return { ok: false, ...counts, error: r.error.offline ? 'offline' : classifyError(r.error) === 'auth' ? 'auth' : 'server' };
      step += 1;
    }
    await recordBase();
    await stampOwnerIfNone();
    return { ok: true, ...counts };
  } finally {
    setOutboxEnabled(was);
  }
}

/** Phase 77: an empty phone whose pull cursors survived would fetch nothing (section 6 item 12): drop them before a restore. */
export async function resetStaleCursors(): Promise<boolean> {
  if (!shouldResetCursors(await liveRowCount(), (await Promise.all(cursorKeys().map(readCursor))).filter(Boolean).length)) return false;
  await dropCursors(cursorKeys());
  return true;
}

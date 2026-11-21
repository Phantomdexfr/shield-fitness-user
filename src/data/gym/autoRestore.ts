// Phase 77: new-device restore for a gym member. Gathers the facts, asks `planAutoRestore` (src/shared/restoreFlow.ts) and, when the
// answer is `start` (or the person pressed the button), runs the Phase 76-b2 resumable restore (`runRestore` in backupRestore.ts).
// Lazy: only link.ts and the R6 page import this, and only for a connected member. Supabase is reached through backupBoot / backupSupabase.
import { useEffect, useState } from 'preact/hooks';
import { resolveFeature } from '../../app/flags';
import { CHUNK_SCHEMA } from '../../shared/chunks';
import { planAutoRestore, type AutoRestoreDecision } from '../../shared/restoreFlow';
import type { Connection } from './connection';
import type { Remote } from './types';
import type { BackupDeps } from './backupRun';
import type { RestoreRemote } from './backupRemote';
import { depsFromAccess } from './backupBoot';
import { readMode, writeMode } from './backupMeta';
import { restoreIsRunning, runRestore, type RestoreOutcome } from './backupRestore';
import { currentOwner, liveRowCount, readOwner, recordBase, resetStaleCursors, stampOwnerIfNone } from './restore';
import { setBackupLive } from './backupState';

/** What the R6 page shows (memory only). */
export type RestoreView =
  | { s: 'idle' }
  | { s: 'decision'; d: AutoRestoreDecision }
  | { s: 'running'; done: number; total: number }
  | { s: 'done'; restored: number }
  | { s: 'paused'; why: 'offline' | 'auth' | 'stopped'; done: number; total: number }
  | { s: 'failed'; why: string; done: number; total: number };

let view: RestoreView = { s: 'idle' };
const subs = new Set<() => void>();
export const getRestoreView = (): RestoreView => view;
export function setRestoreView(v: RestoreView): void {
  view = v;
  subs.forEach((f) => f());
}
export function useRestoreView(): RestoreView {
  const [, force] = useState(0);
  useEffect(() => {
    const f = (): void => force((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return view;
}

export interface RestoreCtx {
  remote: Remote;
  conn: Connection;
  functions?: { url: string; coreAnon: string };
  /** Test seam: build the restore remote and deps from an access (default: the real adapter). */
  build?: (a: NonNullable<Awaited<ReturnType<NonNullable<Remote['backupAccess']>>>>) => { remote: RestoreRemote; deps: BackupDeps };
  /** Member status, if the caller knows it; carried to the planner only (A-R4: it never blocks a restore). */
  memberStatus?: 'active' | 'expired' | 'frozen' | 'unknown';
}
export interface Assessment { decision: AutoRestoreDecision; rt: { remote: RestoreRemote; deps: BackupDeps } | null }

/** Gather the facts and decide. Makes one manifest list request when signed in and the feature is on. */
export async function assessRestore(ctx: RestoreCtx): Promise<Assessment> {
  const { remote, conn } = ctx;
  const signedIn = conn.signedIn && (await remote.hasSession().catch(() => false));
  const shardKnown = !conn.trainShard || conn.config.train.some((x) => x.id === conn.trainShard);
  const cloudBackupOn = resolveFeature('cloud_backup');
  let rt: Assessment['rt'] = null;
  let manifests: { key: string; rows: number; schema: number }[] | null = null;
  const ready = signedIn && !conn.mustChangePassword && shardKnown && cloudBackupOn;
  if (ready) {
    const a = await remote.backupAccess?.().catch(() => null);
    if (a) {
      rt = (ctx.build ?? ((x) => depsFromAccess(x, ctx.functions)))(a);
      const l = await rt.remote.listManifests();
      manifests = l.error ? null : l.rows.map((r) => ({ key: r.key, rows: r.rows, schema: r.schema }));
    }
  }
  const decision = planAutoRestore({
    signedIn,
    mustChangePassword: conn.mustChangePassword,
    cloudBackupOn,
    autoRestoreOn: resolveFeature('auto_restore'),
    shardKnown,
    stampedOwner: await readOwner(),
    currentOwner: await currentOwner(),
    localRows: await liveRowCount(),
    manifests,
    supportedSchema: CHUNK_SCHEMA,
    restoreRunning: await restoreIsRunning(),
    memberStatus: ctx.memberStatus ?? 'unknown',
  });
  return { decision, rt };
}

/**
 * Run the restore for an assessment whose decision is `start` or `offer` (the button). Pushes are held off by the `running`
 * record (S6). Afterwards the owner stamp and base are written; the caller runs the normal delta pull (`syncNow`).
 */
export async function runChunkRestore(a: Assessment): Promise<RestoreOutcome | 'not_ready'> {
  if (!a.rt || (a.decision.kind !== 'start' && a.decision.kind !== 'offer')) return 'not_ready';
  const rt = a.rt;
  if ((await readMode()) === 'standalone') await writeMode('connected');
  await resetStaleCursors();
  setRestoreView({ s: 'running', done: 0, total: a.decision.parts });
  const out = await runRestore({ ...rt.deps, remote: rt.remote }, {
    onProgress: (done, total) => {
      setBackupLive({ restoring: { done, total } });
      setRestoreView({ s: 'running', done, total });
    },
    onDone: async () => {
      await stampOwnerIfNone().catch(() => undefined);
      await recordBase().catch(() => undefined);
    },
  });
  setBackupLive({ restoring: null });
  if (out.kind === 'done') setRestoreView({ s: 'done', restored: out.restored });
  else if (out.kind === 'paused') setRestoreView({ s: 'paused', why: out.reason, done: out.done, total: out.total });
  else if (out.kind === 'failed') setRestoreView({ s: 'failed', why: out.reason, done: out.done, total: out.total });
  else setRestoreView({ s: 'decision', d: { kind: 'none' } });
  return out;
}

/** After sign-in / password change / open: assess, and start by itself only when the decision says `start`. */
export async function autoRestoreIfNeeded(ctx: RestoreCtx): Promise<Assessment & { outcome: RestoreOutcome | null }> {
  const a = await assessRestore(ctx);
  if (a.decision.kind !== 'start') {
    setRestoreView({ s: 'decision', d: a.decision });
    return { ...a, outcome: null };
  }
  const out = await runChunkRestore(a);
  return { ...a, outcome: out === 'not_ready' ? null : out };
}

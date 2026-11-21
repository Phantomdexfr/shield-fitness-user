// Gym data (Phase 68): the member's membership, attendance, announcements, inbox and requests, cached on the device so the
// screens and the member QR work with no network. Reads use the core shard (RLS shows only this member's rows).
// The cache lives in one `prefs` row (device only, never synced). Requests made offline wait in a second `prefs` row and are
// sent when online (idempotent by client_id) [A-P68.6: a small queue here instead of a new IndexedDB store + migration].

import { prefsRepo } from '../local';
import { istDayKey, parseIso, type DayKey } from '../../shared/dates';
import { attendanceDays, requestRow, validateRequest, type MembershipRow, type RequestDraft, type RequestProblem, type RequestStatus } from '../../shared/gymData';
import type { Remote } from './types';

const DATA_ROW = 'gym:data';
const QUEUE_ROW = 'gym:requests';

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  at: number | null;
  readAt: string | null;
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  at: number | null;
}
export interface RequestItem {
  clientId: string;
  kind: string;
  note: string;
  status: RequestStatus;
  at: number | null;
}
export interface GymCache {
  fetchedAt: number | null;
  memberships: MembershipRow[];
  attendance: DayKey[];
  announcements: Announcement[];
  inbox: InboxItem[];
  /** requests the server knows about */
  requests: RequestItem[];
}
export const emptyCache = (): GymCache => ({ fetchedAt: null, memberships: [], attendance: [], announcements: [], inbox: [], requests: [] });

interface Queued {
  clientId: string;
  draft: RequestDraft;
  createdAt: number;
}

export async function readCache(): Promise<GymCache> {
  try {
    return { ...emptyCache(), ...((await prefsRepo.get(DATA_ROW))?.value as Partial<GymCache> | undefined) };
  } catch {
    return emptyCache();
  }
}
async function writeCache(c: GymCache): Promise<void> {
  await prefsRepo.put({ client_id: DATA_ROW, value: c } as never);
}
async function readQueue(): Promise<Queued[]> {
  try {
    return ((await prefsRepo.get(QUEUE_ROW))?.value as Queued[] | undefined) ?? [];
  } catch {
    return [];
  }
}
async function writeQueue(q: Queued[]): Promise<void> {
  await prefsRepo.put({ client_id: QUEUE_ROW, value: q } as never);
}

export async function clearGymData(): Promise<void> {
  await prefsRepo.remove(DATA_ROW).catch(() => undefined);
  await prefsRepo.remove(QUEUE_ROW).catch(() => undefined);
  notify();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const ms = (v: unknown): number | null => (typeof v === 'string' ? parseIso(v) : null);
const REQUEST_STATUSES: RequestStatus[] = ['open', 'in_progress', 'done', 'rejected'];

/** [A-P68.5] The column names below are guesses until the Admin DATA_MODEL is seen; a failed read keeps the old cache. */
export async function pullGymData(remote: Remote, now: number): Promise<{ ok: boolean }> {
  const [m, p, a, n, i, r] = await Promise.all([
    remote.readOwn('memberships', 'id,plan_id,start_date,end_date,status', 20),
    remote.readOwn('membership_plans', 'id,name', 50),
    remote.readOwn('attendance', 'id,checked_in_at', 400),
    remote.readOwn('announcements', 'id,title,body,published_at', 30),
    remote.readOwn('inbox', 'id,title,body,created_at,read_at', 50),
    remote.readOwn('requests', 'client_id,kind,note,status,created_at', 50),
  ]);
  const failed = [m, p, a, n, i, r].some((x) => x.error);
  const old = await readCache();
  // A table that failed keeps its old cached rows; the others are replaced.
  const next: GymCache = { ...old };
  if (!m.error) {
    const names = new Map((p.error ? [] : p.rows).map((x) => [str(x.id), str(x.name)]));
    next.memberships = m.rows.map((x) => ({ plan_name: names.get(str(x.plan_id)) ?? '', start_date: str(x.start_date), end_date: str(x.end_date), status: str(x.status) || null }));
  }
  if (!a.error) next.attendance = attendanceDays(a.rows.map((x) => ({ day: ms(x.checked_in_at) === null ? '' : istDayKey(ms(x.checked_in_at)!) })));
  if (!n.error) next.announcements = n.rows.map((x) => ({ id: str(x.id), title: str(x.title), body: str(x.body), at: ms(x.published_at) })).sort((x, y) => (y.at ?? 0) - (x.at ?? 0));
  if (!i.error) {
    const local = new Map(old.inbox.map((x) => [x.id, x]));
    next.inbox = i.rows
      .map((x) => ({ id: str(x.id), title: str(x.title), body: str(x.body), at: ms(x.created_at), readAt: str(x.read_at) || local.get(str(x.id))?.readAt || null }))
      .sort((x, y) => (y.at ?? 0) - (x.at ?? 0));
  }
  if (!r.error) {
    next.requests = r.rows.map((x) => ({
      clientId: str(x.client_id),
      kind: str(x.kind),
      note: str(x.note),
      status: (REQUEST_STATUSES as string[]).includes(str(x.status)) ? (str(x.status) as RequestStatus) : 'open',
      at: ms(x.created_at),
    }));
  }
  if (!failed) next.fetchedAt = now;
  await writeCache(next);
  notify();
  return { ok: !failed };
}

/** Send every queued request (idempotent by client_id). A refused one stays queued; nothing is dropped. */
export async function flushRequests(remote: Remote, online: () => boolean): Promise<number> {
  if (!online()) return 0;
  const q = await readQueue();
  const left: Queued[] = [];
  let sent = 0;
  for (const item of q) {
    const res = await remote.insertRequest(requestRow(item.draft, item.clientId));
    if (res.error) left.push(item);
    else sent += 1;
  }
  if (sent) await writeQueue(left);
  return sent;
}

export async function refreshGymData(remote: Remote, online: () => boolean, now: () => number = Date.now): Promise<void> {
  if (!online()) return;
  await flushRequests(remote, online);
  await pullGymData(remote, now());
}

// ---------- the member's own actions ----------

export type SubmitResult = { ok: true; clientId: string } | { ok: false; problem: RequestProblem };

/** Queue a request on the phone (works offline); it goes out with the next sync. */
export async function queueRequest(draft: RequestDraft, id: string, now: number): Promise<SubmitResult> {
  const problem = validateRequest(draft);
  if (problem) return { ok: false, problem };
  await writeQueue([...(await readQueue()), { clientId: id, draft, createdAt: now }]);
  notify();
  return { ok: true, clientId: id };
}

/** The request list to show: queued ones first (status `queued`), then the server's, newest first. */
export async function requestList(): Promise<RequestItem[]> {
  const [q, c] = await Promise.all([readQueue(), readCache()]);
  const server = new Set(c.requests.map((r) => r.clientId));
  const queued: RequestItem[] = q
    .filter((x) => !server.has(x.clientId))
    .map((x) => ({ clientId: x.clientId, kind: x.draft.kind, note: (x.draft.note ?? '').trim(), status: 'queued' as RequestStatus, at: x.createdAt }));
  return [...queued.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)), ...[...c.requests].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))];
}

export async function markInboxItemRead(remote: Remote | null, id: string, now: number): Promise<void> {
  const c = await readCache();
  const iso = new Date(now).toISOString();
  c.inbox = c.inbox.map((x) => (x.id === id && !x.readAt ? { ...x, readAt: iso } : x));
  await writeCache(c); // shown as read at once, even offline
  notify();
  if (remote) await remote.markInboxRead(id, iso).catch(() => undefined);
}

// ---------- change notice for screens ----------
const listeners = new Set<() => void>();
export const onGymData = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function notify(): void {
  listeners.forEach((l) => l());
}

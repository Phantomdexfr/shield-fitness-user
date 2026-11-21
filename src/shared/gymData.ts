// Gym data rules (Phase 68): membership days left, the offline member QR, attendance streak, request rules.
// Pure: no DOM, no network, no clock (time is always a parameter). Dates are IST day keys (YYYY-MM-DD).

import { addDays, daysBetween, isDayKey, type DayKey } from './dates';

/* ---------- membership ---------- */

export type MembershipState = 'none' | 'upcoming' | 'active' | 'expiring' | 'expired' | 'frozen';

export interface MembershipRow {
  plan_name?: string | null;
  /** first day covered (IST day key) */
  start_date: string;
  /** last day covered, inclusive (IST day key) */
  end_date: string;
  /** 'active' | 'frozen' | 'cancelled' (server value; anything else is treated as active) */
  status?: string | null;
}

export interface MembershipView {
  state: MembershipState;
  planName: string;
  startDate: DayKey | null;
  endDate: DayKey | null;
  /** whole days left counting today; 0 on the last day; negative once expired; null when unknown */
  daysLeft: number | null;
  /** days since the end date, only when expired */
  daysOver: number | null;
}

/** A membership with this many days left or fewer is "expiring" [A-P68.1]. */
export const EXPIRING_DAYS = 7;

export function membershipView(row: MembershipRow | null | undefined, today: DayKey): MembershipView {
  if (!row || !isDayKey(row.start_date) || !isDayKey(row.end_date) || row.status === 'cancelled') {
    return { state: 'none', planName: row?.plan_name ?? '', startDate: null, endDate: null, daysLeft: null, daysOver: null };
  }
  const planName = row.plan_name ?? '';
  const left = daysBetween(today, row.end_date);
  const base = { planName, startDate: row.start_date, endDate: row.end_date };
  if (row.status === 'frozen') return { ...base, state: 'frozen', daysLeft: Math.max(left, 0), daysOver: null };
  if (daysBetween(today, row.start_date) > 0) return { ...base, state: 'upcoming', daysLeft: left, daysOver: null };
  if (left < 0) return { ...base, state: 'expired', daysLeft: left, daysOver: -left };
  return { ...base, state: left <= EXPIRING_DAYS ? 'expiring' : 'active', daysLeft: left, daysOver: null };
}

/** Of several rows, the one to show: a running one first, then the next upcoming, then the most recently ended. */
export function pickMembership(rows: MembershipRow[], today: DayKey): MembershipRow | null {
  const valid = rows.filter((r) => isDayKey(r.start_date) && isDayKey(r.end_date) && r.status !== 'cancelled');
  if (!valid.length) return null;
  const running = valid
    .filter((r) => r.start_date <= today && r.end_date >= today)
    .sort((a, b) => (a.end_date < b.end_date ? 1 : -1));
  if (running[0]) return running[0];
  const upcoming = valid.filter((r) => r.start_date > today).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  if (upcoming[0]) return upcoming[0];
  return valid.sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0] ?? null;
}

/* ---------- member QR: SF1:<code>:<crc> ---------- */

export const QR_PREFIX = 'SF1';

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no xorout) of the bytes of `text`. Check value of "123456789" = 0x29B1. */
export function crc16(text: string): number {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= (text.charCodeAt(i) & 0xff) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
}

/** Member codes look like SF-0042 (letters, digits and dashes only; upper-cased). */
export function normaliseMemberCode(code: string): string | null {
  const c = code.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{1,23}$/.test(c) ? c : null;
}

/** The text drawn as the member's QR: `SF1:<CODE>:<CRC>` where CRC = crc16("SF1:<CODE>") as 4 upper-case hex digits [A-P68.2]. */
export function encodeMemberQr(code: string): string | null {
  const c = normaliseMemberCode(code);
  if (!c) return null;
  const head = `${QR_PREFIX}:${c}`;
  return `${head}:${crc16(head).toString(16).toUpperCase().padStart(4, '0')}`;
}

export type QrDecode = { ok: true; code: string } | { ok: false; reason: 'format' | 'crc' };

export function decodeMemberQr(text: string): QrDecode {
  const m = /^SF1:([A-Z0-9][A-Z0-9-]{1,23}):([0-9A-F]{4})$/.exec(text.trim());
  if (!m) return { ok: false, reason: 'format' };
  const code = m[1]!;
  const want = crc16(`${QR_PREFIX}:${code}`).toString(16).toUpperCase().padStart(4, '0');
  return want === m[2] ? { ok: true, code } : { ok: false, reason: 'crc' };
}

/* ---------- attendance ---------- */

/** Distinct, valid, sorted-ascending day keys from rows that carry a `day` (IST day key). Rows with `deleted_at` are ignored. */
export function attendanceDays(rows: { day: string; deleted_at?: string | null }[]): DayKey[] {
  const set = new Set<DayKey>();
  for (const r of rows) if (!r.deleted_at && isDayKey(r.day)) set.add(r.day);
  return [...set].sort();
}

export interface AttendanceSummary {
  /** visits in the 30 days ending today (today included) */
  last30: number;
  /** consecutive days ending today, or ending yesterday when today has no visit yet (the streak is not broken until the day is over) */
  streakDays: number;
  /** longest run of consecutive days ever */
  longestDays: number;
  /** most recent visit day, or null */
  lastVisit: DayKey | null;
}

export function attendanceSummary(days: DayKey[], today: DayKey): AttendanceSummary {
  const set = new Set(days);
  let last30 = 0;
  for (let i = 0; i < 30; i++) if (set.has(addDays(today, -i))) last30++;

  let cursor: DayKey = set.has(today) ? today : addDays(today, -1);
  let streakDays = 0;
  while (set.has(cursor)) {
    streakDays++;
    cursor = addDays(cursor, -1);
  }

  let longestDays = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const d of [...set].sort()) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > longestDays) longestDays = run;
    prev = d;
  }
  const lastVisit = days.length ? ([...days].sort()[days.length - 1] ?? null) : null;
  return { last30, streakDays, longestDays, lastVisit };
}

/** The day keys of one calendar month (`month` 1-12) with a flag for each visit, padded so the first day sits under its weekday (Monday first). */
export function monthGrid(days: DayKey[], year: number, month: number): { key: DayKey | null; visited: boolean }[] {
  const mm = String(month).padStart(2, '0');
  const first: DayKey = `${year}-${mm}-01`;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const set = new Set(days);
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: { key: DayKey | null; visited: boolean }[] = [];
  for (let i = 0; i < lead; i++) cells.push({ key: null, visited: false });
  for (let d = 1; d <= length; d++) {
    const key = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    cells.push({ key, visited: set.has(key) });
  }
  return cells;
}

/* ---------- inbox ---------- */

export interface InboxRow {
  id: string;
  read_at?: string | null;
  deleted_at?: string | null;
}

export function unreadCount(rows: InboxRow[]): number {
  return rows.filter((r) => !r.deleted_at && !r.read_at).length;
}

/* ---------- requests ---------- */

export const REQUEST_KINDS = ['freeze', 'locker', 'complaint', 'equipment', 'forgot_password'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
/** 'queued' = made on the phone, not sent yet; the rest are the server's [A-P68.3]. */
export type RequestStatus = 'queued' | 'open' | 'in_progress' | 'done' | 'rejected';

export const NOTE_MAX = 300;
/** Kinds that need a note (a complaint or an equipment report is empty without words). */
const NOTE_REQUIRED: Record<RequestKind, boolean> = {
  freeze: false,
  locker: false,
  complaint: true,
  equipment: true,
  forgot_password: false,
};

export interface RequestDraft {
  kind: string;
  note?: string;
  /** freeze only: days asked for, whole number 1-90 [A-P68.4] */
  freezeDays?: number;
}

export type RequestProblem = 'kind' | 'note-required' | 'note-too-long' | 'freeze-days';

export function validateRequest(d: RequestDraft): RequestProblem | null {
  if (!(REQUEST_KINDS as readonly string[]).includes(d.kind)) return 'kind';
  const kind = d.kind as RequestKind;
  const note = (d.note ?? '').trim();
  if (note.length > NOTE_MAX) return 'note-too-long';
  if (NOTE_REQUIRED[kind] && note.length < 3) return 'note-required';
  if (kind === 'freeze') {
    const n = d.freezeDays;
    if (n === undefined || !Number.isInteger(n) || n < 1 || n > 90) return 'freeze-days';
  }
  return null;
}

/** A member may not stack the same kind: one open (or queued) request per kind at a time. Returns true when a new one is allowed. */
export function canOpenRequest(kind: RequestKind, existing: { kind: string; status: string; deleted_at?: string | null }[]): boolean {
  return !existing.some((r) => r.kind === kind && !r.deleted_at && (r.status === 'queued' || r.status === 'open' || r.status === 'in_progress'));
}

const FINAL: RequestStatus[] = ['done', 'rejected'];
/** The member never changes a status; the only local move is queued -> open when the push succeeds. Final states never move back. */
export function nextRequestStatus(current: RequestStatus, event: 'sent' | 'server', serverStatus?: RequestStatus): RequestStatus {
  if (FINAL.includes(current)) return current;
  if (event === 'sent') return current === 'queued' ? 'open' : current;
  return serverStatus ?? current;
}

/** The body the outbox pushes for a new request: insert with status 'open' only; the member never writes staff fields. */
export function requestRow(d: RequestDraft, clientId: string): Record<string, unknown> {
  const note = (d.note ?? '').trim();
  return {
    client_id: clientId,
    kind: d.kind,
    note: note || null,
    freeze_days: d.kind === 'freeze' ? d.freezeDays ?? null : null,
    status: 'open',
  };
}

// ---------- Phase 69: proposing a custom exercise to the gym ----------

/** The row for `custom_exercises_shared` (proposal to the gym library). [A-P69.2] column names are guesses, like [A-P68.5]. */
export function proposalRow(ex: { slug: string; name: string; [k: string]: unknown }, clientId: string): Record<string, unknown> {
  return { client_id: clientId, slug: ex.slug, name: ex.name, definition: ex, status: 'proposed' };
}

// Phase 79: pure rules for recovery questions (R3) and the forgot-password ticket (R7-R9). Contract connected-api 1.1.0
// (`free-recovery-set`, `free-reset-*`), docs/GYM_CONNECTION.md P74-1 and P74-4, docs/RECOVERY_PLAN.md section 8.
// No DOM, no network, no clock: time is a parameter. The client that sends things is `src/data/gym/freeAccount.ts`.

export const RECOVERY_PROMPT_IDS = ['p1', 'p2'] as const;
export type RecoveryPromptId = (typeof RECOVERY_PROMPT_IDS)[number];
/** [A-P79.1] Shortest and longest answer, counted after trimming. The server normalises and has the final say. */
export const MIN_ANSWER_CHARS = 3;
export const MAX_ANSWER_CHARS = 100;
/** [A-R6] A ticket runs out after 7 days; a lock after wrong answers lasts 24 hours. */
export const TICKET_LIFE_MS = 7 * 24 * 3600_000;
export const LOCK_MS = 24 * 3600_000;

export type RecoveryAnswers = Record<RecoveryPromptId, string>;
export type AnswersCheck = { ok: true; answers: RecoveryAnswers } | { ok: false; fields: RecoveryPromptId[] };

/** R3: both answers are needed (no skip). Trimmed; too short or too long marks the field. */
export function validateAnswers(a: Partial<Record<RecoveryPromptId, string>>): AnswersCheck {
  const out = {} as RecoveryAnswers;
  const bad: RecoveryPromptId[] = [];
  for (const id of RECOVERY_PROMPT_IDS) {
    const v = (a[id] ?? '').trim();
    if (v.length < MIN_ANSWER_CHARS || v.length > MAX_ANSWER_CHARS) bad.push(id);
    out[id] = v;
  }
  return bad.length ? { ok: false, fields: bad } : { ok: true, answers: out };
}

// ---------------------------------------------------------------- R7 facts

export const SESSIONS_BANDS = ['0-9', '10-29', '30-99', '100-299', '300+'] as const;
export type SessionsBand = (typeof SESSIONS_BANDS)[number];
/** `bk.fp.band.<n>` is the label of the band at index n. */
export const bandIndex = (b: SessionsBand): number => SESSIONS_BANDS.indexOf(b);
export const isBand = (s: string): s is SessionsBand => (SESSIONS_BANDS as readonly string[]).includes(s);
export const isYearMonth = (s: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export interface ForgotInput {
  identifier: string;
  firstMonth: string;
  lastMonth: string;
  band: string;
  answers: Partial<Record<RecoveryPromptId, string>>;
}
export type ForgotField = 'identifier' | 'first_month' | 'last_month' | 'sessions_band' | RecoveryPromptId;
export interface ResetRequestBody {
  identifier: string;
  facts: { first_month: string; last_month: string; sessions_band: SessionsBand };
  answers: RecoveryAnswers;
  website: '';
}
export type ForgotCheck = { ok: true; body: ResetRequestBody } | { ok: false; fields: ForgotField[] };

/**
 * R7 "Send request": every box must be filled. A month is `YYYY-MM`, not after `nowYm`; the last month is not before the
 * first. `identifier` is the free id or username already normalised by the caller. `website` is always empty (the decoy box).
 */
export function validateForgot(i: ForgotInput, nowYm: string): ForgotCheck {
  const bad: ForgotField[] = [];
  if (i.identifier.trim() === '') bad.push('identifier');
  const firstOk = isYearMonth(i.firstMonth) && i.firstMonth <= nowYm;
  const lastOk = isYearMonth(i.lastMonth) && i.lastMonth <= nowYm;
  if (!firstOk) bad.push('first_month');
  if (!lastOk || (firstOk && i.lastMonth < i.firstMonth)) bad.push('last_month');
  if (!isBand(i.band)) bad.push('sessions_band');
  const a = validateAnswers(i.answers);
  if (!a.ok) bad.push(...a.fields);
  if (bad.length || !a.ok || !isBand(i.band)) return { ok: false, fields: bad };
  return { ok: true, body: { identifier: i.identifier.trim(), facts: { first_month: i.firstMonth, last_month: i.lastMonth, sessions_band: i.band }, answers: a.answers, website: '' } };
}

// ---------------------------------------------------------------- the ticket on this phone

export type ResetStatus = 'cooling' | 'waiting' | 'approved' | 'denied' | 'cancelled' | 'expired' | 'redeemed';
const STATUSES: readonly string[] = ['cooling', 'waiting', 'approved', 'denied', 'cancelled', 'expired', 'redeemed'];
export const isResetStatus = (s: unknown): s is ResetStatus => typeof s === 'string' && STATUSES.includes(s);

/** What the phone remembers about its one request. The answers are never here. */
export interface TicketRec {
  identifier: string;
  code: string;
  readyAfter: string | null;
  createdAt: number;
}

export interface TicketInput {
  status: ResetStatus;
  readyAfter?: string | null;
  redeemUntil?: string | null;
}
export interface TicketView {
  /** The status as shown (a ticket the server still calls open can be past its 7 days or its redeem window). */
  status: ResetStatus;
  /** `bk.fp.st.<status>`. */
  key: string;
  /** The date for `{date}`, when there is one (ISO text from the server). */
  date: string | null;
  open: boolean;
  canCheck: boolean;
  canRedeem: boolean;
  /** Needs a phone that is signed in to this very account (the cancel call carries its token). */
  canCancel: boolean;
}
const ts = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isNaN(n) ? null : n;
};
export const isOpen = (s: ResetStatus): boolean => s === 'cooling' || s === 'waiting' || s === 'approved';

/**
 * R8: the line and the buttons for a status. Expiry is checked on the phone too, so a stale ticket reads as "ran out" even
 * before the server is asked again: an approved ticket past `redeem_until`, any open ticket older than 7 days.
 */
export function ticketView(t: TicketInput, o: { now: number; createdAt: number; signedInSameAccount: boolean }): TicketView {
  let status = t.status;
  const until = ts(t.redeemUntil);
  if (status === 'approved' && until !== null && o.now > until) status = 'expired';
  else if (isOpen(status) && o.now - o.createdAt > TICKET_LIFE_MS) status = 'expired';
  const open = isOpen(status);
  const date = status === 'approved' ? (t.redeemUntil ?? null) : status === 'cooling' || status === 'waiting' ? (t.readyAfter ?? null) : null;
  return { status, key: `bk.fp.st.${status}`, date, open, canCheck: status !== 'redeemed', canRedeem: status === 'approved', canCancel: open && o.signedInSameAccount };
}

/** One open ticket per account: a stored ticket that is still open sends the person to R8 instead of a second request. */
export function canStartRequest(stored: TicketRec | null, last: ResetStatus | null, now: number): boolean {
  if (!stored) return true;
  const v = ticketView({ status: last ?? 'cooling', readyAfter: stored.readyAfter }, { now, createdAt: stored.createdAt, signedInSameAccount: false });
  return !v.open;
}

/** Does a typed id or username point at the account this phone is signed in to? (free id upper-cased, username lower-cased). */
export function sameAccount(identifier: string, acct: { free_id: string; username: string | null } | null): boolean {
  if (!acct) return false;
  const v = identifier.trim();
  return v.toUpperCase() === acct.free_id.toUpperCase() || (acct.username !== null && v.toLowerCase() === acct.username.toLowerCase());
}

/**
 * Docs RECOVERY_PLAN section 8, edge 9: a phone that is still signed in and holds an open ticket for its own account shows
 * "A reset was requested, cancel?". [A-P79.2] The contract gives a signed-in phone no way to LEARN of a ticket made elsewhere, so
 * today this fires only for a ticket this phone knows.
 */
export const showCancelPrompt = (status: ResetStatus | null, signedInSameAccount: boolean): boolean => !!status && isOpen(status) && signedInSameAccount;

/** The lock after wrong answers (`SFE708`): until when the Send button stays off. */
export const lockedUntil = (now: number): number => now + LOCK_MS;
export const isLocked = (until: number | null | undefined, now: number): boolean => typeof until === 'number' && now < until;

// Phase 78: pure rules for the free backup account (contract connected-api 1.1.0 "Identity of a free account", docs/GYM_CONNECTION.md
// P74-1 R1-R5 and R11, P74-4). No DOM, no network, no clock: randomness is a parameter. The client that sends things is
// `src/data/gym/freeAccount.ts`.
import type { BackupMode } from './backupPlan';

/** [A-P74.5] The consent wording version sent with `free-signup`. Change only with the wording. */
export const FREE_CONSENT_VERSION = 1;
/** `free-signup` is retried with a new username this many times on SFE701 before the person sees anything. */
export const MAX_SIGNUP_TRIES = 3;
export const PASSWORD_LENGTH = 16;

export interface FreeShard { id: string; url: string; anonKey: string }

/** [A-P74.2] `VITE_FREE_SHARDS` is a JSON array of `{id,url,anonKey}`. Anything malformed is dropped; empty = free backup is hidden. */
export function parseFreeShards(raw: unknown): FreeShard[] {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try { v = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  const out: FreeShard[] = [];
  for (const x of v) {
    const o = x as Partial<FreeShard> | null;
    if (!o || typeof o.id !== 'string' || typeof o.url !== 'string' || typeof o.anonKey !== 'string') continue;
    if (!/^F\d+$/.test(o.id) || !/^https:\/\/[^\s/]+/.test(o.url) || o.anonKey.length < 8) continue;
    out.push({ id: o.id, url: o.url.replace(/\/$/, ''), anonKey: o.anonKey });
  }
  return out;
}

export interface FreeConfig { shards: FreeShard[]; functionsUrl: string; coreAnon: string }
/** Free backup needs at least one shard, the core functions URL and its public anon key. Otherwise nothing is offered. */
export const freeConfigReady = (c: FreeConfig | null | undefined): boolean => !!c && c.shards.length > 0 && /^https:\/\//.test(c.functionsUrl) && c.coreAnon.length >= 8;

// ---------------------------------------------------------------- identity

const USER_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
/** `lifter-7k2q`: lowercase `a-z0-9-`, 4-24 characters. `rand` is in [0, 1). */
export function makeUsername(rand: () => number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += USER_ALPHABET[Math.min(USER_ALPHABET.length - 1, Math.floor(rand() * USER_ALPHABET.length))];
  return `lifter-${s}`;
}
export const isValidUsername = (s: string): boolean => /^[a-z0-9-]{4,24}$/.test(s);

// No look-alikes (0 O 1 l I). Mixed case, digits and a few symbols that survive copy and paste.
const PW_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PW_DIGITS = '23456789';
const PW_ALPHABET = PW_LETTERS + PW_DIGITS;
/** 16 characters, always at least one letter and one digit (the server rule). `randInt(n)` returns an unbiased integer in [0, n). */
export function makePassword(randInt: (n: number) => number): string {
  const chars: string[] = [];
  for (let i = 0; i < PASSWORD_LENGTH; i++) chars.push(PW_ALPHABET.charAt(randInt(PW_ALPHABET.length)));
  if (!chars.some((c) => PW_DIGITS.includes(c))) chars[randInt(PASSWORD_LENGTH)] = PW_DIGITS.charAt(randInt(PW_DIGITS.length));
  // No letter means all 16 are digits, so replacing any one still leaves digits.
  if (!chars.some((c) => PW_LETTERS.includes(c))) chars[randInt(PASSWORD_LENGTH)] = PW_LETTERS.charAt(randInt(PW_LETTERS.length));
  return chars.join('');
}
export const isValidPassword = (p: string): boolean => p.length >= 10 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);

const EMAIL_DOMAIN = 'free.shieldfit.app';
/** The login email in the free shard's Auth: `<free_id lowercase>@free.shieldfit.app`. */
export const freeEmail = (freeId: string): string => `${freeId.toLowerCase()}@${EMAIL_DOMAIN}`;
/** `fr1-7k2q9@free.shieldfit.app` -> `FR1-7K2Q9`; null when it is not a free email. */
export function freeIdFromEmail(email: string): string | null {
  const m = /^(fr\d+-[a-z0-9]{5})@free\.shieldfit\.app$/i.exec(email.trim());
  return m ? (m[1] ?? '').toUpperCase() : null;
}
/** A typed free id or username: trimmed; a free id is upper-cased, a username lower-cased. Empty = null. */
export function normaliseIdentifier(s: string): string | null {
  const v = s.trim();
  if (v === '') return null;
  return /^fr\d+-/i.test(v) ? v.toUpperCase() : v.toLowerCase();
}

// ---------------------------------------------------------------- stored account

/** What the phone remembers about its free account. The password is never here. `saved` = the person ticked "I saved it". */
export interface FreeAccountRec {
  free_id: string;
  /** null when the person signed in with a free id on a reinstall (the server answers with an email only). */
  username: string | null;
  shard: FreeShard;
  uid: string;
  saved: boolean;
}

/** R1 (docs P74-1): which of the four layouts to show, and which buttons. */
export type BackupHomeView =
  | { kind: 'hidden' }
  /** No account: start (needs free_account + a configured shard), or sign in to an existing one. */
  | { kind: 'standalone'; canStart: boolean; signInFirst: boolean }
  /** An account was made and its password was saved, but the first backup did not finish. */
  | { kind: 'finish' }
  | { kind: 'free' }
  | { kind: 'connected' };

export interface BackupHomeInput {
  cloudBackupOn: boolean;
  freeAccountOn: boolean;
  configReady: boolean;
  mode: BackupMode;
  account: Pick<FreeAccountRec, 'saved'> | null;
  /** This phone holds no workouts yet (a reinstall): the sign-in offer goes first. */
  phoneEmpty: boolean;
}
export function backupHomeView(i: BackupHomeInput): BackupHomeView {
  if (!i.cloudBackupOn) return { kind: 'hidden' };
  if (i.mode === 'connected') return { kind: 'connected' };
  if (i.mode === 'free_backup') return { kind: 'free' };
  if (i.account?.saved) return { kind: 'finish' };
  const canStart = i.freeAccountOn && i.configReady;
  return { kind: 'standalone', canStart, signInFirst: canStart && i.phoneEmpty };
}

// ---------------------------------------------------------------- errors (P74-4)

export interface FreeErrorView { key: string; retryAfter?: number; fields?: string[]; goSignIn?: boolean }
/**
 * The words for a failed free-account call. The app branches on `code` (and `retry_after`), never on message text.
 * A code the table does not know shows the server's `message`, else the generic line (the caller passes `message`).
 */
export function freeError(code: string | undefined, o: { retryAfter?: number; fields?: { field: string }[] } = {}): FreeErrorView {
  switch (code) {
    case 'OFFLINE': return { key: 'bk.offline' };
    case 'SFE004': return { key: 'bk.err.rate', retryAfter: o.retryAfter ?? 30 };
    case 'SFE001': return { key: 'bk.err.fields', fields: (o.fields ?? []).map((f) => f.field) };
    case 'SFE006': return { key: 'bk.err.origin' };
    case 'SFE101': return { key: 'bk.err.id' };
    case 'SFE201': return { key: 'bk.err.auth', goSignIn: true };
    case 'SFE501': return { key: 'bk.err.consent' };
    case 'SFE705': return { key: 'bk.err.paused' };
    case 'SFE002': return { key: 'bk.err.denied' };
    case 'SFE703': return { key: 'bk.err.big' };
    case 'SFE704': return { key: 'bk.err.keys' };
    case 'SFE706': return { key: 'bk.err.invalid' };
    case 'SFE707': return { key: 'bk.err.newer' };
    case 'SFE708': return { key: 'bk.err.locked' };
    case 'SFE709': return { key: 'bk.err.noticket' };
    case 'SFE710': return { key: 'bk.err.notready' };
    case 'RECOVERY': return { key: 'bk.q.need' };
    default: return { key: 'bk.err.generic' };
  }
}

/** Free-account modes only ever move along these edges; the mode flips after the step succeeded, never before. */
export const canMoveMode = (from: BackupMode, to: BackupMode): boolean =>
  from === to ||
  (from === 'standalone' && to === 'free_backup') ||
  (from === 'free_backup' && to === 'standalone') ||
  (from === 'free_backup' && to === 'connected') ||
  (from === 'standalone' && to === 'connected') ||
  (from === 'connected' && to === 'standalone');

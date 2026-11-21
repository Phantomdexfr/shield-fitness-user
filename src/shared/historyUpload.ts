// One-time history upload rules (Phase 69), pure. Spec: docs/GYM_CONNECTION.md section 10 (S10) and docs/SYNC_SPEC.md.
// The upload only QUEUES rows into the normal outbox; the engine sends them (batches of 50, idempotent by client_id).

import { BATCH_MAX } from './sync';

/** Stores whose rows go up. Never: photos, prefs (local preferences, reminders, followed-program links), backup files. */
export const UPLOAD_STORES = ['sessions', 'routines', 'customExercises', 'bodyStats', 'goals', 'intake', 'marks', 'favourites'] as const;
export type UploadStore = (typeof UPLOAD_STORES)[number];

export const ASK_AGAIN_MS = 7 * 86_400_000;
export const MAX_ASKS = 3;
/** "More than 500 rows": show the Wi-Fi line before starting. */
export const WIFI_LINE_ABOVE = 500;
const OLD_MS = 24 * 30.4375 * 86_400_000; // 24 months

export type UploadAnswer = 'upload' | 'not_now' | 'never';
export interface UploadState {
  /** The gym this state belongs to; a different gym starts a fresh state. */
  gymId: string;
  answer: UploadAnswer | null;
  /** How many times the member said "Not now", and when last asked (ms UTC). */
  asks: number;
  lastAskedAt: number | null;
  /** True once Upload was chosen and not cancelled. */
  running: boolean;
  /** Keys `store:client_id` already queued (survives a kill; the outbox row itself is the proof of sending). */
  queued: string[];
  finishedAt: number | null;
}
export const freshUpload = (gymId: string): UploadState => ({ gymId, answer: null, asks: 0, lastAskedAt: null, running: false, queued: [], finishedAt: null });

/** Should the app ask now? Only after sign-in + password change (the caller passes `ready`). Never when finished, "Never", or asked 3 times. */
export function shouldAsk(s: UploadState, ready: boolean, now: number): boolean {
  if (!ready || s.finishedAt !== null || s.running) return false;
  if (s.answer === 'never') return false;
  if (s.answer === 'not_now') return s.asks < MAX_ASKS && s.lastAskedAt !== null && now - s.lastAskedAt >= ASK_AGAIN_MS;
  return s.answer === null;
}

export function answerUpload(s: UploadState, a: UploadAnswer, now: number): UploadState {
  if (a === 'upload') return { ...s, answer: 'upload', running: true, finishedAt: null };
  if (a === 'never') return { ...s, answer: 'never', running: false };
  return { ...s, answer: 'not_now', asks: s.asks + 1, lastAskedAt: now, running: false };
}

export interface LocalRow {
  store: UploadStore;
  client_id: string;
  updated_at: number;
  deleted_at?: number | null;
  /** True for a routine that mirrors a followed gym program (never uploaded). */
  followed?: boolean;
}
export const rowKey = (r: { store: string; client_id: string }): string => `${r.store}:${r.client_id}`;

/** Rows still to queue: live, user-made, not queued yet, newest first, rows older than 24 months last. A stable order, so a resume continues the same list. */
export function planUpload(rows: readonly LocalRow[], queued: readonly string[], now: number): LocalRow[] {
  const done = new Set(queued);
  const todo = rows.filter((r) => r.deleted_at == null && !r.followed && !done.has(rowKey(r)) && (UPLOAD_STORES as readonly string[]).includes(r.store));
  const cut = now - OLD_MS;
  return todo.sort((a, b) => {
    const oa = a.updated_at < cut ? 1 : 0;
    const ob = b.updated_at < cut ? 1 : 0;
    return oa - ob || b.updated_at - a.updated_at || (rowKey(a) < rowKey(b) ? -1 : 1);
  });
}

/** The next step of a run: at most one batch. */
export const nextBatch = <T>(plan: readonly T[], size = BATCH_MAX): T[] => plan.slice(0, size);

export interface UploadProgress {
  total: number;
  queued: number;
  left: number;
  percent: number;
  wifiLine: boolean;
}
export function uploadProgress(plan: readonly unknown[], queued: readonly string[]): UploadProgress {
  const total = plan.length + queued.length;
  return { total, queued: queued.length, left: plan.length, percent: total === 0 ? 100 : Math.floor((queued.length / total) * 100), wifiLine: total > WIFI_LINE_ABOVE };
}

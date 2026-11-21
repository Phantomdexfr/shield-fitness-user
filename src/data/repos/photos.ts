// Progress photos repo (Phase 55). Device only: rows live in the `photos` store, which is in NEVER_SYNCED, so a photo is never
// queued to the outbox and never leaves the device (it is in a backup file only when the person ticks that option).
// `data` is a data URL (the page shrinks the picture before it gets here).

import { photosRepo } from '../local';
import { istDayKey, isDayKey, type DayKey } from '../../shared/dates';

export interface ProgressPhoto {
  id: string;
  day: DayKey;
  mime: string;
  data: string;
  addedAt: number;
}

export const MAX_PHOTOS = 200;
const OK_MIME = /^image\/(jpeg|png|webp)$/;

export async function listPhotos(): Promise<ProgressPhoto[]> {
  const rows = await photosRepo.list();
  const out: ProgressPhoto[] = [];
  for (const r of rows) {
    if (typeof r.data !== 'string' || !OK_MIME.test(r.mime)) continue;
    const addedAt = typeof r.updated_at === 'number' ? r.updated_at : 0;
    const day = typeof r.day === 'string' && isDayKey(r.day) ? r.day : istDayKey(addedAt);
    out.push({ id: r.client_id, day, mime: r.mime, data: r.data, addedAt });
  }
  // newest day first; on one day the later one first
  return out.sort((a, b) => (a.day === b.day ? b.addedAt - a.addedAt : a.day < b.day ? 1 : -1));
}

/** Saves one photo (data URL). Returns null when it is not an image or the cap is reached. */
export async function addPhoto(mime: string, data: string, nowMs: number = Date.now()): Promise<string | null> {
  if (!OK_MIME.test(mime) || !data.startsWith(`data:${mime}`)) return null;
  if ((await photosRepo.list()).length >= MAX_PHOTOS) return null;
  const row = await photosRepo.put({ mime, data, day: istDayKey(nowMs) });
  return row.client_id;
}

export async function removePhoto(id: string): Promise<void> {
  await photosRepo.remove(id);
}

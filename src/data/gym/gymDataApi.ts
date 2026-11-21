// What the gym screens call (Phase 68): a hook for the cached data and the member's actions. Screens import it through
// `src/data/repos/gymLink.ts`. The remote is reached only through the link (no Supabase import here).

import { useEffect, useState } from 'preact/hooks';
import { getConnection } from './connection';
import { emptyCache, markInboxItemRead, onGymData, queueRequest, readCache, requestList, type GymCache, type RequestItem } from './gymData';
import { syncNow, withRemote } from './link';
import type { RequestDraft } from '../../shared/gymData';

export interface GymData extends GymCache {
  loaded: boolean;
  queuedAndSent: RequestItem[];
  memberCode: string | null;
}

export function useGymData(): GymData {
  const [d, setD] = useState<GymData>({ ...emptyCache(), loaded: false, queuedAndSent: [], memberCode: null });
  useEffect(() => {
    let live = true;
    const load = async () => {
      const [c, list, conn] = await Promise.all([readCache(), requestList(), getConnection()]);
      if (live) setD({ ...c, loaded: true, queuedAndSent: list, memberCode: conn?.memberCode ?? null });
    };
    void load();
    const off = onGymData(() => void load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return d;
}

const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Queue a request now (works offline) and try to send it at once. */
export async function submitRequest(draft: RequestDraft) {
  const r = await queueRequest(draft, newId(), Date.now());
  if (r.ok) void syncNow('manual').catch(() => undefined);
  return r;
}
export async function markRead(id: string): Promise<void> {
  await withRemote((rem) => markInboxItemRead(rem, id, Date.now()), () => markInboxItemRead(null, id, Date.now()));
}
export async function refreshGymNow(): Promise<void> {
  await syncNow('manual');
}

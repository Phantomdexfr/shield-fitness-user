// "Propose to gym" (Phase 69): a custom exercise sent to the gym library (`custom_exercises_shared`, insert own, read own).
// Queued on the phone (works offline) in one `prefs` row and sent on the next sync, idempotent by client_id [A-P69.2].
// Nothing is removed from the member's own exercise; the gym decides what happens next.

import { newClientId, prefsRepo } from '../local';
import { getCustom } from '../repos/customExercises';
import { proposalRow } from '../../shared/gymData';
import type { Remote } from './types';

const ROW = 'gym:proposals';
export interface Proposal {
  slug: string;
  clientId: string;
  queuedAt: number;
  /** null while waiting to be sent */
  sentAt: number | null;
}

export async function readProposals(): Promise<Proposal[]> {
  try {
    return ((await prefsRepo.get(ROW))?.value as Proposal[] | undefined) ?? [];
  } catch {
    return [];
  }
}
const write = (list: Proposal[]) => prefsRepo.put({ client_id: ROW, value: list } as never).then(() => notify());

export type ProposeResult = 'queued' | 'already' | 'not_found' | 'not_custom';

/** Queue a proposal for one of the member's own exercises. Proposing the same exercise twice does nothing. */
export async function proposeExercise(slug: string, now: number): Promise<ProposeResult> {
  if (!slug.startsWith('my-')) return 'not_custom';
  const list = await readProposals();
  if (list.some((p) => p.slug === slug)) return 'already';
  if (!(await getCustom(slug))) return 'not_found';
  await write([...list, { slug, clientId: newClientId(), queuedAt: now, sentAt: null }]);
  return 'queued';
}

/** Send the waiting ones. A refused one stays queued; nothing is dropped. */
export async function flushProposals(remote: Remote, online: () => boolean, now: number): Promise<number> {
  if (!online()) return 0;
  const list = await readProposals();
  let sent = 0;
  const next: Proposal[] = [];
  for (const p of list) {
    if (p.sentAt !== null) {
      next.push(p);
      continue;
    }
    const ex = await getCustom(p.slug);
    if (!ex) continue; // deleted before it went out: nothing to send
    const res = await remote.insertProposal(proposalRow(ex as never, p.clientId));
    if (res.error) next.push(p);
    else {
      sent += 1;
      next.push({ ...p, sentAt: now });
    }
  }
  if (sent || next.length !== list.length) await write(next);
  return sent;
}

export async function clearProposals(): Promise<void> {
  await prefsRepo.remove(ROW).catch(() => undefined);
  notify();
}

const listeners = new Set<() => void>();
export const onProposals = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function notify(): void {
  listeners.forEach((l) => l());
}

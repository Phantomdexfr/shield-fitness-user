import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bodyStatsRepo, listOutbox, photosRepo, prefsRepo, resetDb, routinesRepo, sessionsRepo, setClock, setOutboxEnabled } from '../../src/data/local';
import { __resetConnectionCache, saveConnection } from '../../src/data/gym/connection';
import { answer, askNow, cancelUpload, readUploadState, runUpload, uploadStep, uploadView } from '../../src/data/gym/historyUpload';
import { answerUpload, freshUpload, planUpload, shouldAsk, ASK_AGAIN_MS } from '../../src/shared/historyUpload';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

async function seed(n: number) {
  setClock(() => NOW - 5 * DAY);
  setOutboxEnabled(false); // made before connecting: nothing queued
  for (let i = 0; i < n; i++) await sessionsRepo.put({ client_id: `s${i}`, items: [] } as never);
  await bodyStatsRepo.put({ client_id: 'b1', weightKg: 80 } as never);
  await routinesRepo.put({ client_id: 'r-mine', id: 'r-mine', name: 'Mine', days: [], source: 'mine' } as never);
  await routinesRepo.put({ client_id: 'gym-prog:x', id: 'gym-prog:x', name: 'Followed', days: [], source: 'gym', followed: true } as never);
  await photosRepo.put({ client_id: 'ph1', mime: 'image/png', data: 'x' } as never);
  await prefsRepo.put({ client_id: 'some-pref', value: 1 } as never);
}
const connect = async () => {
  await saveConnection({ config: {} as never, host: 'gym.example', connectedAt: NOW, signedIn: true, mustChangePassword: false, versionMismatch: false });
  setOutboxEnabled(true);
};

beforeEach(async () => {
  await resetDb(true);
  __resetConnectionCache();
  setOutboxEnabled(false);
});

describe('history upload rules (pure)', () => {
  it('asks once; Not now waits 7 days, three times at most; Never stops; done stops', () => {
    let s = freshUpload('g');
    expect(shouldAsk(s, false, NOW)).toBe(false);
    expect(shouldAsk(s, true, NOW)).toBe(true);
    s = answerUpload(s, 'not_now', NOW);
    expect(shouldAsk(s, true, NOW + ASK_AGAIN_MS - 1)).toBe(false);
    expect(shouldAsk(s, true, NOW + ASK_AGAIN_MS)).toBe(true);
    s = answerUpload(answerUpload(s, 'not_now', NOW + ASK_AGAIN_MS), 'not_now', NOW + 2 * ASK_AGAIN_MS);
    expect(s.asks).toBe(3);
    expect(shouldAsk(s, true, NOW + 99 * ASK_AGAIN_MS)).toBe(false);
    expect(shouldAsk(answerUpload(freshUpload('g'), 'never', NOW), true, NOW + 99 * ASK_AGAIN_MS)).toBe(false);
    expect(shouldAsk({ ...freshUpload('g'), finishedAt: NOW }, true, NOW)).toBe(false);
  });

  it('plans newest first, rows older than 24 months last, skipping deleted, followed and already queued', () => {
    const old = NOW - 800 * DAY;
    const rows = [
      { store: 'sessions' as const, client_id: 'old', updated_at: old },
      { store: 'sessions' as const, client_id: 'new', updated_at: NOW - DAY },
      { store: 'sessions' as const, client_id: 'mid', updated_at: NOW - 30 * DAY },
      { store: 'sessions' as const, client_id: 'del', updated_at: NOW, deleted_at: NOW },
      { store: 'routines' as const, client_id: 'f', updated_at: NOW, followed: true },
      { store: 'goals' as const, client_id: 'done', updated_at: NOW },
    ];
    expect(planUpload(rows, ['goals:done'], NOW).map((r) => r.client_id)).toEqual(['new', 'mid', 'old']);
  });
});

describe('history upload (store)', () => {
  it('queues only user rows, in batches of 50, and finishes', async () => {
    await seed(120);
    await connect();
    await answer('upload', NOW);
    const a = await uploadStep(NOW);
    expect(a).toEqual({ queued: 50, more: true });
    expect((await listOutbox()).length).toBe(50);
    await uploadStep(NOW);
    const c = await uploadStep(NOW);
    expect(c.more).toBe(false);
    const out = await listOutbox();
    expect(out.length).toBe(122); // 120 sessions + 1 body stat + 1 own routine
    expect(out.some((o) => o.client_id === 'gym-prog:x' || o.table === 'photos' || o.table === 'prefs')).toBe(false);
    expect(new Set(out.map((o) => `${o.table}:${o.client_id}`)).size).toBe(122);
    const s = await readUploadState();
    expect(s?.running).toBe(false);
    expect(s?.finishedAt).toBe(NOW);
  });

  it('resumes after a kill without duplicates', async () => {
    await seed(70);
    await connect();
    await answer('upload', NOW);
    await uploadStep(NOW); // 50 queued, then the app is killed: only the saved state survives
    const queuedBefore = (await listOutbox()).length;
    // Simulate a kill between enqueue and save: forget the saved keys, the rows are still waiting in the outbox.
    const st = await readUploadState();
    const { prefsRepo: pr } = await import('../../src/data/local');
    await pr.put({ client_id: 'gym:upload', value: { 'gym.example': { ...st!, queued: [] } } } as never);
    await uploadStep(NOW);
    await uploadStep(NOW);
    const out = await listOutbox();
    expect(queuedBefore).toBe(50);
    expect(out.length).toBe(72); // 70 + body stat + own routine, each once
    expect(new Set(out.map((o) => `${o.table}:${o.client_id}`)).size).toBe(72);
  });

  it('runUpload sends each batch, asks for the stats refresh once at the end, and cancel keeps what went up', async () => {
    await seed(60);
    await connect();
    await answer('upload', NOW);
    let pushes = 0;
    let summaries = 0;
    const res = await runUpload({ push: async () => void pushes++, summary: async () => void summaries++, online: () => true, now: () => NOW });
    expect(res).toBe('finished');
    expect(pushes).toBe(2);
    expect(summaries).toBe(1);

    await resetDb(true);
    __resetConnectionCache();
    await seed(120);
    await connect();
    await answer('upload', NOW);
    let calls = 0;
    const r2 = await runUpload({ push: async () => void calls++, summary: async () => undefined, online: () => true, now: () => NOW, stopped: () => calls >= 1 });
    expect(r2).toBe('cancelled');
    expect((await listOutbox()).length).toBe(50);
    expect((await readUploadState())?.running).toBe(false);
    const v = await uploadView(NOW);
    expect(v?.progress.queued).toBe(50);
    expect(v?.progress.left).toBe(72);
  });

  it('offline: nothing is queued and the run says so', async () => {
    await seed(5);
    await connect();
    await answer('upload', NOW);
    expect(await runUpload({ push: async () => undefined, summary: async () => undefined, online: () => false, now: () => NOW })).toBe('offline');
    expect((await listOutbox()).length).toBe(0);
  });

  it('asks only after sign-in and password change, and another gym is asked again', async () => {
    await seed(1);
    await saveConnection({ config: {} as never, host: 'gym.example', connectedAt: NOW, signedIn: true, mustChangePassword: true, versionMismatch: false });
    expect(await askNow(NOW)).toBe(false);
    await saveConnection({ config: {} as never, host: 'gym.example', connectedAt: NOW, signedIn: true, mustChangePassword: false, versionMismatch: false });
    expect(await askNow(NOW)).toBe(true);
    await answer('never', NOW);
    expect(await askNow(NOW)).toBe(false);
    await cancelUpload();
    await saveConnection({ config: {} as never, host: 'other.example', connectedAt: NOW, signedIn: true, mustChangePassword: false, versionMismatch: false });
    expect(await askNow(NOW)).toBe(true);
  });
});

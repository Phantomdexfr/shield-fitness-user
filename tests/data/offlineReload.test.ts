import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../../src/data/local';
import { putSession, listSessions } from '../../src/data/repos/sessions';
import { loadFinished } from '../../src/data/repos/history';
import { addItem, finish, logSet, startFree } from '../../src/shared/session';

beforeEach(async () => {
  await resetDb(true);
});

// Phase 64 offline scenario: nothing here touches a network. A "reload" closes the database connection and opens it again.
describe('log a session, reload, history intact', () => {
  it('an autosaved set and a finished session survive a reload', async () => {
    const t0 = Date.UTC(2026, 10, 20, 4, 0);
    let s = addItem(startFree('s1', t0), { kind: 'library', refId: 'ab-wheel-pike-roll' } as never);
    s = logSet(s, 0, { weightKg: 20, reps: 10, tag: 'normal', doneAt: new Date(t0 + 60_000).toISOString() });
    await putSession(s); // autosave after the first set
    await resetDb(); // app killed and reopened
    const open = (await listSessions()).find((x) => x.id === 's1');
    expect(open?.items[0]?.sets.length).toBe(1);

    s = finish(open!, t0 + 600_000).session;
    await putSession(s);
    await resetDb(); // second reload
    const done = await loadFinished();
    expect(done.map((x) => x.id)).toEqual(['s1']);
    expect(done[0]?.items[0]?.sets[0]?.weightKg).toBe(20);
  });
});

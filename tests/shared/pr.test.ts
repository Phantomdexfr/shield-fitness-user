import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBoard, detectPRs, PR_METRICS, recordKey, recordsOf, sessionPRs, type PRHit } from '../../src/shared/pr';
import type { EngineSet, ExerciseResult, SetTag } from '../../src/shared/engine';
import type { Session } from '../../src/shared/session';
import { prKey } from '../../src/pages/exercise/setupModel';
import { prToastText, recordText } from '../../src/pages/progress/prText';

type Tup = [number | null, number | null, (number | null)?, SetTag?];
const toSet = (a: Tup): EngineSet => ({ weightKg: a[0], reps: a[1], ...(a[2] != null ? { rpe: a[2] } : {}), tag: a[3] ?? 'normal' });
const toResult = (sets: Tup[]): ExerciseResult => ({ sets: sets.map(toSet) });

const cases = JSON.parse(readFileSync('contract/fixtures/pr_cases.json', 'utf8'));
const boardFx = JSON.parse(readFileSync('contract/fixtures/pr_board.json', 'utf8'));

const toSession = (s: any): Session => ({
  id: s.id,
  clientId: s.id,
  startedAt: s.startedAt,
  ...(s.endedAt ? { endedAt: s.endedAt } : {}),
  items: s.items.map((it: any, i: number) => ({
    ref: { kind: 'lib', slug: it.slug },
    status: it.status,
    order: i,
    ...(it.setup ? { setup: it.setup } : {}),
    sets: it.sets.map((x: Tup) => ({ ...toSet(x), doneAt: s.startedAt })),
  })),
});

describe('detectPRs (fixtures)', () => {
  for (const c of cases.cases) {
    it(c.id, () => expect(detectPRs(c.history.map(toResult), toResult(c.current), c.opts)).toEqual(c.expected));
  }
});

describe('recordsOf (fixtures)', () => {
  for (const c of cases.records) it(c.id, () => expect(recordsOf([toResult(c.sets)])).toEqual(c.expected));
});

describe('buildBoard (fixtures)', () => {
  for (const c of boardFx.board) {
    it(c.id, () => {
      const got = buildBoard(c.sessions.map(toSession), c.separateByGrip);
      expect(got.map(({ slug: _s, ...rest }) => rest)).toEqual(c.expected);
    });
  }
  it('custom exercises are keyed by their slug', () => {
    const s = toSession({ id: 'c', startedAt: '2026-11-10T10:00:00.000Z', endedAt: '2026-11-10T11:00:00.000Z', items: [{ slug: 'x', status: 'done', sets: [[10, 10]] }] });
    s.items[0]!.ref = { kind: 'custom', id: 'abc' };
    expect(buildBoard([s], false, (id) => (id === 'abc' ? 'my-curl' : undefined)).map((c) => c.slug)).toEqual(['my-curl']);
  });
});

describe('sessionPRs (fixtures)', () => {
  for (const c of boardFx.session) {
    it(c.id, () => {
      const sessions: Session[] = c.sessions.map(toSession);
      const mine = sessions.find((s) => s.id === c.of)!;
      expect(sessionPRs(mine, sessions, c.separateByGrip).map(({ key, hits }) => ({ key, hits }))).toEqual(c.expected);
    });
  }
});

describe('keys and text', () => {
  it('recordKey matches the exercise page prKey', () => {
    for (const sep of [false, true]) for (const setup of [undefined, {}, { grip: 'pronated' as const }]) {
      expect(recordKey('lat-pulldown', setup, sep)).toBe(prKey('lat-pulldown', setup, sep));
    }
  });
  it('toast and record text', () => {
    expect(recordText('weight', 42.5)).toBe('42.5 kg');
    expect(recordText('reps', 12)).toBe('12 reps');
    expect(recordText('e1rm', 116.67)).toBe('116.5 kg');
    const hit: PRHit = { metric: 'weight', value: 42.5, previous: 40 };
    expect(prToastText(hit)).toBe('New heaviest set: 42.5 kg (was 40 kg)');
    expect(prToastText({ metric: 'reps', value: 12, previous: null })).toBe('New record: 12 reps');
  });
});

describe('properties (seeded)', () => {
  const rng = (seed: number) => {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  };
  const rand = (r: () => number): ExerciseResult => ({
    sets: Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
      weightKg: r() < 0.2 ? null : Math.floor(r() * 40) * 2.5,
      reps: Math.floor(r() * 18),
      tag: (['normal', 'normal', 'warmup', 'drop', 'superset'] as const)[Math.floor(r() * 5)],
    })),
  });
  it('a hit always beats the earlier record, ties never hit, warm-ups never change the answer', () => {
    const r = rng(7);
    for (let i = 0; i < 300; i++) {
      const hist = Array.from({ length: Math.floor(r() * 4) }, () => rand(r));
      const cur = rand(r);
      const before = recordsOf(hist);
      const hits = detectPRs(hist, cur);
      for (const h of hits) {
        expect(PR_METRICS).toContain(h.metric);
        expect(h.previous === null || h.value > h.previous).toBe(true);
        expect(h.previous).toBe(before[h.metric]);
      }
      expect(detectPRs(hist, { sets: [...cur.sets, { weightKg: 500, reps: 30, tag: 'warmup' }] })).toEqual(hits);
      expect(detectPRs(hist, { sets: [...cur.sets, { weightKg: 500, reps: 30, tag: 'drop' }] })).toEqual(hits);
      expect(detectPRs([...hist, cur], cur)).toEqual([]);
    }
  });
  it('no history and no other history never gives a PR', () => {
    const r = rng(9);
    for (let i = 0; i < 100; i++) expect(detectPRs([], rand(r))).toEqual([]);
  });
});

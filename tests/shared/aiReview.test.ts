import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AI_MAX_CHARS, AI_TRIM_NOTE, DEFAULT_INTRO, DEFAULT_OPTIONS, aiReviewText, rangeFor, type AiHistory, type AiInclude, type AiReviewOptions, type AiScope } from '../../src/shared/aiReview';
import { addDays } from '../../src/shared/dates';
import type { Session } from '../../src/shared/session';
import { copyWithFallback } from '../../src/pages/aiReview/copyText';
import { parsePrefs, DEFAULT_PREFS } from '../../src/data/repos/aiReview';

const load = (f: string) => JSON.parse(readFileSync(`contract/fixtures/${f}`, 'utf8'));
const session = load('aireview_session.json');
const range = load('aireview_range.json');
const exercise = load('aireview_exercise.json');
const trim = load('aireview_trim.json');
const privacy = load('aireview_privacy.json');

describe('aiReviewText fixtures', () => {
  for (const [file, fx] of [['session', session], ['range', range], ['exercise', exercise]] as const)
    for (const c of fx.cases)
      it(`${file}: ${c.name}`, () => {
        expect(aiReviewText(c.scope as AiScope, c.history as AiHistory, c.opts as AiReviewOptions)).toBe(c.expected);
      });

  it('is deterministic and does not change its input', () => {
    const c = session.cases[0];
    const before = JSON.stringify(c.history);
    const a = aiReviewText(c.scope, c.history, c.opts);
    expect(aiReviewText(c.scope, c.history, c.opts)).toBe(a);
    expect(JSON.stringify(c.history)).toBe(before);
  });

  it('is plain text: no markdown, no emoji, no tabs', () => {
    for (const c of [...session.cases, ...range.cases, ...exercise.cases]) {
      const text = aiReviewText(c.scope, c.history, c.opts);
      expect(text).not.toMatch(/[*_`#|]{2,}|\t|<[a-z]+>/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('a session that does not exist gives a short note, not a crash', () => {
    const c = session.cases[0];
    expect(aiReviewText({ kind: 'session', id: 'nope' }, c.history, c.opts)).toContain('SESSION: not found');
  });

  it('default options: notes, RPE, setups, PRs and muscles on; name, bodyweight and body stats off', () => {
    expect(DEFAULT_OPTIONS.include).toEqual({ notes: true, rpe: true, setups: true, prs: true, muscles: true, bodyweight: false, name: false, bodyStats: false });
    expect(DEFAULT_OPTIONS.intro).toBe(DEFAULT_INTRO);
    expect(DEFAULT_OPTIONS.units).toBe('kg');
  });
});

describe('range presets', () => {
  for (const p of range.presets)
    it(`${p.preset} ${JSON.stringify(p.custom ?? '')} -> ${JSON.stringify(p.expected)}`, () => {
      expect(rangeFor(p.preset, p.today, p.custom)).toEqual(p.expected);
    });
});

// ---------- trimming ----------

const day = (i: number, base: string) => addDays(base, i);
function benchSession(id: string, d: string, i: number): Session {
  return {
    id,
    clientId: id,
    startedAt: `${d}T04:30:00.000Z`,
    endedAt: `${d}T05:30:00.000Z`,
    dayName: 'Push',
    items: [{ ref: { kind: 'lib', slug: 'barbell-bench-press' }, status: 'done', order: 0, sets: [60 + (i % 20), 62 + (i % 20), 64 + (i % 20)].map((w) => ({ weightKg: w, reps: 5, tag: 'normal' as const, doneAt: `${d}T04:40:00.000Z` })) }],
  };
}
const histOf = (sessions: Session[]): AiHistory => ({ sessions, names: { 'barbell-bench-press': 'Barbell Bench Press' } });

describe('trimming at 12,000 characters', () => {
  it('cap and note text match the fixture', () => {
    expect(AI_MAX_CHARS).toBe(trim.cap);
    expect(AI_TRIM_NOTE).toBe(trim.trimNote);
  });

  for (const c of trim.cases)
    it(c.name, () => {
      const n: number = c.build.sessions;
      const base = c.build.kind === 'range' ? '2026-10-01' : '2025-01-06';
      const sessions = Array.from({ length: n }, (_, i) => benchSession(`t${i}`, day(i, base), i));
      const scope: AiScope =
        c.build.kind === 'exercise' ? { kind: 'exercise', slug: c.build.slug, lastN: c.build.lastN }
        : c.build.kind === 'range' ? { kind: 'range', from: '2026-10-01', to: '2026-10-31' }
        : { kind: 'session', id: 't1' };
      const text = aiReviewText(scope, histOf(sessions), { ...DEFAULT_OPTIONS, intro: null });
      const k = c.checks;
      expect(text.length).toBeLessThanOrEqual(k.maxChars);
      expect(text.includes(AI_TRIM_NOTE)).toBe(k.mustContainTrimNote);
      if (k.keepsNewestSession) {
        expect(text).toContain('Barbell Bench Press');
        expect(text).toContain('9 Feb 2026'); // 6 Jan 2025 + 399 days
        expect(text).toMatch(/SUMMARY \(all 400 sessions/);
      }
      if (k.dropsOldestSession) expect(text.split('\n').filter((l) => /^\w{3} \d+ \w{3} 2025 \|/.test(l)).length).toBeLessThan(400);
      if (k.noSessionsSection) expect(text).not.toContain('SESSIONS:');
      if (k.keepsWeeks) expect(text).toContain('Week of 2026-09-28');
      if (k.keepsTrends) expect(text).toContain('TRENDS');
      if (k.sessionLines !== undefined) expect(text.split('\n').filter((l) => /^\w{3} \d+ \w{3} \| Push/.test(l)).length).toBe(k.sessionLines);
    });

  it('drops the OLDEST detail first and keeps the newest line', () => {
    const sessions = Array.from({ length: 400 }, (_, i) => benchSession(`t${i}`, day(i, '2025-01-06'), i));
    const text = aiReviewText({ kind: 'exercise', slug: 'barbell-bench-press', lastN: 400 }, histOf(sessions), { ...DEFAULT_OPTIONS, intro: null });
    const lines = text.split('\n');
    const dated = lines.filter((l) => /^\w{3} \d+ \w{3} \d{4} \|/.test(l));
    expect(dated.length).toBeGreaterThan(50);
    expect(dated.length).toBeLessThan(400);
    expect(dated[dated.length - 1]).toContain('9 Feb 2026'); // the newest of the 400 (6 Jan 2025 + 399 days)
  });

  it('a huge intro still ends under the cap and says it trimmed', () => {
    const sessions = [benchSession('a', '2026-11-13', 1)];
    const text = aiReviewText({ kind: 'session', id: 'a' }, histOf(sessions), { ...DEFAULT_OPTIONS, intro: `${'long line '.repeat(30)}\n`.repeat(60) });
    expect(text.length).toBeLessThanOrEqual(AI_MAX_CHARS);
    expect(text).toContain(AI_TRIM_NOTE);
  });
});

// ---------- privacy ----------

describe('privacy: personal values appear only when opted in', () => {
  const sess = session.cases[0].history as AiHistory;
  const scopes: AiScope[] = [{ kind: 'session', id: 's1' }, { kind: 'range', from: '2026-11-01', to: '2026-11-30' }, { kind: 'exercise', slug: 'barbell-bench-press', lastN: 8 }];
  const flags = ['bodyweight', 'name', 'bodyStats'] as const;
  const mk = (on: Partial<AiInclude>): AiReviewOptions => ({ intro: null, units: 'kg', include: { ...DEFAULT_OPTIONS.include, bodyweight: false, name: false, bodyStats: false, ...on }, profile: privacy.profile });

  it('nothing personal with every flag off, for every scope', () => {
    for (const sc of scopes) {
      const text = aiReviewText(sc, sess, mk({}));
      for (const list of Object.values(privacy.forbiddenWhenOff) as string[][]) for (const f of list) expect(text).not.toContain(f);
      for (const a of privacy.alwaysAllowed as string[]) expect(text).toContain(a);
    }
  });

  it('property: 200 seeded random flag sets, each value appears if and only if its flag is on', () => {
    let seed = 20261120;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 200; i++) {
      const on: Partial<AiInclude> = {};
      for (const f of flags) on[f] = rnd() < 0.5;
      const sc = scopes[Math.floor(rnd() * scopes.length)] as AiScope;
      const opts = mk({ ...on, notes: rnd() < 0.5, rpe: rnd() < 0.5, setups: rnd() < 0.5, prs: rnd() < 0.5, muscles: rnd() < 0.5 });
      const text = aiReviewText(sc, sess, { ...opts, units: rnd() < 0.5 ? 'kg' : 'lb' });
      for (const f of flags) {
        const required = (privacy.requiredWhenOn as Record<string, string>)[f] as string;
        const lbText = f === 'bodyweight' ? 'bodyweight=' : required;
        if (on[f]) expect(text).toContain(lbText);
        else for (const bad of (privacy.forbiddenWhenOff as Record<string, string[]>)[f] as string[]) expect(text).not.toContain(bad);
      }
    }
  });

  it('opted in: the exact lines appear (kg)', () => {
    const text = aiReviewText(scopes[0] as AiScope, sess, mk({ name: true, bodyweight: true, bodyStats: true }));
    for (const line of Object.values(privacy.requiredWhenOn) as string[]) expect(text).toContain(line);
  });

  it('opted in but nothing typed: bodyweight is written as a dash, name and body stats add nothing', () => {
    const text = aiReviewText(scopes[0] as AiScope, sess, { intro: null, units: 'kg', include: { ...DEFAULT_OPTIONS.include, bodyweight: true, name: true, bodyStats: true } });
    expect(text).toContain('bodyweight=-');
    expect(text).not.toContain('NAME:');
    expect(text).not.toContain('BODY STATS:');
  });

  it('own notes are left out when notes is off, and RPE when RPE is off', () => {
    const text = aiReviewText(scopes[0] as AiScope, sess, { ...DEFAULT_OPTIONS, include: { ...DEFAULT_OPTIONS.include, notes: false, rpe: false } });
    expect(text).not.toContain('Note:');
    expect(text).not.toContain('RPE');
  });
});

// ---------- saved options + copy ----------

describe('saved options', () => {
  it('anything odd reads as the defaults', () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('x')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ units: 'stone', include: { notes: 'yes' } })).toEqual(DEFAULT_PREFS);
  });
  it('keeps valid values, an off intro and lb', () => {
    const p = parsePrefs({ intro: null, units: 'lb', include: { notes: false, muscles: false } });
    expect(p.intro).toBeNull();
    expect(p.units).toBe('lb');
    expect(p.include.notes).toBe(false);
    expect(p.include.muscles).toBe(false);
    expect(p.include.rpe).toBe(true);
  });
  it('never carries name, bodyweight or body stats', () => {
    expect(Object.keys(parsePrefs({ include: { name: true, bodyweight: true, bodyStats: true } }).include).sort()).toEqual(['muscles', 'notes', 'prs', 'rpe', 'setups']);
  });
});

describe('copy with fallback', () => {
  const area = () => {
    const calls: string[] = [];
    return { calls, select: () => void calls.push('select'), focus: () => void calls.push('focus'), setSelectionRange: (a: number, b: number) => void calls.push(`range ${a}-${b}`) };
  };

  it('uses the clipboard when it works and does not touch the area', async () => {
    let got = '';
    const a = area();
    expect(await copyWithFallback('hello', { clipboard: { writeText: async (t) => void (got = t) }, area: a })).toBe('copied');
    expect(got).toBe('hello');
    expect(a.calls).toEqual([]);
  });

  it('clipboard refuses -> the text is selected; legacy copy ok -> copied', async () => {
    const a = area();
    const r = await copyWithFallback('hello', { clipboard: { writeText: async () => { throw new Error('denied'); } }, area: a, execCopy: () => true });
    expect(r).toBe('copied');
    expect(a.calls).toContain('select');
    expect(a.calls).toContain('range 0-5');
  });

  it('no clipboard and legacy copy refused -> selected for a manual copy', async () => {
    const a = area();
    expect(await copyWithFallback('hello', { area: a, execCopy: () => false })).toBe('selected');
    expect(a.calls).toContain('select');
  });

  it('legacy copy throwing is survived', async () => {
    expect(await copyWithFallback('hi', { area: area(), execCopy: () => { throw new Error('no'); } })).toBe('selected');
  });

  it('no clipboard, no area, no legacy copy -> selected (nothing crashes)', async () => {
    expect(await copyWithFallback('hi', {})).toBe('selected');
  });
});

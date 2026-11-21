import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeToSecret, generateSecret, secretFromLink, secretToCode, shareLink } from '../../src/shared/planShare/secret';
import { CIPHERTEXT_CAP, PLAINTEXT_CAP, decryptEnvelope, deriveId, encryptEnvelope, fromBase64, toBase64, toHex } from '../../src/shared/planShare/crypto';
import { buildEnvelope, importPlan, parseEnvelope, type CustomSource, type PlanEnvelope } from '../../src/shared/planShare/envelope';
import type { Routine } from '../../src/shared/routine';

const load = (f: string) => JSON.parse(readFileSync(`contract/fixtures/${f}`, 'utf8'));
const vec = load('planshare_vectors.json');
const imp = load('planshare_import.json');
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const secret = hex(vec.secretHex);
const env = JSON.parse(vec.plaintext) as PlanEnvelope;
const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};
const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('secret', () => {
  it('formats 10 bytes as XXXX-XXXX-XXXX-XXXX and matches the fixture', () => {
    expect(secretToCode(secret)).toBe(vec.code);
    expect(vec.code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/);
  });
  it('round-trips random secrets', () => {
    for (let i = 0; i < 200; i += 1) {
      const s = generateSecret((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
      expect(unwrap(codeToSecret(secretToCode(s)))).toEqual(s);
    }
  });
  it('accepts case, spaces and the typo mapping', () => {
    for (const v of [...vec.typedVariants, ...vec.typoMapped.codes]) expect(unwrap(codeToSecret(v))).toEqual(secret);
  });
  it('rejects wrong length and characters', () => {
    expect(codeToSecret('ABCD')).toEqual({ ok: false, error: 'secret_length' });
    expect(codeToSecret('ABCD-ABCD-ABCD-ABC!')).toEqual({ ok: false, error: 'secret_chars' });
    expect(codeToSecret('ABCD-ABCD-ABCD-ABCU')).toEqual({ ok: false, error: 'secret_chars' });
  });
  it('reads only the fragment of a link and builds links with the secret in the fragment', () => {
    const link = shareLink('https://x.github.io/app/', secret);
    expect(link).toBe(`https://x.github.io/app/share#${vec.code}`);
    expect(new URL(link).search).toBe('');
    expect(new URL(link).pathname).not.toContain(vec.code);
    expect(unwrap(secretFromLink(link))).toEqual(secret);
  });
  it('rejects a source that returns the wrong number of bytes', () => {
    expect(() => generateSecret(() => new Uint8Array(9))).toThrow();
  });
});

describe('crypto vectors', () => {
  it('id matches the independent derivation and hides the secret', async () => {
    const id = await deriveId(secret);
    expect(id).toBe(vec.id);
    expect(id).toHaveLength(32);
    expect(id).not.toContain(vec.code.replace(/-/g, '').toLowerCase());
  });
  it('raw encrypt with the fixed IV gives the exact fixture bytes', async () => {
    const r = unwrap(await encryptEnvelope(env, secret, { iv: hex(vec.ivHex), gzip: false }));
    expect(toBase64(r)).toBe(vec.rawCiphertextBase64);
  });
  it('fixture ciphertexts (raw and gzip) decrypt to the plaintext envelope', async () => {
    for (const b64 of [vec.rawCiphertextBase64, vec.gzipCiphertextBase64]) {
      const out = unwrap(await decryptEnvelope(fromBase64(b64)!, secret, 1));
      expect(JSON.stringify(out)).toBe(vec.plaintext);
    }
  });
  it('gzip round trip gives a smaller ciphertext than raw for a big plan', async () => {
    const iv = hex(vec.ivHex);
    const a = unwrap(await encryptEnvelope(env, secret, { iv }));
    const b = unwrap(await encryptEnvelope(env, secret, { iv, gzip: false }));
    expect(unwrap(await decryptEnvelope(a, secret, 1))).toEqual(env);
    expect(a.length).toBeLessThanOrEqual(b.length + 20);
  });
  it('typed and typo-mapped codes decrypt', async () => {
    const ct = fromBase64(vec.rawCiphertextBase64)!;
    for (const v of [...vec.typedVariants, ...vec.typoMapped.codes]) expect((await decryptEnvelope(ct, unwrap(codeToSecret(v)), 1)).ok).toBe(true);
  });
  it('a wrong secret fails', async () => {
    const r = await decryptEnvelope(fromBase64(vec.rawCiphertextBase64)!, unwrap(codeToSecret(vec.wrongCode)), 1);
    expect(r).toEqual({ ok: false, error: 'corrupt' });
  });
  it('a flipped bit anywhere fails (iv, body, tag)', async () => {
    const ct = fromBase64(vec.rawCiphertextBase64)!;
    for (const i of vec.tamper.byteIndexes as number[]) {
      const t = Uint8Array.from(ct);
      t[i] = (t[i] ?? 0) ^ 1;
      expect(await decryptEnvelope(t, secret, 1)).toEqual({ ok: false, error: 'corrupt' });
    }
  });
  it('truncated and empty input fail without throwing', async () => {
    const ct = fromBase64(vec.rawCiphertextBase64)!;
    expect((await decryptEnvelope(ct.subarray(0, ct.length - 3), secret, 1)).ok).toBe(false);
    expect((await decryptEnvelope(new Uint8Array(0), secret, 1)).ok).toBe(false);
  });
  it('a plan from a newer contract major is `too_new`', async () => {
    const newer = { ...env, contractMajor: 2 };
    const ct = unwrap(await encryptEnvelope(newer as PlanEnvelope, secret, { iv: hex(vec.ivHex) }));
    expect(await decryptEnvelope(ct, secret, 1)).toEqual({ ok: false, error: 'too_new' });
  });
  it('valid ciphertext of a non-envelope is `corrupt`', async () => {
    const ct = unwrap(await encryptEnvelope({ schema: 'NOPE' } as unknown as PlanEnvelope, secret, { iv: hex(vec.ivHex), gzip: false }));
    expect(await decryptEnvelope(ct, secret, 1)).toEqual({ ok: false, error: 'corrupt' });
  });
  it('enforces the 64 KB plaintext cap and the 48 KB ciphertext cap', async () => {
    expect([PLAINTEXT_CAP, CIPHERTEXT_CAP]).toEqual([vec.caps.plaintextBytes, vec.caps.ciphertextBytes]);
    const big = { ...env, note: undefined, routine: { ...env.routine, name: 'x'.repeat(70000) } } as PlanEnvelope;
    expect(await encryptEnvelope(big, secret, { iv: hex(vec.ivHex) })).toEqual({ ok: false, error: 'too_large' });
    // under the plaintext cap but incompressible and over 48 KB once encrypted
    let seed = 7;
    const noise = Array.from({ length: 52000 }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), String.fromCharCode(33 + (seed % 90)))).join('');
    const mid = { ...env, from: undefined, routine: { ...env.routine, days: [{ name: 'D', targetMuscles: [noise], items: [] }] } } as unknown as PlanEnvelope;
    expect(await encryptEnvelope(mid, secret, { iv: hex(vec.ivHex), gzip: false })).toEqual({ ok: false, error: 'too_large' });
    expect(await decryptEnvelope(new Uint8Array(CIPHERTEXT_CAP + 1), secret, 1)).toEqual({ ok: false, error: 'too_large' });
  });
  it('base64 helpers round-trip and reject junk', () => {
    const b = Uint8Array.from({ length: 70000 }, (_, i) => i % 251);
    expect(fromBase64(toBase64(b))).toEqual(b);
    expect(fromBase64('***')).toBeNull();
    expect(toHex(Uint8Array.from([0, 255, 16]))).toBe('00ff10');
  });
});

const SENTINEL = 'ZQX-PERSONAL-9931';
const routine = (extra: Record<string, unknown> = {}): Routine =>
  ({
    id: 'r-secret-id', name: 'Plan A', source: 'mine', daysPerWeek: 2, weekdays: [0, 3], splitStyle: 'upper_lower', active: true, archived: true,
    scheduleMeta: { deloadWeeks: ['2026-11-02'], anchorDate: SENTINEL },
    schedule: { mode: 'weekdays', weekdays: [0, 3] },
    days: [
      { id: 'day-secret-1', name: 'Upper', targetMuscles: ['chest'], items: [
        { ref: { kind: 'lib', slug: 'lat-pulldown' }, sets: 3, repMin: 8, repMax: 12, restSec: 90, setup: { seat: 4 }, [SENTINEL]: 1 },
        { ref: { kind: 'custom', id: 'cid-1' }, sets: 3, repMin: 8, repMax: 12, restSec: 60 },
        { ref: { kind: 'custom', id: 'gone' }, sets: 3, repMin: 8, repMax: 12, restSec: 60 } ] },
      { id: 'day-secret-2', name: 'Lower', targetMuscles: [], items: [] } ],
    ...extra,
  }) as unknown as Routine;
const customs = (): CustomSource[] => [
  { id: 'cid-1', client_id: 'client-secret-1', name: 'Mine A', slug: 'my-mine-a', kind: 'strength', machineSlug: null, muscles: [{ id: 'chest_upper', role: 'primary', emphasis: 'high' }], repMin: 8, repMax: 12, notes: SENTINEL, userId: SENTINEL } as unknown as CustomSource,
  { id: 'cid-2', client_id: 'client-secret-2', name: 'Unused', slug: 'my-unused', kind: 'cardio', machineSlug: null, muscles: [], repMin: 8, repMax: 12 },
];
const build = (r = routine(), c = customs(), from = '', note = '') => buildEnvelope({ routine: r, customs: c, createdAt: '2026-11-20T00:00:00.000Z', contractMajor: 1, from, note });

describe('buildEnvelope', () => {
  it('property: no id and no personal field is ever present', () => {
    const { envelope, dropped } = build();
    const text = JSON.stringify(envelope);
    for (const bad of [SENTINEL, 'r-secret-id', 'day-secret', 'client-secret', 'cid-', 'archived', 'scheduleMeta', 'deloadWeeks', 'userId', 'client_id', '"active"', '"id":"day', 'notes']) expect(text).not.toContain(bad);
    expect(dropped).toBe(1);
  });
  it('property: random extra fields on routine, days, items and customs never survive', () => {
    for (let i = 0; i < 25; i += 1) {
      const key = `extra_${i}_${SENTINEL}`;
      const r = routine({ [key]: 'x', history: [{ [key]: 1 }], bodyStats: { waistCm: 81.4 }, goals: ['x'] });
      (r.days[0] as unknown as Record<string, unknown>)[key] = 'x';
      const c = customs();
      (c[0] as unknown as Record<string, unknown>)[key] = 'x';
      const text = JSON.stringify(build(r, c).envelope);
      expect(text).not.toContain(SENTINEL);
      expect(text).not.toContain('waistCm');
      expect(text).not.toContain('history');
    }
  });
  it('includes only referenced custom exercises, referenced by slug', () => {
    const { envelope } = build();
    expect(envelope.customExercises.map((c) => c.slug)).toEqual(['my-mine-a']);
    expect(envelope.routine.days[0]?.items.map((i) => i.ref)).toEqual([{ kind: 'lib', slug: 'lat-pulldown' }, { kind: 'custom', id: 'my-mine-a' }]);
  });
  it('keeps the schedule, trims and caps from and note, omits them when empty', () => {
    const { envelope } = build(routine(), customs(), `  ${'n'.repeat(50)}  `, 'y'.repeat(300));
    expect(envelope.from).toHaveLength(30);
    expect(envelope.note).toHaveLength(200);
    expect(envelope.routine.schedule).toEqual({ mode: 'weekdays', weekdays: [0, 3] });
    const none = build().envelope;
    expect('from' in none || 'note' in none).toBe(false);
  });
  it('the built envelope passes parseEnvelope unchanged', () => {
    const { envelope } = build(routine(), customs(), 'Asha', 'hi');
    expect(unwrap(parseEnvelope(JSON.parse(JSON.stringify(envelope)), 1))).toEqual(envelope);
  });
  it('encrypts and decrypts end to end with the real code path', async () => {
    const { envelope } = build();
    const s = generateSecret((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
    const ct = unwrap(await encryptEnvelope(envelope, s, { iv: globalThis.crypto.getRandomValues(new Uint8Array(12)) }));
    expect(unwrap(await decryptEnvelope(ct, s, 1))).toEqual(envelope);
  });
});

describe('parseEnvelope', () => {
  it('drops unknown fields (a sender cannot smuggle personal data in)', () => {
    const dirty = { ...env, history: [1], routine: { ...env.routine, id: 'abc', days: env.routine.days.map((d) => ({ ...d, id: 'zzz', logs: [1] })) }, customExercises: env.customExercises.map((c) => ({ ...c, notes: 'secret', client_id: 'k' })) };
    const text = JSON.stringify(unwrap(parseEnvelope(dirty, 1)));
    expect(text).not.toMatch(/history|"id":"abc"|zzz|logs|secret|client_id/);
  });
  it('rejects bad shapes', () => {
    const bad = (e: unknown) => expect(parseEnvelope(e, 1)).toEqual({ ok: false, error: 'invalid' });
    bad(null);
    bad({ ...env, schema: 'SFPLAN2' });
    bad({ ...env, routine: { ...env.routine, days: [] } });
    bad({ ...env, routine: { ...env.routine, name: '' } });
    bad({ ...env, createdAt: 'not a date' });
    bad({ ...env, customExercises: [] }); // an item refers to a custom exercise that is not there
    bad({ ...env, customExercises: [...env.customExercises, ...env.customExercises] });
    bad({ ...env, routine: { ...env.routine, days: [{ ...env.routine.days[0], items: [{ ...env.routine.days[0]!.items[0], repMin: 12, repMax: 8 }] }] } });
  });
  it('a bad schedule is dropped, the plan still imports', () => {
    const r = unwrap(parseEnvelope({ ...env, routine: { ...env.routine, schedule: { mode: 'every_n', n: 0 } } }, 1));
    expect(r.routine.schedule).toBeUndefined();
  });
  it('too_new is reported before shape errors', () => {
    expect(parseEnvelope({ schema: 'SFPLAN1', contractMajor: 3 }, 1)).toEqual({ ok: false, error: 'too_new' });
  });
});

describe('importPlan fixtures', () => {
  for (const c of imp.cases)
    it(c.name, () => {
      const plan = importPlan(c.envelope, { makeId: counter(), librarySlugs: new Set(c.ctx.librarySlugs), hiddenSlugs: new Set(c.ctx.hiddenSlugs), takenCustomSlugs: c.ctx.takenCustomSlugs, takenRoutineNames: c.ctx.takenRoutineNames });
      const x = c.expected;
      expect(plan.routine.name).toBe(x.routineName);
      expect(plan.routine.active).toBe(x.active);
      expect(plan.routine.source).toBe(x.source);
      expect(plan.routine.id).toBe(x.routineId);
      expect(plan.routine.days.map((d) => d.id)).toEqual(x.dayIds);
      expect(plan.customs.map((m) => ({ id: m.id, slug: m.slug }))).toEqual(x.customs);
      expect(plan.routine.days[0]?.items[1]?.ref).toEqual({ kind: 'custom', id: x.customRefId });
      expect(plan.flags).toEqual(x.flags);
    });
  it('never reuses an id from the envelope and never mutates it', () => {
    const before = JSON.stringify(env);
    const plan = importPlan(env, { makeId: counter(), librarySlugs: new Set(), hiddenSlugs: new Set(), takenCustomSlugs: [], takenRoutineNames: [] });
    expect(JSON.stringify(env)).toBe(before);
    expect(plan.routine.schedule).toEqual(env.routine.schedule);
    expect(plan.routine.archived).toBeUndefined();
  });
  it('two custom exercises with the same name get different slugs; a long name is shortened with a number', () => {
    const e = { ...env, routine: { ...env.routine, name: 'N'.repeat(40) }, customExercises: [env.customExercises[0]!, { ...env.customExercises[0]!, slug: 'my-other' }] } as PlanEnvelope;
    const plan = importPlan(e, { makeId: counter(), librarySlugs: new Set(['my-landmine-press']), hiddenSlugs: new Set(), takenCustomSlugs: [], takenRoutineNames: ['N'.repeat(40)] });
    expect(plan.customs.map((c) => c.slug)).toEqual(['my-landmine-press-2', 'my-landmine-press-3']);
    expect(plan.routine.name.length).toBeLessThanOrEqual(40);
    expect(plan.routine.name.endsWith(' 2')).toBe(true);
  });
});

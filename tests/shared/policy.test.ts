import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyLibraryOverrides, chooseCurrent, hiddenSetupFor, isHiddenByGym, machineStateOf, parsePolicy, resolveFeatureValue, youtubeOverride, type Policy } from '../../src/shared/policy';
import { resetDb } from '../../src/data/local';
import { __setPolicyForTest, acceptPolicy, clearPolicy, gymHiddenSlugs, initGymPolicy, machineStatusFor } from '../../src/data/repos/gymPolicy';
import { resolveFeature as flagValue, standaloneValue } from '../../src/app/flags';
import { lockedByGym } from '../../src/data/repos/prefs';
import { policyYoutubeFor } from '../../src/data/repos/exercisePage';
import features from '../../contract/features.catalogue.json';

const read = (n: string) => JSON.parse(readFileSync(`contract/fixtures/${n}.json`, 'utf8'));
const res = read('policy_resolve');
const lib = read('policy_library');
const val = read('policy_validate');

describe('resolveFeatureValue (fixtures policy_resolve)', () => {
  for (const c of res.cases) {
    it(c.name, () => {
      const policy = c.policy ? parsePolicy(c.policy) : null;
      if (policy) expect(policy.ok).toBe(true);
      const p = policy && policy.ok ? policy.policy : null;
      expect(resolveFeatureValue(c.key, c.rule ?? undefined, p, c.user ?? undefined)).toEqual(c.expect);
    });
  }
});

describe('library overrides (fixtures policy_library)', () => {
  const L = parsePolicy({ contract: '1.0.0', version: 1, gym: { name: 'G', slug: 'g' }, library: lib.library });
  const l = L.ok ? L.policy.library : null;
  it('the library parses', () => expect(L.ok).toBe(true));
  for (const c of lib.hidden) it(`hidden ${c.slug}`, () => expect(isHiddenByGym(c.slug, l)).toBe(c.hidden));
  for (const c of lib.youtube) it(`youtube ${c.slug}`, () => expect(youtubeOverride(c.slug, l)).toBe(c.url ?? undefined));
  for (const c of lib.machines)
    it(`machine ${c.slug}`, () => {
      const r = machineStateOf(c.slug, c.base, l);
      expect(r.status).toBe(c.status);
      expect(r.note ?? null).toBe(c.note);
    });
  for (const c of lib.setup)
    it(`setup values ${c.slug}`, () => {
      const m = hiddenSetupFor(c.slug, l);
      const got: Record<string, string[]> = {};
      m.forEach((v, k) => (got[k] = [...v].sort()));
      const want: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(c.hidden as Record<string, string[]>)) want[k] = [...v].sort();
      expect(got).toEqual(want);
    });
  it('applyLibraryOverrides filters and relabels without touching its input', () => {
    const ex = [{ slug: 'bench-press' }, { slug: 'squat' }, { slug: 'my-secret' }];
    const ms = [{ slug: 'cable-crossover', status: 'active' }, { slug: 'x', status: 'maintenance' }];
    const out = applyLibraryOverrides(ex, ms, l);
    expect(out.exercises.map((e) => e.slug)).toEqual(['squat', 'my-secret']);
    expect(out.machines.map((m) => m.status)).toEqual(['out_of_order', 'maintenance']);
    expect(ex.length).toBe(3);
    expect(ms[0]!.status).toBe('active');
  });
  it('no policy means no change', () => {
    expect(isHiddenByGym('bench-press', null)).toBe(false);
    expect(machineStateOf('m', 'maintenance', null).status).toBe('maintenance');
  });
});

describe('validation and which policy wins (fixtures policy_validate)', () => {
  for (const c of val.valid) it(`valid: ${c.name}`, () => expect(parsePolicy(c.policy).ok).toBe(true));
  for (const c of val.invalid) it(`invalid: ${c.name}`, () => expect(parsePolicy(c.policy).ok).toBe(false));
  for (const c of val.choose)
    it(`choose: ${c.name}`, () => {
      const cur = c.current ? (parsePolicy(c.current) as { ok: true; policy: Policy }).policy : null;
      const r = chooseCurrent(cur, c.incoming);
      expect(r.accepted).toBe(c.accepted);
      expect(r.reason).toBe(c.reason);
      expect(r.policy?.version ?? null).toBe(c.version);
    });
});

describe('wiring: useFeature, Settings lock, YouTube link, hidden slugs, machine badge', () => {
  const P = (parsePolicy(val.valid[0].policy) as { ok: true; policy: Policy }).policy;
  const withP = { ...P, features: { ...P.features, suggestions: { enabled: false, locked: true }, heatmap: { enabled: true, locked: true } } };
  beforeEach(async () => {
    __setPolicyForTest(null);
    await resetDb(true);
  });
  it('standalone: nothing is locked and gym-only features are off', () => {
    expect(lockedByGym('flow.suggestions')).toBe(false);
    expect(flagValue('membership')).toBe(false);
    expect(flagValue('suggestions')).toBe(standaloneValue('suggestions'));
    expect(policyYoutubeFor('lat-pulldown')).toBeUndefined();
    expect(gymHiddenSlugs().size).toBe(0);
  });
  it('connected: a locked feature is forced and its Settings row says so', () => {
    __setPolicyForTest(withP);
    expect(flagValue('suggestions')).toBe(false);
    expect(lockedByGym('flow.suggestions')).toBe(true);
    expect(flagValue('membership')).toBe(true);
    expect(lockedByGym('training.units')).toBe(false);
  });
  it('connected: library overrides reach the hooks', () => {
    __setPolicyForTest({ ...withP, library: lib.library });
    expect(policyYoutubeFor('lat-pulldown')).toBe('https://www.youtube.com/watch?v=abc123');
    expect(policyYoutubeFor('deadlift')).toBeUndefined();
    expect(gymHiddenSlugs().has('bench-press')).toBe(true);
    expect(gymHiddenSlugs().has('my-secret')).toBe(false);
    expect(machineStatusFor('leg-press-plate-loaded', 'active')).toEqual({ status: 'maintenance', note: 'Back in 2 days' });
  });
  it('every catalogue key resolves to a boolean under a policy', () => {
    __setPolicyForTest(withP);
    for (const f of features.features) expect(typeof flagValue(f.key)).toBe('boolean');
  });
  it('acceptPolicy stores a good policy, ignores invalid and stale, and a restart reads it back', async () => {
    expect(await acceptPolicy(withP)).toBe('ok');
    expect(await acceptPolicy({ nonsense: true })).toBe('invalid');
    expect(await acceptPolicy({ ...withP, version: withP.version - 1 })).toBe('stale');
    expect(flagValue('suggestions')).toBe(false);
    __setPolicyForTest(null);
    expect(lockedByGym('flow.suggestions')).toBe(false);
    await initGymPolicy(); // reads the device copy
    expect(lockedByGym('flow.suggestions')).toBe(true);
    await clearPolicy();
    expect(lockedByGym('flow.suggestions')).toBe(false);
    await initGymPolicy();
    expect(lockedByGym('flow.suggestions')).toBe(false);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_SIGNUP_TRIES, backupHomeView, canMoveMode, freeConfigReady, freeEmail, freeError, freeIdFromEmail, isValidPassword, isValidUsername, makePassword, makeUsername, normaliseIdentifier, parseFreeShards,
} from '../../src/shared/freeAccount';
import { setFreeConfigForTest } from '../../src/app/freeBuild';
import { resolveFeature, standaloneValue } from '../../src/app/flags';

const SHARD = { id: 'F1', url: 'https://abc.supabase.co/', anonKey: 'anon-key-1234' };
const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;

describe('free account: pure rules', () => {
  it('parseFreeShards keeps good entries, drops malformed ones, strips the trailing slash; empty/garbage = none', () => {
    expect(parseFreeShards(JSON.stringify([SHARD, { id: 'F2' }, { id: 'x', url: 'https://a.b', anonKey: 'longenough' }, { id: 'F3', url: 'http://insecure.example', anonKey: 'longenough' }]))).toEqual([{ id: 'F1', url: 'https://abc.supabase.co', anonKey: 'anon-key-1234' }]);
    expect(parseFreeShards('')).toEqual([]);
    expect(parseFreeShards('not json')).toEqual([]);
    expect(parseFreeShards({})).toEqual([]);
  });

  it('freeConfigReady needs a shard, an https functions URL and an anon key', () => {
    const ok = { shards: parseFreeShards([SHARD]), functionsUrl: 'https://core.supabase.co/functions/v1', coreAnon: 'core-anon-1234' };
    expect(freeConfigReady(ok)).toBe(true);
    expect(freeConfigReady({ ...ok, shards: [] })).toBe(false);
    expect(freeConfigReady({ ...ok, functionsUrl: '' })).toBe(false);
    expect(freeConfigReady({ ...ok, coreAnon: '' })).toBe(false);
    expect(freeConfigReady(null)).toBe(false);
  });

  it('usernames look like lifter-7k2q and are always valid (4-24, a-z0-9-)', () => {
    const r = lcg(7);
    for (let i = 0; i < 200; i++) {
      const u = makeUsername(r);
      expect(u).toMatch(/^lifter-[a-z0-9]{4}$/);
      expect(isValidUsername(u)).toBe(true);
    }
    expect(isValidUsername('abc')).toBe(false);
    expect(isValidUsername('Has Caps')).toBe(false);
  });

  it('passwords: 16 chars, a letter and a digit every time, no look-alikes, passes the server rule', () => {
    const r = lcg(11);
    const randInt = (n: number) => Math.floor(r() * n);
    for (let i = 0; i < 500; i++) {
      const p = makePassword(randInt);
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[A-Za-z]/);
      expect(p).toMatch(/\d/);
      expect(p).not.toMatch(/[0O1lI]/);
      expect(isValidPassword(p)).toBe(true);
    }
    // worst cases: an all-letter and an all-digit draw are repaired
    expect(makePassword(() => 0)).toMatch(/\d/);
    expect(makePassword((n) => n - 1)).toMatch(/[A-Za-z]/);
    expect(isValidPassword('short1')).toBe(false);
    expect(isValidPassword('allletterspassword')).toBe(false);
  });

  it('free id and email round trip; typed identifiers are normalised', () => {
    expect(freeEmail('FR1-7K2Q9')).toBe('fr1-7k2q9@free.shieldfit.app');
    expect(freeIdFromEmail('fr1-7k2q9@free.shieldfit.app')).toBe('FR1-7K2Q9');
    expect(freeIdFromEmail('someone@else.com')).toBeNull();
    expect(normaliseIdentifier('  fr1-7k2q9 ')).toBe('FR1-7K2Q9');
    expect(normaliseIdentifier(' Lifter-7K2Q ')).toBe('lifter-7k2q');
    expect(normaliseIdentifier('   ')).toBeNull();
  });

  it('error table: branches on the code only; unknown or missing = the generic line; a wrong id and wrong password read the same', () => {
    expect(freeError('SFE705').key).toBe('bk.err.paused');
    expect(freeError('SFE004', { retryAfter: 40 })).toEqual({ key: 'bk.err.rate', retryAfter: 40 });
    expect(freeError('SFE001', { fields: [{ field: 'username' }] }).fields).toEqual(['username']);
    expect(freeError('SFE201').goSignIn).toBe(true);
    expect(freeError('SFE101').key).toBe('bk.err.id');
    expect(freeError('SFE703').key).toBe('bk.err.big');
    expect(freeError('OFFLINE').key).toBe('bk.offline');
    expect(freeError('SFE999').key).toBe('bk.err.generic');
    expect(freeError(undefined).key).toBe('bk.err.generic');
    expect(MAX_SIGNUP_TRIES).toBe(3);
  });

  it('R1 view: hidden without cloud_backup; standalone offers start only with free_account + a configured shard; finish only after the password was saved', () => {
    const base = { cloudBackupOn: true, freeAccountOn: true, configReady: true, mode: 'standalone', account: null, phoneEmpty: false } as const;
    expect(backupHomeView({ ...base, cloudBackupOn: false })).toEqual({ kind: 'hidden' });
    expect(backupHomeView(base)).toEqual({ kind: 'standalone', canStart: true, signInFirst: false });
    expect(backupHomeView({ ...base, phoneEmpty: true })).toEqual({ kind: 'standalone', canStart: true, signInFirst: true });
    expect(backupHomeView({ ...base, configReady: false })).toEqual({ kind: 'standalone', canStart: false, signInFirst: false });
    expect(backupHomeView({ ...base, freeAccountOn: false })).toMatchObject({ canStart: false });
    expect(backupHomeView({ ...base, account: { saved: false } })).toMatchObject({ kind: 'standalone' }); // an unsaved password cannot be finished
    expect(backupHomeView({ ...base, account: { saved: true } })).toEqual({ kind: 'finish' });
    expect(backupHomeView({ ...base, mode: 'free_backup' })).toEqual({ kind: 'free' });
    expect(backupHomeView({ ...base, mode: 'connected' })).toEqual({ kind: 'connected' });
  });

  it('modes only move along the allowed edges', () => {
    expect(canMoveMode('standalone', 'free_backup')).toBe(true);
    expect(canMoveMode('free_backup', 'standalone')).toBe(true);
    expect(canMoveMode('free_backup', 'connected')).toBe(true);
    expect(canMoveMode('connected', 'free_backup')).toBe(false); // gym -> free goes through "Switch to free backup" (Phase 80)
  });
});

describe('build default (A-P74.1)', () => {
  afterEach(() => setFreeConfigForTest(null));
  it('cloud_backup and free_account are off without the build values and on with them; other features are untouched', () => {
    setFreeConfigForTest({ shards: [], functionsUrl: '', coreAnon: '' });
    expect(standaloneValue('cloud_backup')).toBe(false);
    expect(standaloneValue('free_account')).toBe(false);
    setFreeConfigForTest({ shards: parseFreeShards([SHARD]), functionsUrl: 'https://core.supabase.co/functions/v1', coreAnon: 'core-anon-1234' });
    expect(resolveFeature('cloud_backup')).toBe(true);
    expect(resolveFeature('free_account')).toBe(true);
    expect(standaloneValue('auto_restore')).toBe(false); // needs a connection
  });
});

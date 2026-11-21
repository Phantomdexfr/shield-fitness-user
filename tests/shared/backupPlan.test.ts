import { describe, expect, it } from 'vitest';
import { addDirty, bumpAttempts, cleanKeys, dueKeys, isNoRetry, lastBackedUp, objectPath, parseMode, retryDelayMs, triggerDelayMs } from '../../src/shared/backupPlan';

describe('backupPlan', () => {
  it('mode defaults to standalone for anything unknown', () => {
    expect(parseMode(undefined)).toBe('standalone');
    expect(parseMode('x')).toBe('standalone');
    expect(parseMode('connected')).toBe('connected');
  });
  it('dirty list is sorted, unique, strings only', () => {
    expect(cleanKeys(['small', 3, 'body:2026-11', 'small', ''])).toEqual(['body:2026-11', 'small']);
    expect(addDirty(['small'], 'sessions:2026-11')).toEqual(['sessions:2026-11', 'small']);
  });
  it('trigger delay is 10-30 s; back-off is min(2^n x 5 s, 15 min) plus up to 20 % jitter', () => {
    expect(triggerDelayMs(0)).toBe(10_000);
    expect(triggerDelayMs(0.999999)).toBeLessThanOrEqual(30_000);
    expect(retryDelayMs(1, 0)).toBe(10_000);
    expect(retryDelayMs(3, 0)).toBe(40_000);
    expect(retryDelayMs(30, 0)).toBe(900_000);
    expect(retryDelayMs(30, 0.999999)).toBeLessThanOrEqual(1_080_000);
  });
  it('plain-message codes never get a next try; others do', () => {
    for (const c of ['SFE703', 'SFE704', 'SFE706', 'SFE707']) expect(isNoRetry(c)).toBe(true);
    expect(isNoRetry('SFE001')).toBe(false);
    expect(bumpAttempts(null, 100, 0, 'SFE703')).toEqual({ n: 1, nextTryAt: null, code: 'SFE703' });
    expect(bumpAttempts({ n: 1, nextTryAt: 5 }, 100, 0).n).toBe(2);
  });
  it('dueKeys skips back-off and stopped keys', () => {
    const at = { a: { n: 1, nextTryAt: 200 }, b: { n: 1, nextTryAt: null, code: 'SFE703' }, c: { n: 1, nextTryAt: 50 } };
    expect(dueKeys(['a', 'b', 'c', 'd'], at, 100)).toEqual(['c', 'd']);
  });
  it('last backed up: never, ok, amber only past 7 days AND online', () => {
    const day = 24 * 3600_000;
    expect(lastBackedUp(null, 0, true)).toEqual({ state: 'never' });
    expect(lastBackedUp(0, 7 * day, true).state).toBe('ok');
    expect(lastBackedUp(0, 7 * day + 1, true).state).toBe('amber');
    expect(lastBackedUp(0, 30 * day, false).state).toBe('ok');
  });
  it('object path replaces the colon', () => {
    expect(objectPath('u1', 'sessions:2026-11', 'ab')).toBe('u1/sessions_2026-11/ab.bin');
  });
});

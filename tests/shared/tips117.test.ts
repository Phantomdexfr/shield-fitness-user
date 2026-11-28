import { describe, expect, test } from 'vitest';
import { PAGE_TIPS, parseTips, tipForPath, tipsEnabled } from '../../src/shared/tips';
import { en } from '../../src/i18n/en';
import { ROUTES } from '../../src/app/routes';

describe('page tips', () => {
  test('every tip has strings and a body of at most two sentences', () => {
    for (const p of PAGE_TIPS) {
      expect(p.titleKey in en, p.titleKey).toBe(true);
      expect(p.bodyKey in en, p.bodyKey).toBe(true);
      expect((en as Record<string, string>)[p.bodyKey]!.split(/[.!?]\s/).length).toBeLessThanOrEqual(2);
    }
  });
  test('main pages and sub pages have a tip; only the onboarding and dev preview do not', () => {
    for (const p of ['/', '/train', '/body', '/library', '/me', '/history', '/history/abc', '/routines', '/routine/new', '/routine/r1', '/routine/r1/day/d1', '/progress', '/session/abc', '/session/abc/summary', '/settings', '/settings/appearance', '/settings/gym/signin', '/exercise/bench', '/exercise/bench/edit', '/machines/m1/lab', '/muscle/chest', '/gym/qr', '/connect']) expect(tipForPath(p), p).toBeDefined();
    for (const p of ['/welcome', '/dev/design-preview', '/nope']) expect(tipForPath(p), p).toBeUndefined();
  });
  test('the most specific page wins', () => {
    expect(tipForPath('/routine/new')!.id).toBe('routinenew');
    expect(tipForPath('/routine/r1')!.id).toBe('routine');
    expect(tipForPath('/session/x/summary')!.id).toBe('summary');
    expect(tipForPath('/session/x')!.id).toBe('session');
    expect(tipForPath('/exercise/a/edit')!.id).toBe('exedit');
  });
  test('EVERY real route has a tip (except onboarding and the dev preview)', () => {
    for (const r of ROUTES) {
      if (r.id === 'welcome' || r.devOnly) continue;
      const path = r.path.replace(/:[a-zA-Z]+/g, 'x');
      expect(tipForPath(path), r.id + ' ' + r.path).toBeDefined();
    }
  });
  test('parse: only a stored boolean counts', () => {
    expect(parseTips(null)).toBeNull();
    expect(parseTips({ on: 'yes' })).toBeNull();
    expect(parseTips({ on: false })).toEqual({ v: 1, on: false });
  });
  test('default: on for a new install, off for an existing one; the person\'s choice always wins', () => {
    expect(tipsEnabled(null, true)).toBe(true);
    expect(tipsEnabled(null, false)).toBe(false);
    expect(tipsEnabled({ v: 1, on: false }, true)).toBe(false);
    expect(tipsEnabled({ v: 1, on: true }, false)).toBe(true);
  });
});

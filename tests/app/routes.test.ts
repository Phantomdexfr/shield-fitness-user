import { describe, expect, it } from 'vitest';
import { ROUTES, TABS, activeRoutes } from '../../src/app/routes';
import { isKnownFeature } from '../../src/app/flags';
import { normaliseBase } from '../../src/app/Shell';

describe('route registry', () => {
  it('has unique ids and unique paths', () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
    expect(new Set(ROUTES.map((r) => r.path)).size).toBe(ROUTES.length);
  });
  it('every non-null feature key exists in the catalogue', () => {
    for (const r of ROUTES) if (r.feature !== null) expect(isKnownFeature(r.feature), r.id).toBe(true);
  });
  it('paths are lowercase, start with a slash, and slug routes exist', () => {
    for (const r of ROUTES) {
      expect(r.path.startsWith('/')).toBe(true);
      expect(r.path.replace(/:[a-z]+/g, '')).toBe(r.path.replace(/:[a-z]+/g, '').toLowerCase());
    }
    const paths = ROUTES.map((r) => r.path);
    for (const p of ['/exercise/:slug', '/machine/:slug', '/routine/:id', '/muscle/:id']) expect(paths).toContain(p);
  });
  it('tabs are Today, Body, Train, Library, Me and each points at a registered route', () => {
    expect(TABS.map((t) => t.id)).toEqual(['today', 'body', 'train', 'library', 'me']);
    for (const tab of TABS) expect(ROUTES.some((r) => r.path === tab.path)).toBe(true);
  });
  it('dev-only routes are dropped from production', () => {
    expect(activeRoutes(false).some((r) => r.devOnly)).toBe(false);
    expect(activeRoutes(true).some((r) => r.path === '/dev/design-preview')).toBe(true);
  });
  it('normalises the base path', () => {
    expect(normaliseBase('/')).toBe('');
    expect(normaliseBase('/shield-fitness-user/')).toBe('/shield-fitness-user');
  });
});

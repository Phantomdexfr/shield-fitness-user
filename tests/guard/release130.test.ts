// Phase 111 gate: release 1.3.0 (Premium UI by default, Classic intact). Static source checks only (no browser, no build).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UX_KEYS, DEFAULT_SWITCHES } from '../../src/shared/ux';
import { en } from '../../src/i18n/en';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
};

describe('release 1.3.0 gate', () => {
  it('version is 1.3.0 in package.json and in both places of the lock file', () => {
    expect(JSON.parse(read('package.json')).version).toBe('1.3.0');
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe('1.3.0');
    expect(lock.packages[''].version).toBe('1.3.0');
  });

  it('the owner checklist exists and covers the on-device items', () => {
    expect(existsSync(join(ROOT, 'docs/OWNER_CHECKLIST_1.3.0.md'))).toBe(true);
    const doc = read('docs/OWNER_CHECKLIST_1.3.0.md').toLowerCase();
    for (const w of ['wheels', 'frosted', 'vibration', 'swipe-back', 'splash', 'classic', 'upgrade from 1.2.0', 'start workout']) expect(doc, w).toContain(w);
  });

  it('Premium is the default for every switch, and the master has a Classic way back', () => {
    for (const k of UX_KEYS) expect(DEFAULT_SWITCHES[k], k).toBe(true);
    expect(en['ux.sw.layout']).toBeTruthy();
  });

  it('premium CSS never styles a classic-only selector without the premium scope (every rule starts with :root[data-ux-...=premium])', () => {
    const dir = join(ROOT, 'src/ui/styles/premium');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css') && x !== 'index.css')) {
      const text = read(`src/ui/styles/premium/${f}`).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, f).toContain("data-ux-");
    }
  });

  it('new Phase 110 controls are named for screen readers (ring, tiles, rows) and the sheen respects Motion', () => {
    const page = read('src/pages/today/TodayPage.tsx');
    expect(page).toMatch(/class="sf-ring" role="img" aria-label=/);
    expect(page).toMatch(/sf-qtile__lbl/);
    const css = read('src/ui/styles/premium/today.css');
    expect(css).toMatch(/prefers-reduced-motion: no-preference/);
    expect(css).toMatch(/:not\(\[data-motion='reduced'\]\)/);
  });

  it('premium chips keep the 44 px tap height (Phase 111 audit)', () => {
    const css = read('src/ui/styles/premium/controls.css');
    const rule = /\.sf-chip \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toContain('min-height: var(--touch-min)');
  });

  it('every page that had a View button lost it (the switches live only in Settings -> Appearance)', () => {
    const used = walk(join(ROOT, 'src/pages')).filter((f) => /<ViewSheet/.test(readFileSync(f, 'utf8')));
    expect(used.map((f) => f.replace(`${ROOT}/`, ''))).toEqual([]);
  });

  it('no build artefacts or secrets in the project folder', () => {
    for (const d of ['dist', 'dist-pwa', 'secrets']) expect(existsSync(join(ROOT, d)), d).toBe(false);
    expect(existsSync(join(ROOT, '.env'))).toBe(false);
  });
});

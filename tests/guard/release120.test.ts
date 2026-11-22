// Phase 88 gate: one place that re-asserts the Milestone 11 rules before release 1.2.0.
// Static source checks only (no browser). Each rule also has its own deeper test from Phases 82-87.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
};
const SRC = walk(join(ROOT, 'src'));
const rel = (f: string) => f.replace(`${ROOT}/`, '');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const hits = (re: RegExp) => SRC.filter((f) => re.test(readFileSync(f, 'utf8'))).map(rel);

describe('release 1.2.0 gate', () => {
  it('version is 1.2.0 in package.json and the lock file', () => {
    expect(JSON.parse(read('package.json')).version).toBe('1.2.0');
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe('1.2.0');
    expect(lock.packages[''].version).toBe('1.2.0');
  });

  it('viewport lock: no pinch zoom', () => {
    const html = read('index.html');
    expect(html).toMatch(/maximum-scale=1/);
    expect(html).toMatch(/user-scalable=no/);
  });

  it('no native date input and no ghost button remain', () => {
    expect(hits(/type=["']?(date|datetime-local|month|week)["']?/)).toEqual([]);
    expect(hits(/variant=["{']+ghost/)).toEqual([]);
    expect(hits(/sf-(btn|iconbtn)--ghost/)).toEqual([]);
  });

  it('body figures follow the profile: no page keeps its own Male/Female state', () => {
    for (const p of ['src/pages/heatmap/HeatmapPage.tsx', 'src/pages/body/MarksPage.tsx']) {
      expect(read(p)).toContain('useFigureSex');
    }
  });

  it('the Collapsible section component exists and is used by long pages', () => {
    expect(read('src/ui/components/Collapsible.tsx')).toContain('aria-expanded');
    expect(hits(/<Collapsible\b/).filter((f) => f.startsWith('src/pages/')).length).toBeGreaterThanOrEqual(10);
  });

  it('a11y: icon buttons need a label (type) and every IconButton call passes one', () => {
    expect(read('src/ui/components/Button.tsx')).toMatch(/label: string;/);
    const bad: string[] = [];
    for (const f of SRC.filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<IconButton\b[^>]*?\/?>/gs)) if (!/\blabel=/.test(m[0])) bad.push(rel(f));
    }
    expect(bad).toEqual([]);
  });

  it('a11y: the Sheet and Dialog overlays (used by DatePicker, ChoiceRow, NumberRow) have role=dialog and aria-modal', () => {
    for (const p of ['src/ui/components/Overlay.tsx']) {
      const s = read(p);
      expect(s).toMatch(/role=["']dialog["']/);
      expect(s).toMatch(/aria-modal/);
    }
  });
});

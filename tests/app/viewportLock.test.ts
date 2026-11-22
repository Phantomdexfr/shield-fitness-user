// Phase 82: guard that pinch and double-tap zoom stay disabled.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('zoom lock', () => {
  it('the viewport meta has maximum-scale=1 and user-scalable=no', () => {
    const meta = /<meta[^>]*name="viewport"[^>]*content="([^"]*)"/.exec(read('index.html'))?.[1] ?? '';
    expect(meta).toMatch(/maximum-scale=1(\.0)?\b/);
    expect(meta).toMatch(/user-scalable=no/);
  });
  it('html and body only allow panning, and do not bounce', () => {
    const css = read('src/ui/styles/base.css');
    expect(css.match(/touch-action:\s*pan-x pan-y/g)?.length).toBeGreaterThanOrEqual(2);
    expect(css).toMatch(/overscroll-behavior:\s*none/);
  });
  it('iOS gesture events are blocked once in main.tsx', () => {
    const main = read('src/main.tsx');
    expect(main).toContain('gesturestart');
    expect(main).toContain('gesturechange');
    expect(main).toMatch(/passive:\s*false/);
  });
  it('text fields are at least 16px', () => {
    expect(read('src/ui/styles/base.css')).toMatch(/textarea\s*\{\s*font-size:\s*max\(1rem, 16px\)/);
  });
});

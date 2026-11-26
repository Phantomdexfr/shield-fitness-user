import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

describe('Phase 108 launch polish (static)', () => {
  const html = read('index.html');
  test('theme colour and dark scheme match the manifest; the splash is the owner logo and is hidden in Classic and once the app renders', () => {
    const manifest = read('vite.config.ts');
    expect(html).toContain('<meta name="theme-color" content="#0d0c0a" />');
    expect(manifest).toContain("theme_color: '#0d0c0a'");
    expect(html).toContain('<meta name="color-scheme" content="dark" />');
    expect(html).toContain('apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(html).toContain('id="splash"');
    expect(html).toContain('icons/logo.png');
    expect(existsSync(join(ROOT, 'public/icons/logo.png'))).toBe(true);
    expect(html).toContain("#app:not(:empty) ~ #splash { display: none; }");
    expect(html).toContain("[data-ux-surfaces='classic'] #splash { display: none; }");
    expect(html.indexOf('id="app"')).toBeLessThan(html.indexOf('id="splash"'));
  });
  test('premium onboarding css is imported, scoped, and has the gold selection', () => {
    expect(read('src/ui/styles/premium/index.css')).toContain("@import './onboarding.css';");
    const css = read('src/ui/styles/premium/onboarding.css');
    expect(css).toContain("::selection");
    expect(css).toContain('var(--gold-wash)');
    for (const line of css.split('\n')) if (/^:root\[/.test(line) === false && /^\s*\.sf-ob/.test(line)) throw new Error(`unscoped: ${line}`);
  });
  test('Welcome keys the step body so the glide replays; the Classic stylesheet is untouched', () => {
    expect(read('src/pages/welcome/WelcomePage.tsx')).toContain('<div class="sf-ob__body" key={step}>');
    expect(read('src/ui/styles/onboarding.css')).not.toContain('selection');
  });
});

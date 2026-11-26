import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checkSource, type Rule } from './guard/rules';

const ROOT = process.cwd();
const EXT = /\.(css|ts|tsx|js|jsx|html|svg)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'generated') continue; // src/dataset/generated is compiled output
      walk(p, out);
    } else if (EXT.test(name) && !/\.test\.[a-z]+$/.test(name)) out.push(p);
  }
  return out;
}

function scannedFiles(): string[] {
  const files = walk(join(ROOT, 'src'));
  for (const f of ['index.html', 'tailwind.config.js']) if (existsSync(join(ROOT, f))) files.push(join(ROOT, f));
  return files;
}

describe('guard: real files', () => {
  test('scans the expected files', () => {
    const rel = scannedFiles().map((f) => relative(ROOT, f).replace(/\\/g, '/'));
    expect(rel).toContain('src/ui/styles/tokens.css');
    expect(rel).toContain('index.html');
  });

  test('no colour literals outside tokens.css, no forbidden hues, no truncation, no CDN', () => {
    // Phase 111: index.html cannot read CSS variables, so it may repeat the page colour (the --bg-base token, checked below) for the
    // theme-color meta and the first-paint splash, and `#000` as an alpha mask (a mask has no colour). Nothing else.
    const baseHex = /--bg-base:\s*(#[0-9a-f]{6})/i.exec(readFileSync(join(ROOT, 'src/ui/styles/tokens.css'), 'utf8'))?.[1];
    expect(baseHex).toBeTruthy();
    const forHtml = (raw: string) =>
      raw
        .split('\n')
        .map((l) => (l.includes('mask-image') ? l.replace(/#000\b/g, 'black') : l).split(baseHex!).join('var(--bg-base)'))
        .join('\n');
    const found = scannedFiles().flatMap((f) => {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      const raw = readFileSync(f, 'utf8');
      return checkSource(rel, rel === 'index.html' ? forHtml(raw) : raw);
    });
    expect(found.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.snippet}`)).toEqual([]);
  });
});

// Deliberately bad fixtures: every rule must be able to fail. Good fixtures must stay clean.
const rulesOf = (file: string, text: string): Rule[] => [...new Set(checkSource(file, text).map((v) => v.rule))];

describe('guard: bad fixtures fail', () => {
  const cases: Array<[string, Rule, string, string]> = [
    ['hex literal in a component css', 'colour-literal', 'src/ui/a.css', '.a { color: #d4af37; }'],
    ['short hex literal in tsx', 'colour-literal', 'src/ui/a.tsx', "const c = '#fff';"],
    ['8-digit hex literal', 'colour-literal', 'src/ui/a.css', '.a { color: #d4af3780; }'],
    ['rgb() literal', 'colour-literal', 'src/ui/a.css', '.a { color: rgb(10, 20, 30); }'],
    ['rgba() literal', 'colour-literal', 'src/ui/a.css', '.a { color: rgba(0,0,0,.5); }'],
    ['hsl() literal', 'colour-literal', 'src/ui/a.css', '.a { color: hsl(40 50% 50%); }'],
    ['oklch() even inside tokens.css', 'colour-literal', 'src/ui/styles/tokens.css', ':root { --x: oklch(0.7 0.1 80); }'],
    ['purple hex inside tokens.css', 'forbidden-hue', 'src/ui/styles/tokens.css', ':root { --x: #8844ff; }'],
    ['pink hex (hue ~330)', 'forbidden-hue', 'src/ui/a.css', '.a { color: #ff4fa3; }'],
    ['indigo rgb() inside tokens.css', 'forbidden-hue', 'src/ui/styles/tokens.css', ':root { --x: rgb(75, 0, 130); }'],
    ['violet hsl() inside tokens.css', 'forbidden-hue', 'src/ui/styles/tokens.css', ':root { --x: hsl(270 60% 50%); }'],
    ['named colour purple', 'forbidden-hue', 'src/ui/a.css', '.a { background: purple; }'],
    ['Tailwind purple class', 'forbidden-hue', 'src/ui/a.tsx', '<div class="bg-purple-500" />'],
    ['Tailwind variant pink class', 'forbidden-hue', 'src/ui/a.tsx', '<div class="hover:text-pink-300" />'],
    ['text-overflow in css', 'text-overflow', 'src/ui/a.css', '.a { text-overflow: ellipsis; }'],
    ['Tailwind truncate class', 'text-overflow', 'src/ui/a.tsx', '<p class="truncate" />'],
    ['Tailwind text-ellipsis class', 'text-overflow', 'src/ui/a.tsx', '<p class="text-ellipsis" />'],
    ['-webkit-line-clamp', 'line-clamp', 'src/ui/a.css', '.a { -webkit-line-clamp: 2; }'],
    ['Tailwind line-clamp class', 'line-clamp', 'src/ui/a.tsx', '<p class="line-clamp-3" />'],
    ['Google Fonts link in index.html', 'cdn-url', 'index.html', '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">'],
    ['external script in index.html', 'cdn-url', 'index.html', '<script src="https://example.com/x.js"></script>'],
    ['@import external css', 'cdn-url', 'src/ui/a.css', "@import url('https://example.com/a.css');"],
    ['@font-face with remote url', 'cdn-url', 'src/ui/a.css', "@font-face { src: url(https://example.com/f.woff2); }"],
    ['CDN host in a ts string', 'cdn-url', 'src/a.ts', "import('https://cdn.jsdelivr.net/npm/three');"],
    ['unpkg in a ts string', 'cdn-url', 'src/a.ts', "const u = 'https://unpkg.com/x';"],
  ];
  test.each(cases)('%s', (_name, rule, file, text) => {
    expect(rulesOf(file, text)).toContain(rule);
  });
});

describe('guard: good fixtures stay clean', () => {
  const clean: Array<[string, string, string]> = [
    ['tokens.css holds colour literals', 'src/ui/styles/tokens.css', ':root { --gold-400: #d4af37; --g: rgba(212, 175, 55, 0.22); --ink: #f4eedc; }'],
    ['neutral grey in tokens.css', 'src/ui/styles/tokens.css', ':root { --x: #a39e93; --y: rgba(255,255,255,.03); }'],
    ['component uses variables', 'src/ui/a.css', '.a { color: var(--gold-400); background: var(--bg-card); }'],
    ['token names containing hue words are not colours', 'src/ui/a.css', '.a { color: var(--pink-ish-not-a-thing); }'],
    ['comment mentioning purple and text-overflow', 'src/ui/a.css', '/* never purple, never text-overflow, never #ff00ff */ .a { color: var(--text); }'],
    ['ts line comment with a hex', 'src/a.ts', '// colour #8844ff is banned\nconst x = 1;'],
    ['self-hosted font url', 'src/ui/styles/fonts.css', "@font-face { src: url('../fonts/inter.woff2') format('woff2'); }"],
    ['svg namespace is not a CDN', 'src/a.tsx', "const ns = 'http://www.w3.org/2000/svg';"],
    ['relative script in html', 'index.html', '<script type="module" src="/src/main.tsx"></script>'],
    ['id selector that is not hex', 'src/ui/a.css', '#app { margin: 0; }'],
  ];
  test.each(clean)('%s', (_name, file, text) => {
    expect(checkSource(file, text)).toEqual([]);
  });
});

// Pure guard rules (no fs). tests/guard.test.ts feeds them real files and bad fixtures.
// Rules: docs/design/UI_RULES.md + DESIGN_TOKENS.md.
// Known limit: CSS named colours (e.g. `red`) are only caught for the forbidden-hue names below.

export type Rule =
  | 'colour-literal'
  | 'forbidden-hue'
  | 'text-overflow'
  | 'line-clamp'
  | 'cdn-url';

export interface Violation {
  rule: Rule;
  file: string;
  line: number;
  snippet: string;
}

const TOKENS_FILE = /(^|\/)src\/ui\/styles\/tokens\.css$/;

/** Replace comments with spaces (newlines kept) so line numbers stay right. */
export function stripComments(file: string, text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  if (/\.html?$/.test(file)) return text.replace(/<!--[\s\S]*?-->/g, blank);
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!/\.css$/.test(file)) out = out.replace(/(^|\s)\/\/[^\n]*/g, (m) => blank(m));
  return out;
}

function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function rgbToHs(r: number, g: number, b: number): { h: number; s: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100 };
}

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
const RGB_FN = /\brgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/g;
const HSL_FN = /\bhsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%/g;
const OTHER_COLOUR_FN = /\b(hwb|lab|lch|oklab|oklch|color|color-mix)\(/g;

const BAD_HUE_NAMES =
  'purple|violet|indigo|magenta|fuchsia|pink|orchid|plum|lavender|thistle|hotpink|deeppink|rebeccapurple|blueviolet|darkviolet|darkorchid|mediumorchid|mediumpurple|mediumvioletred|palevioletred|lightpink';
const BAD_HUE_NAME = new RegExp(`(?<![\\w-])(${BAD_HUE_NAMES})(?![\\w-])`, 'gi');
const BAD_HUE_CLASS = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|divide|accent|caret|decoration)-(?:purple|violet|indigo|fuchsia|pink|rose|magenta)(?:-\\d{2,3})?(?![\\w-])`,
  'g',
);

const CDN_HOSTS =
  /(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|esm\.sh|cdn\.skypack\.dev|ajax\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net|code\.jquery\.com|cdn\.tailwindcss\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|kit\.fontawesome\.com|use\.fontawesome\.com)/gi;
const CSS_EXTERNAL_URL = /(?:url\(\s*['"]?|@import\s+(?:url\(\s*)?['"]?)(?:https?:)?\/\//gi;
const HTML_EXTERNAL_REF = /\b(?:src|href)\s*=\s*['"](?:https?:)?\/\//gi;

export function checkSource(file: string, raw: string): Violation[] {
  const text = stripComments(file, raw);
  const out: Violation[] = [];
  const isTokens = TOKENS_FILE.test(file);
  const add = (rule: Rule, index: number, snippet: string) =>
    out.push({ rule, file, line: lineOf(text, index), snippet: snippet.trim() });
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) fn(m);
  };
  const badHue = (h: number, s: number) => h >= 250 && h <= 350 && s > 10;

  // Colour literals: forbidden outside tokens.css; the hue rule applies everywhere, tokens.css included.
  each(HEX, (m) => {
    if (!isTokens) add('colour-literal', m.index, m[0]);
    let hex = m[1] as string;
    if (hex.length <= 4) hex = hex.split('').map((c) => c + c).join('');
    const { h, s } = rgbToHs(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
    if (badHue(h, s)) add('forbidden-hue', m.index, m[0]);
  });
  each(RGB_FN, (m) => {
    if (!isTokens) add('colour-literal', m.index, m[0]);
    const ch = (v: string | undefined, pct: string | undefined) => (pct ? (Number(v) / 100) * 255 : Number(v));
    const { h, s } = rgbToHs(ch(m[1], m[2]), ch(m[3], m[4]), ch(m[5], m[6]));
    if (badHue(h, s)) add('forbidden-hue', m.index, m[0]);
  });
  each(HSL_FN, (m) => {
    if (!isTokens) add('colour-literal', m.index, m[0]);
    if (badHue(Number(m[1]) % 360, Number(m[2]))) add('forbidden-hue', m.index, m[0]);
  });
  // Other colour functions cannot be hue-checked: never allowed, not even in tokens.css.
  each(OTHER_COLOUR_FN, (m) => add('colour-literal', m.index, m[0]));

  // Forbidden hue names / Tailwind classes (everywhere, tokens.css included).
  each(BAD_HUE_NAME, (m) => add('forbidden-hue', m.index, m[0]));
  each(BAD_HUE_CLASS, (m) => add('forbidden-hue', m.index, m[0]));

  // No truncation.
  each(/text-overflow/gi, (m) => add('text-overflow', m.index, m[0]));
  each(/(?<![\w-])(?:truncate|(?:text|overflow)-ellipsis)(?![\w-])/g, (m) => add('text-overflow', m.index, m[0]));
  each(/line-clamp/gi, (m) => add('line-clamp', m.index, m[0]));

  // No CDN / external font URLs.
  each(CDN_HOSTS, (m) => add('cdn-url', m.index, m[0]));
  if (/\.css$/.test(file)) each(CSS_EXTERNAL_URL, (m) => add('cdn-url', m.index, m[0]));
  if (/\.html?$/.test(file)) each(HTML_EXTERNAL_REF, (m) => add('cdn-url', m.index, m[0]));

  return out;
}

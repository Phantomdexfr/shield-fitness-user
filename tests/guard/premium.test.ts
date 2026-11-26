import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checkSource } from './rules';
import { UX_KEYS, DEFAULT_SWITCHES } from '../../src/shared/ux';
import { rowsFor } from '../../src/pages/settings/SettingsGroupPage';
import { en } from '../../src/i18n/en';

const ROOT = process.cwd();
const PREMIUM_DIR = join(ROOT, 'src/ui/styles/premium');
const premiumFiles = () => readdirSync(PREMIUM_DIR).filter((f) => f.endsWith('.css'));

describe('premium CSS rules', () => {
  test('the premium folder exists and index.css is imported once from styles/index.css', () => {
    expect(premiumFiles()).toContain('index.css');
    expect(readFileSync(join(ROOT, 'src/ui/styles/index.css'), 'utf8').match(/premium\/index\.css/g)).toHaveLength(1);
  });
  test('no hex or colour literal, no text-overflow / line-clamp, no hue 250-350 in premium/*.css', () => {
    const found = premiumFiles().flatMap((f) => checkSource(`src/ui/styles/premium/${f}`, readFileSync(join(PREMIUM_DIR, f), 'utf8')));
    expect(found.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.snippet}`)).toEqual([]);
  });
  test('every rule is scoped under :root[data-ux-<key>=...] (imports and comments aside)', () => {
    for (const f of premiumFiles()) {
      // Phase 99: @supports / @media wrappers are not selectors; the rules inside them are still checked.
      const text = readFileSync(join(PREMIUM_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@(supports|media)[^{]*\{/g, '}');
      const selectors = [...text.matchAll(/(^|\})\s*([^{}]+)\{/g)].map((m) => (m[2] as string).trim()).filter(Boolean);
      for (const sel of selectors) for (const part of sel.split(',')) expect(part.trim(), `${f}: ${part}`).toMatch(/^:root\[data-ux-[a-z]+='premium'\]/);
    }
  });
  test('depth tokens live in tokens.css', () => {
    const tokens = readFileSync(join(ROOT, 'src/ui/styles/tokens.css'), 'utf8');
    for (const t of ['--sh-1', '--sh-2', '--sh-3', '--hl-top', '--hero-wash', '--tile-tint']) expect(tokens).toContain(`${t}:`);
  });
});

describe('every ux key has a Settings row, a default and a string', () => {
  test('nine keys, all default on', () => {
    expect(UX_KEYS).toEqual(['surfaces', 'icons', 'tabbar', 'headers', 'controls', 'wheels', 'sheets', 'motion', 'layout']);
    for (const k of UX_KEYS) expect(DEFAULT_SWITCHES[k], k).toBe(true);
  });
  test('the Appearance group renders the Interface style block, which has a label and hint per key', () => {
    expect(rowsFor('appearance').some((r) => r.kind === 'ux')).toBe(true);
    const block = readFileSync(join(ROOT, 'src/pages/settings/InterfaceStyle.tsx'), 'utf8');
    expect(block).toContain('UX_KEYS.map');
    for (const k of UX_KEYS) {
      expect(`ux.sw.${k}` in en, k).toBe(true);
      expect(`ux.sw.${k}.hint` in en, k).toBe(true);
    }
  });
  test('index.html early-apply script uses the same key order and storage key as the code', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/var k = \[([^\]]+)\]/);
    expect((m?.[1] ?? '').replace(/['\s]/g, '').split(',')).toEqual([...UX_KEYS]);
    expect(html).toContain("localStorage.getItem('sf.ux')");
  });
});

// Classic integrity (Phase 96 writes the list; later phases APPEND to CLASSIC). With every switch off the classic paths must still exist.
const CLASSIC: Array<{ file: string; mustContain: string[] }> = [
  { file: 'src/ui/styles/base.css', mustContain: ['scrollbar-width: thin', '::-webkit-scrollbar-thumb'] },
  { file: 'src/ui/styles/components.css', mustContain: ['.sf-seg {', '.sf-toggle__track', '.sf-rowgroup', '.sf-sheet__body', '--sh-card'] },
  { file: 'src/ui/styles/recap.css', mustContain: ['.sf-rcp__track', 'scrollbar-width: none'] },
  { file: 'src/ui/styles/settings.css', mustContain: ['.sf-st__row', '.sf-st__group'] },
  { file: 'src/ui/components/Choice.tsx', mustContain: ['export function Segmented', 'sf-seg__item'] },
  { file: 'src/ui/components/Form.tsx', mustContain: ['export function Toggle', 'export function Stepper'] },
  { file: 'src/ui/components/Rows.tsx', mustContain: ['export function RowGroup', 'sf-rowgroup__box'] },
  // Phase 98
  { file: 'src/pages/MePage.tsx', mustContain: ["icon: 'check', feature: 'flexible_session'", "icon: 'info', feature: null"] },
  { file: 'src/shared/settings.ts', mustContain: ["slug: 'reminders', icon: 'check'", "slug: 'body', icon: 'info'"] },
  // Phase 100
  { file: 'src/ui/styles/components.css', mustContain: ['.sf-seg__item--on {', '.sf-chip--on {', '.sf-input:focus {', '.sf-toggle--on .sf-toggle__thumb', '.sf-btn--primary[data-pressed=\'true\']'] },
  { file: 'src/ui/components/Choice.tsx', mustContain: ['sf-seg__item', 'role="radiogroup"'] },
  { file: 'src/ui/components/Chip.tsx', mustContain: ['export function Chip', 'sf-chip--on', 'aria-pressed'] },
  { file: 'src/ui/components/Form.tsx', mustContain: ['export function Input', 'sf-input', 'export function Toggle'] },
  { file: 'src/ui/components/Button.tsx', mustContain: ['export function Button', 'sf-btn--${variant}', 'export function IconButton'] },
  // Phase 99
  { file: 'src/ui/styles/shell.css', mustContain: ['.sf-tabbar {', 'background: var(--bg-raised)', '.sf-tabbar__item.is-active'] },
  { file: 'src/ui/styles/components.css', mustContain: ['.sf-subheader {', '.sf-subheader__title {', 'font-size: var(--text-lg)'] },
  { file: 'src/ui/components/SubPageHeader.tsx', mustContain: ['export function SubPageHeader', '<header class="sf-subheader">', 'sf-subheader__title'] },
  { file: 'src/app/Shell.tsx', mustContain: ['sf-tabbar__item', "<nav class=\"sf-tabbar\""] },
  // Phase 101
  { file: 'src/ui/components/Rows.tsx', mustContain: ['export function NumberRow', '<Stepper label={label}', 'sf-numrow__actions'] },
  { file: 'src/ui/components/Form.tsx', mustContain: ['export function Stepper', 'sf-stepper__value'] },
  { file: 'src/pages/settings/SettingsGroupPage.tsx', mustContain: ['<Stepper label={spec.label}', 'sf-st__row'] },
  // Phase 104
  { file: 'src/ui/styles/components.css', mustContain: ['.sf-skeleton {', '@keyframes sf-shimmer', ".sf-press[data-pressed='true'] {", 'transform: scale(0.97)'] },
  { file: 'src/ui/components/Pressable.tsx', mustContain: ['export function Pressable', 'tick();', 'data-pressed'] },
  { file: 'src/ui/charts/charts.css', mustContain: ['.sf-ch-sweep {', '.sf-ch-still .sf-ch-draw', '@keyframes sf-ch-draw'] },
  // Phase 103
  { file: 'src/ui/styles/shell.css', mustContain: ['.sf-page {', 'animation: sf-page-in var(--dur-base) var(--ease-out) backwards', '@keyframes sf-page-in'] },
  { file: 'src/app/navBack.ts', mustContain: ['export function goBack', 'export function navIndex', 'installNavIndex'] },
  // Phase 102
  { file: 'src/ui/styles/components.css', mustContain: ['.sf-overlay--sheet {', '.sf-sheet--dragging {', '.sf-sheet__grip {', '@keyframes sf-sheet-in'] },
  { file: 'src/ui/components/Overlay.tsx', mustContain: ['function ClassicSheet', 'sf-sheet--dragging', 'DISMISS_DRAG_PX', 'export function Dialog'] },
  { file: 'src/ui/components/DatePicker.tsx', mustContain: ['sf-cal__selects', 'sf-cal__grid', 'cal.clear', 'cal.set'] },
  // Phase 105
  { file: 'src/ui/styles/settings.css', mustContain: ['.sf-st__list {', '.sf-st__group {', '.sf-st__row {'] },
  { file: 'src/ui/styles/body.css', mustContain: ['.sf-lib__list, .sf-lib__machines', '.sf-lib__row {', '.sf-lib__mcard {'] },
  { file: 'src/pages/MePage.tsx', mustContain: ['<ul class="sf-st__list">{shown.map(item)}</ul>', 'export const ME_LINKS'] },
  { file: 'src/pages/session/TrainPage.tsx', mustContain: ['id="ways"', 'fs.train.routines', 'fs.train.progress'] },
  // Phase 108
  { file: 'src/ui/styles/onboarding.css', mustContain: ['.sf-ob {', '.sf-ob__seg--on', '.sf-ob__figure {', '.sf-ob__foot {'] },
  { file: 'src/pages/welcome/WelcomePage.tsx', mustContain: ['<NumberRow', '<DatePicker', '<Segmented<Sex>', 'sf-ob__seg'] },
  // Phase 107
  { file: 'src/pages/session/SetLogger.tsx', mustContain: ['<Stepper label={t(\'lg.weight\')}', '<Stepper label={t(\'lg.reps\')}', 'sf-lg__pair'] },
  { file: 'src/pages/session/SessionPage.tsx', mustContain: ['fs.finish.go', 'fs.notdone', 'sf-rt__undo'] },
  { file: 'src/ui/styles/routine.css', mustContain: ['.sf-lg__rest {', '.sf-lg__row {', '.sf-lg__pair {', '.sf-lg__field {', '.sf-lg--big .sf-lg__pair'] },
  // Phase 97
  { file: 'src/ui/styles/components.css', mustContain: ['.sf-card--gold', '.sf-card--padded', '.sf-rowgroup__box > .sf-row + .sf-row', '.sf-rowgroup__box {'] },
  { file: 'src/ui/components/Card.tsx', mustContain: ['export function Card', 'sf-card--${tone}'] },
];

describe('classic integrity', () => {
  test('the classic selectors, classes and component paths still exist', () => {
    for (const c of CLASSIC) {
      expect(existsSync(join(ROOT, c.file)), c.file).toBe(true);
      const text = readFileSync(join(ROOT, c.file), 'utf8');
      for (const s of c.mustContain) expect(text, `${c.file} lacks ${s}`).toContain(s);
    }
  });
});

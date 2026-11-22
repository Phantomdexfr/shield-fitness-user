// Phase 87 guard: a page file may not draw more than 3 always-open top-level sections (plain section blocks).
// Long pages use <Collapsible>. Exceptions are listed by file with a reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.tsx') ? [join(d, f)] : []));
const BLOCK = /<section[^>]*class="(?:sf-ex__block|sf-hm__sec|sf-lab__sec)[^"]*"|<Card as="section"/g;
/** file -> reason it may keep more open blocks (none yet; add with the owner's word). */
const EXCEPTIONS: Record<string, string> = {};

describe('Phase 87 declutter II', () => {
  const files = walk('src/pages');
  it('no page draws more than 3 always-open section blocks', () => {
    const bad = files.filter((f) => !(f in EXCEPTIONS) && (readFileSync(f, 'utf8').match(BLOCK)?.length ?? 0) > 3).map((f) => f);
    expect(bad).toEqual([]);
  });
  it.each([
    'src/pages/exercise/ExercisePage.tsx',
    'src/pages/exercise/MachinePage.tsx',
    'src/pages/machines/MachineIndexPage.tsx',
    'src/pages/machines/MachineLabPage.tsx',
    'src/pages/library/LibraryPage.tsx',
    'src/pages/body/RecoveryPage.tsx',
    'src/pages/heatmap/HeatmapPage.tsx',
    'src/pages/progress/ProgressHub.tsx',
    'src/pages/progress/GoalsPage.tsx',
    'src/pages/progress/BodyPage.tsx',
    'src/pages/settings/SettingsGroupPage.tsx',
    'src/pages/settings/BackupHomePage.tsx',
  ])('%s uses Collapsible', (f) => {
    expect(readFileSync(f, 'utf8')).toContain('<Collapsible');
  });
  it('settings rows with 4 or more options use ChoiceRow', () => {
    expect(readFileSync('src/pages/settings/SettingsGroupPage.tsx', 'utf8')).toContain('options.length >= 4');
  });
});

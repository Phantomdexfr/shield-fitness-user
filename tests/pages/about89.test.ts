// Phase 89: About shows the maker's name (bold) and the Android install button is always offered on Android states.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aboutIsEmpty, parseAbout } from '../../src/shared/content';
import aboutJson from '../../src/content/about.json';

const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('About content (Phase 89)', () => {
  it('the shipped file has the maker name', () => {
    expect(parseAbout(aboutJson).author).toBe('Ankit Shukla');
  });
  it('an older file without author still parses and counts as empty only when all is empty', () => {
    const old = parseAbout({ tagline: 'x', description: [], contact: '', links: [] });
    expect(old.author).toBe('');
    expect(aboutIsEmpty(old)).toBe(false);
    expect(aboutIsEmpty(parseAbout({ tagline: '', description: [], contact: '', links: [] }))).toBe(true);
  });
  it('the page renders the author inside <strong>', () => {
    expect(read('src/pages/settings/AboutPage.tsx')).toMatch(/<strong>\{about\.author\}<\/strong>/);
  });
});

describe('Install button (Phase 89)', () => {
  const gate = read('src/pwa/InstallGate.tsx');
  it('shows for every Android state, not only when the prompt was already captured', () => {
    expect(gate).toMatch(/isAndroidState && \(\s*<Button/);
  });
  it('without a captured prompt it explains the browser menu instead of doing nothing', () => {
    expect(gate).toContain("gate.android.menu");
    expect(gate).toContain('promptInstall()');
  });
});

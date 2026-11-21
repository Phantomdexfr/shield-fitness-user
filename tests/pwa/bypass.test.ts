import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

// Needs a production build, which the sandbox never runs: skipped until `dist/` exists (GitHub build or local).
describe('dev bypass is compiled out of production', () => {
  it.skipIf(!existsSync('dist'))('no "bypass-gate" string in dist/', () => {
    for (const f of files('dist').filter((p) => /\.(js|html|css)$/.test(p))) {
      expect(readFileSync(f, 'utf8').includes('bypass-gate'), f).toBe(false);
    }
  });
});

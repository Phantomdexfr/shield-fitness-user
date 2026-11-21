import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// Phase 1 trivial test: postbuild copies index.html to 404.html byte for byte.
test('postbuild writes 404.html equal to index.html', () => {
  const dist = mkdtempSync(join(tmpdir(), 'sfu-dist-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>x</title>');
  execFileSync('node', ['scripts/postbuild.mjs', dist]);
  expect(readFileSync(join(dist, '404.html'), 'utf8')).toBe(readFileSync(join(dist, 'index.html'), 'utf8'));
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blocksPush, emptyCheck, mergeAction, shouldResetCursors, SHRINK_THRESHOLD } from '../../src/shared/emptyCheck';

const fx = JSON.parse(readFileSync('tests/fixtures/restore_empty_check.json', 'utf8'));

describe('emptyCheck (fixtures restore_empty_check)', () => {
  for (const c of fx.cases) it(c.name, () => expect(emptyCheck(c.in)).toBe(c.out));
  it('threshold is 30 percent (A-R9)', () => expect(SHRINK_THRESHOLD).toBe(0.3));
  it('only ok lets pushes go', () => {
    expect(blocksPush('ok')).toBe(false);
    for (const v of ['restore_offer', 'block_push', 'different_owner'] as const) expect(blocksPush(v)).toBe(true);
  });
});

describe('cursor reset', () => {
  for (const c of fx.cursors) it(`rows ${c.localRows}, cursors ${c.cursorCount}`, () => expect(shouldResetCursors(c.localRows, c.cursorCount)).toBe(c.reset));
});

describe('mergeAction (merge, never overwrite)', () => {
  for (const c of fx.merge) it(c.name, () => expect(mergeAction(c.local ?? undefined, c.incoming)).toBe(c.out));
});

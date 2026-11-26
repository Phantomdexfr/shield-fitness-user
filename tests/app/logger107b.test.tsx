// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { SetLogger } from '../../src/pages/session/SetLogger';
import { applyUx } from '../../src/app/appearance';
import { onUxChange } from '../../src/data/repos/ux';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';
import { DEFAULT_LOGGER_PREFS, SWIPE_FOLLOW_MAX, swipeFollow } from '../../src/shared/logger';
import type { Session } from '../../src/shared/session';
import type { LoggerInfo } from '../../src/data/repos/logger';

const host = document.createElement('div');
document.body.appendChild(host);
beforeAll(() => onUxChange(applyUx));
afterEach(() => render(null, host));

const INFO: LoggerInfo = { cls: 'compound', cardio: false, timed: false, repMin: 8, repMax: 12, stepKg: null, outOfOrder: false };
const set = (w: number, r: number, at: string) => ({ weightKg: w, reps: r, tag: 'normal' as const, doneAt: at });
const session = (): Session => ({
  id: 's1', clientId: 's1', startedAt: '2026-11-26T05:00:00.000Z',
  items: [{ ref: { kind: 'lib', slug: 'barbell-bench-press' } as never, status: 'doing', sets: [set(60, 10, '2026-11-26T05:10:00.000Z'), set(62.5, 8, '2026-11-26T05:12:00.000Z')], order: 0 }],
});
type Commit = { next: Session; undo?: { text: string; restore: (c: Session) => Session } };

const mount = async (sw: ReturnType<typeof allSwitches>, out: Commit[]) => {
  applyUx(sw);
  await act(async () => render(null, host));
  const sess = session();
  await act(async () => render(<SetLogger sess={sess} idx={0} item={sess.items[0]!} info={INFO} hist={undefined} prefs={DEFAULT_LOGGER_PREFS} onPrefs={() => {}} commit={(next, undo) => { out.push({ next, ...(undo ? { undo } : {}) }); }} />, host));
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return sess;
};
const ptr = (el: Element, type: string, x: number, y = 0) => el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
const swipe = async (row: HTMLElement, dx: number) => {
  await act(async () => { ptr(row, 'pointerdown', 200); });
  await act(async () => { ptr(row, 'pointermove', 200 + dx); });
  const mid = { x: row.style.getPropertyValue('--sw-x'), dir: row.dataset.swipe, ready: row.dataset.ready };
  await act(async () => { ptr(row, 'pointerup', 200 + dx); });
  return mid;
};

describe('swipeFollow (pure)', () => {
  test('follows a horizontal drag up to the clamp, names the action only past the threshold, ignores a scroll', () => {
    expect(swipeFollow(30, 0)).toEqual({ x: 30, action: null });
    expect(swipeFollow(-70, 5)).toEqual({ x: -70, action: 'delete' });
    expect(swipeFollow(80, 0)).toEqual({ x: 80, action: 'duplicate' });
    expect(swipeFollow(500, 0).x).toBe(SWIPE_FOLLOW_MAX);
    expect(swipeFollow(-500, 0).x).toBe(-SWIPE_FOLLOW_MAX);
    expect(swipeFollow(40, 80)).toEqual({ x: 0, action: null });
    expect(swipeFollow(4, 0)).toEqual({ x: 0, action: null });
  });
});

describe('Swipe set rows with undo', () => {
  test('Premium: the row follows the finger, left deletes, Undo restores the same set; the row is reset after release', async () => {
    const out: Commit[] = [];
    const sess = await mount(DEFAULT_SWITCHES, out);
    const rows = [...host.querySelectorAll('.sf-lg__row')] as HTMLElement[];
    expect(rows.length).toBe(2);
    const mid = await swipe(rows[0]!, -80);
    expect(mid).toEqual({ x: '-80px', dir: 'delete', ready: 'yes' });
    expect(rows[0]!.style.getPropertyValue('--sw-x')).toBe('');
    expect(rows[0]!.dataset.swipe).toBeUndefined();
    expect(out.length).toBe(1);
    expect(out[0]!.next.items[0]!.sets.map((s) => s.weightKg)).toEqual([62.5]);
    const back = out[0]!.undo!.restore(out[0]!.next);
    expect(back.items[0]!.sets).toEqual(sess.items[0]!.sets);
  });

  test('Premium: a short drag shows the hint but does nothing; right copies and Undo removes the copy', async () => {
    const out: Commit[] = [];
    await mount(DEFAULT_SWITCHES, out);
    const rows = [...host.querySelectorAll('.sf-lg__row')] as HTMLElement[];
    const mid = await swipe(rows[1]!, 30);
    expect(mid.ready).toBe('');
    expect(out.length).toBe(0);
    await swipe(rows[1]!, 90);
    expect(out.length).toBe(1);
    expect(out[0]!.next.items[0]!.sets.length).toBe(3);
    expect(out[0]!.undo!.restore(out[0]!.next).items[0]!.sets.length).toBe(2);
  });

  test('Classic: same swipe, same result, nothing follows the finger', async () => {
    const out: Commit[] = [];
    await mount(allSwitches(false), out);
    const rows = [...host.querySelectorAll('.sf-lg__row')] as HTMLElement[];
    const mid = await swipe(rows[0]!, -80);
    expect(mid.x).toBe('');
    expect(mid.dir).toBeUndefined();
    expect(out.length).toBe(1);
    expect(out[0]!.next.items[0]!.sets.length).toBe(1);
  });
});

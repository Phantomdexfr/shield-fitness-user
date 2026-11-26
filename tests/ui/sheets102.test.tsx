// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DatePicker, Sheet } from '../../src/ui/components';
import { SHEET, keyboardInset, rubberBand, sheetRelease, sheetVelocity } from '../../src/ui/components/motion';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { render(null, host); document.body.querySelectorAll('.sf-overlay').forEach((n) => n.remove()); vi.useRealTimers(); });
const q = <T extends Element = HTMLElement>(s: string) => document.body.querySelector(s) as T;
const mount = async (v: preact.VNode) => { await act(async () => { render(null, host); render(v, host); }); };
const ptr = async (el: Element, type: string, y: number, t: number) => {
  await act(async () => { const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>; e.clientY = y; e.pointerId = 1; Object.defineProperty(e, 'timeStamp', { value: t }); el.dispatchEvent(e); });
};
const premium = () => applyUx(DEFAULT_SWITCHES);
const classic = () => applyUx(allSwitches(false));

describe('pure sheet maths', () => {
  test('rubberBand: 0 stays 0, grows, never passes the limit', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(-5)).toBe(0);
    expect(rubberBand(50)).toBeGreaterThan(0);
    expect(rubberBand(50)).toBeLessThan(50);
    expect(rubberBand(100)).toBeGreaterThan(rubberBand(50));
    expect(rubberBand(100000)).toBeLessThan(320);
  });
  test('velocity from the two newest samples', () => {
    expect(sheetVelocity([])).toBe(0);
    expect(sheetVelocity([{ y: 0, t: 0 }, { y: 50, t: 50 }])).toBe(1);
    expect(sheetVelocity([{ y: 0, t: 0 }, { y: 50, t: 500 }])).toBe(0);
    expect(sheetVelocity([{ y: 0, t: 0 }, { y: 50, t: 50 }], 90)).toBe(1);
    expect(sheetVelocity([{ y: 0, t: 0 }, { y: 50, t: 50 }], 400)).toBe(0); // paused, then lifted: not a flick
  });
  test('release: threshold, flick, detents', () => {
    expect(sheetRelease(SHEET.dismissPx - 1, 0, 'large', false)).toBe('stay');
    expect(sheetRelease(SHEET.dismissPx, 0, 'large', false)).toBe('dismiss');
    expect(sheetRelease(10, 0.7, 'large', false)).toBe('dismiss');
    expect(sheetRelease(100, 0, 'large', true)).toBe('medium');
    expect(sheetRelease(400, 0, 'large', true)).toBe('dismiss');
    expect(sheetRelease(100, 0, 'medium', true)).toBe('dismiss');
    expect(sheetRelease(-100, 0, 'medium', true)).toBe('large');
    expect(sheetRelease(-10, -0.9, 'medium', true)).toBe('large');
    expect(sheetRelease(-100, 0, 'large', true)).toBe('stay');
    expect(sheetRelease(-100, 0, 'medium', false)).toBe('stay');
  });
  test('keyboard inset ignores browser-bar jitter', () => {
    expect(keyboardInset(800, null)).toBe(0);
    expect(keyboardInset(800, { height: 790, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
    expect(keyboardInset(800, { height: 500, offsetTop: 100 })).toBe(200);
  });
});

describe('Sheet', () => {
  test('premium: open, grab handle, title, body; closes by the close button and Escape', async () => {
    premium();
    let open = true;
    const draw = () => mount(<Sheet open={open} onClose={() => { open = false; void draw(); }} title="Pick"><p>Body</p></Sheet>);
    await draw();
    expect(q('.sf-sheet--premium')).toBeTruthy();
    expect(q('.sf-sheet__handle')).toBeTruthy();
    expect(q('.sf-sheet').getAttribute('role')).toBe('dialog');
    expect(q('.sf-sheet__title').textContent).toBe('Pick');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(open).toBe(false);
    expect(q('.sf-sheet')).toBeNull();
  });
  test('premium: a long pull down dismisses (reduced motion: at once), a short one springs back', async () => {
    premium();
    document.documentElement.setAttribute('data-motion', 'reduced');
    let closed = 0;
    await mount(<Sheet open onClose={() => { closed += 1; }} title="Pick"><p>Body</p></Sheet>);
    const grip = q('.sf-sheet__grip');
    await ptr(grip, 'pointerdown', 100, 0);
    await ptr(grip, 'pointermove', 140, 500);
    await ptr(grip, 'pointerup', 140, 600);
    expect(closed).toBe(0);
    expect(q('.sf-sheet').getAttribute('style') ?? '').not.toContain('translateY');
    await ptr(grip, 'pointerdown', 100, 1000);
    await ptr(grip, 'pointermove', 230, 1500);
    expect(q('.sf-sheet').getAttribute('style')).toContain('translateY(130px)');
    await ptr(grip, 'pointerup', 230, 1600);
    document.documentElement.removeAttribute('data-motion');
    expect(closed).toBe(1);
  });
  test('premium: a medium sheet goes to large when pulled up, and rubber-bands past the top', async () => {
    premium();
    await mount(<Sheet open onClose={() => {}} title="Pick" detent="medium"><p>Body</p></Sheet>);
    expect(q('.sf-sheet').getAttribute('data-detent')).toBe('medium');
    const grip = q('.sf-sheet__grip');
    await ptr(grip, 'pointerdown', 400, 0);
    await ptr(grip, 'pointermove', 300, 500);
    expect(q('.sf-sheet').getAttribute('style')).toMatch(/translateY\(-\d/);
    await ptr(grip, 'pointerup', 300, 600);
    expect(q('.sf-sheet').getAttribute('data-detent')).toBe('large');
    await ptr(grip, 'pointerdown', 300, 1000);
    await ptr(grip, 'pointermove', 400, 1500);
    await ptr(grip, 'pointerup', 400, 1600);
    expect(q('.sf-sheet').getAttribute('data-detent')).toBe('medium');
  });
  test('classic: the old sheet, no premium class, drag past 80 px closes', async () => {
    classic();
    let closed = 0;
    await mount(<Sheet open onClose={() => { closed += 1; }} title="Pick"><p>Body</p></Sheet>);
    expect(q('.sf-sheet--premium')).toBeNull();
    expect(q('.sf-sheet__handle')).toBeTruthy();
    const grip = q('.sf-sheet__grip');
    await ptr(grip, 'pointerdown', 100, 0);
    await ptr(grip, 'pointermove', 200, 100);
    await ptr(grip, 'pointerup', 200, 150);
    expect(closed).toBe(1);
    premium();
  });
});

describe('DatePicker keeps its structure under premium sheets', () => {
  test('two dropdowns above the day grid, Cancel and Set; Clear when clearable', async () => {
    premium();
    await mount(<DatePicker label="Born" value="2000-05-04" onChange={() => {}} today="2026-11-26" clearable />);
    await act(async () => { q<HTMLButtonElement>('button.sf-datefield').click(); });
    const cal = q('.sf-cal');
    expect(q('.sf-sheet--premium')).toBeTruthy();
    expect(cal.querySelectorAll('.sf-cal__selects select')).toHaveLength(2);
    expect(cal.querySelector('.sf-cal__grid')).toBeTruthy();
    expect(cal.querySelectorAll('.sf-cal__actions button')).toHaveLength(2);
    expect(host.textContent).toContain('Clear');
    const order = [...cal.children].map((c) => c.className);
    expect(order[0]).toContain('sf-cal__selects');
    expect(order[1]).toContain('sf-cal__grid');
    expect(order[2]).toContain('sf-cal__actions');
  });
});

describe('sheets.css', () => {
  const css = readFileSync(join(__dirname, '../../src/ui/styles/premium/sheets.css'), 'utf8');
  test('keyboard-aware, dvh, fading scrim, reduced-motion fallback', () => {
    expect(css).toContain('--sheet-kb');
    expect(css).toContain('dvh');
    expect(css).toContain('sf-scrim-in');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain("[data-motion='reduced']");
  });
});

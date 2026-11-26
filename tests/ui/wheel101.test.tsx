// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { NumberRow, WheelPicker } from '../../src/ui/components';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => { render(null, host); document.body.querySelectorAll('.sf-overlay, .sf-sheet').forEach((n) => n.remove()); });
const q = <T extends Element = HTMLElement>(s: string) => document.body.querySelector(s) as T;
const mount = async (v: preact.VNode) => { await act(async () => { render(null, host); render(v, host); }); };
const key = async (el: Element, k: string) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }); };

describe('WheelPicker', () => {
  test('is a spinbutton with name, min, max, now and a spoken value', async () => {
    applyUx(DEFAULT_SWITCHES);
    await mount(<WheelPicker label="Height" value={170} min={100} max={250} format={(n) => `${n} cm`} onChange={() => {}} />);
    const w = q('[role=spinbutton]');
    expect(w.getAttribute('aria-label')).toBe('Height');
    expect(w.getAttribute('aria-valuemin')).toBe('100');
    expect(w.getAttribute('aria-valuemax')).toBe('250');
    expect(w.getAttribute('aria-valuenow')).toBe('170');
    expect(w.getAttribute('aria-valuetext')).toBe('170 cm');
    expect(w.getAttribute('tabindex')).toBe('0');
    expect(host.querySelectorAll('.sf-wheel__item')).toHaveLength(151);
    expect(host.querySelectorAll('.sf-wheel__item--on')).toHaveLength(1);
    expect(q('.sf-wheel__item--on').textContent).toBe('170 cm');
    expect(host.querySelectorAll('.sf-wheel__item[aria-hidden=true]')).toHaveLength(151);
  });
  test('keyboard: arrows, PageUp/PageDown, Home, End, clamped at the ends', async () => {
    applyUx(DEFAULT_SWITCHES);
    let v = 10;
    const draw = () => mount(<WheelPicker label="Rest" value={v} min={0} max={20} onChange={(n) => { v = n; void draw(); }} />);
    await draw();
    const w = () => q('[role=spinbutton]');
    await key(w(), 'ArrowDown'); expect(v).toBe(11);
    await key(w(), 'ArrowUp'); await key(w(), 'ArrowUp'); expect(v).toBe(9);
    await key(w(), 'PageDown'); expect(v).toBe(14);
    await key(w(), 'PageUp'); expect(v).toBe(9);
    await key(w(), 'End'); expect(v).toBe(20);
    await key(w(), 'ArrowDown'); expect(v).toBe(20);
    await key(w(), 'Home'); expect(v).toBe(0);
    await key(w(), 'ArrowUp'); expect(v).toBe(0);
    expect(w().getAttribute('aria-valuenow')).toBe('0');
  });
  test('a scroll to a line picks that line; a tap on a line picks it', async () => {
    applyUx(DEFAULT_SWITCHES);
    let v = 5;
    const draw = () => mount(<WheelPicker label="Reps" value={v} min={1} max={30} onChange={(n) => { v = n; void draw(); }} />);
    await draw();
    const list = q<HTMLElement>('.sf-wheel__list');
    await act(async () => { list.scrollTop = 44 * 11; list.dispatchEvent(new Event('scroll')); });
    expect(v).toBe(12);
    await act(async () => { (host.querySelectorAll('.sf-wheel__item')[2] as HTMLElement).click(); });
    expect(v).toBe(3);
  });
  test('a value off the list snaps to the nearest line; an empty range draws nothing', async () => {
    applyUx(DEFAULT_SWITCHES);
    await mount(<WheelPicker label="W" value={51} min={0} max={100} step={5} onChange={() => {}} />);
    expect(q('[role=spinbutton]').getAttribute('aria-valuenow')).toBe('50');
    await mount(<WheelPicker label="W" value={1} min={10} max={0} onChange={() => {}} />);
    expect(host.querySelector('.sf-wheel')).toBeNull();
  });
});

describe('NumberRow: wheel in Premium, stepper in Classic', () => {
  const openRow = async () => { await act(async () => { (host.querySelector('button, [role=button]') as HTMLElement).click(); }); };
  test('premium opens a wheel and a "Use steppers instead" button; Done applies the wheel value', async () => {
    applyUx(DEFAULT_SWITCHES);
    let got = 0;
    await mount(<NumberRow label="Height" value={170} min={100} max={250} format={(n) => `${n} cm`} onChange={(n) => (got = n)} />);
    await openRow();
    expect(q('[role=spinbutton]')).not.toBeNull();
    expect(q('.sf-stepper')).toBeNull();
    expect(document.body.textContent).toContain('Use steppers instead');
    await key(q('[role=spinbutton]'), 'ArrowDown');
    const done = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Done') as HTMLElement;
    await act(async () => { done.click(); });
    expect(got).toBe(171);
  });
  test('classic keeps the stepper and shows no wheel and no link', async () => {
    applyUx(allSwitches(false));
    await mount(<NumberRow label="Height" value={170} min={100} max={250} onChange={() => {}} />);
    await openRow();
    expect(q('.sf-stepper')).not.toBeNull();
    expect(q('[role=spinbutton]')).toBeNull();
    expect(document.body.textContent).not.toContain('Use steppers instead');
  });
  test('the wheel switch alone decides it (other switches off, wheels on)', async () => {
    applyUx({ ...allSwitches(false), wheels: true });
    await mount(<NumberRow label="Rest" value={90} min={15} max={600} step={15} onChange={() => {}} />);
    await openRow();
    expect(q('[role=spinbutton]')).not.toBeNull();
    expect(q('[role=spinbutton]').getAttribute('aria-valuenow')).toBe('90');
  });
});

describe('wheel CSS', () => {
  test('premium wheel.css is scoped, imported, and uses scroll-snap and the gold lines', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles/premium/wheel.css'), 'utf8');
    expect(readFileSync(join(process.cwd(), 'src/ui/styles/premium/index.css'), 'utf8')).toContain("@import './wheel.css'");
    expect(css).toContain('scroll-snap-type: y mandatory');
    expect(css).toContain('var(--gold-600)');
    expect(css).not.toMatch(/ellipsis|line-clamp/);
  });
});

// @vitest-environment happy-dom
// Phase 84: the shared calendar picker and the guard that no native or typed date field comes back.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DatePicker } from '../../src/ui/components';

const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
};
const SRC = walk(join(__dirname, '../../src'));
const find = (re: RegExp) => SRC.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/^.*\/src\//, 'src/'));

describe('guard: no native or typed date field', () => {
  test('no type="date", "datetime-local", "month" or "week" input anywhere in src', () => {
    expect(find(/type=["']?(date|datetime-local|month|week|time)["'}]/)).toEqual([]);
    expect(find(/type:\s*['"](date|datetime-local|month|week|time)['"]/)).toEqual([]);
  });
  test('no birth-year text field: the settings row is a date row', () => {
    expect(find(/birthYear\?:\s*boolean|spec\.birthYear/)).toEqual([]);
  });
});

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => act(() => render(null, root)));
const mount = (v: preact.ComponentChild) => act(() => render(v, root));
const q = <T extends Element>(sel: string) => document.querySelector(sel) as T;
const qa = (sel: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(sel));
const TODAY = '2026-11-22';

describe('DatePicker', () => {
  test('shows "Not set" or the chosen day, and is a button (nothing to type)', () => {
    mount(<DatePicker label="From" value="" onChange={() => {}} today={TODAY} />);
    expect(q('button.sf-datefield').textContent).toBe('Not set');
    expect(document.querySelector('input')).toBeNull();
    mount(<DatePicker label="From" value="1998-03-12" onChange={() => {}} today={TODAY} />);
    expect(q('button.sf-datefield').textContent).toBe('12 Mar 1998');
  });
  test('opens on the chosen month with a Monday-first grid of 42 day buttons, the chosen day selected', () => {
    mount(<DatePicker label="From" value="2026-02-10" onChange={() => {}} today={TODAY} />);
    act(() => q<HTMLButtonElement>('button.sf-datefield').click());
    expect(qa('.sf-cal__wd').map((e) => e.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(qa('.sf-cal__day')).toHaveLength(42);
    expect(qa('.sf-cal__day--on').map((e) => e.getAttribute('aria-label'))).toEqual(['10 Feb 2026']);
  });
  test('tap a day, then Set: onChange gets the ISO day; Cancel changes nothing', () => {
    const got: string[] = [];
    mount(<DatePicker label="From" value="2026-02-10" onChange={(v) => got.push(v)} today={TODAY} />);
    act(() => q<HTMLButtonElement>('button.sf-datefield').click());
    act(() => qa('.sf-cal__day').find((b) => b.getAttribute('aria-label') === '14 Feb 2026')!.click());
    const set = qa('.sf-cal__actions button');
    expect(set[1]!.textContent).toBe('Set 14 Feb 2026');
    act(() => set[0]!.click()); // Cancel
    expect(got).toEqual([]);
    act(() => q<HTMLButtonElement>('button.sf-datefield').click());
    act(() => qa('.sf-cal__day').find((b) => b.getAttribute('aria-label') === '14 Feb 2026')!.click());
    act(() => qa('.sf-cal__actions button')[1]!.click());
    expect(got).toEqual(['2026-02-14']);
  });
  test('min and max disable the days outside them, and a disabled day cannot be chosen', () => {
    mount(<DatePicker label="To" value="2026-05-15" min="2026-05-10" max="2026-05-20" today={TODAY} onChange={() => {}} />);
    act(() => q<HTMLButtonElement>('button.sf-datefield').click());
    const by = (l: string) => qa('.sf-cal__day').find((b) => b.getAttribute('aria-label') === l)!;
    expect(by('9 May 2026').disabled).toBe(true);
    expect(by('10 May 2026').disabled).toBe(false);
    expect(by('20 May 2026').disabled).toBe(false);
    expect(by('21 May 2026').disabled).toBe(true);
  });
  test('changing the month keeps the day and caps it (31 Jan to Feb)', () => {
    mount(<DatePicker label="From" value="2026-01-31" onChange={() => {}} today={TODAY} />);
    act(() => q<HTMLButtonElement>('button.sf-datefield').click());
    const month = document.querySelectorAll<HTMLSelectElement>('.sf-cal__selects select')[0]!;
    act(() => { month.value = '2'; month.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(qa('.sf-cal__actions button')[1]!.textContent).toBe('Set 28 Feb 2026');
  });
  test('the year list is newest first and never leaves 1900..2100', () => {
    mount(<DatePicker label="Born" value="" yearFrom={1900} yearTo={2026} onChange={() => {}} today={TODAY} />);
    act(() => q<HTMLButtonElement>('button.sf-datefield').click());
    const years = Array.from(document.querySelectorAll<HTMLSelectElement>('.sf-cal__selects select')[1]!.options).map((o) => Number(o.value));
    expect(years[0]).toBe(2026);
    expect(years[years.length - 1]).toBe(1900);
    expect(years).toHaveLength(127);
  });
  test('month mode: no day grid, value is YYYY-MM', () => {
    const got: string[] = [];
    mount(<DatePicker mode="month" label="First" value="2025-03" yearFrom={2020} yearTo={2026} onChange={(v) => got.push(v)} today={TODAY} />);
    expect(q('button.sf-datefield').textContent).toBe('Mar 2025');
    act(() => q<HTMLButtonElement>('button.sf-datefield').click());
    expect(qa('.sf-cal__day')).toHaveLength(0);
    const month = document.querySelectorAll<HTMLSelectElement>('.sf-cal__selects select')[0]!;
    act(() => { month.value = '7'; month.dispatchEvent(new Event('change', { bubbles: true })); });
    act(() => qa('.sf-cal__actions button')[1]!.click());
    expect(got).toEqual(['2025-07']);
  });
  test('clearable shows Clear only when a value is set', () => {
    const got: string[] = [];
    mount(<DatePicker label="Deadline" value="" clearable onChange={(v) => got.push(v)} today={TODAY} />);
    expect(document.body.textContent).not.toContain('Clear date');
    mount(<DatePicker label="Deadline" value="2026-12-01" clearable onChange={(v) => got.push(v)} today={TODAY} />);
    const clear = qa('button').find((b) => b.textContent === 'Clear date')!;
    act(() => clear.click());
    expect(got).toEqual(['']);
  });
});

// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { ActionMenu, Button, Chip, IconButton, Input, Segmented, Toggle } from '../../src/ui/components';
import { applyUx } from '../../src/app/appearance';
import { DEFAULT_SWITCHES, allSwitches } from '../../src/shared/ux';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => render(null, host));
const premium = () => applyUx(DEFAULT_SWITCHES);
const classic = () => applyUx(allSwitches(false));
const q = <T extends Element = HTMLElement>(s: string) => host.querySelector(s) as T;
const abc = [{ value: 'a', label: 'Aa' }, { value: 'b', label: 'Bb' }, { value: 'c', label: 'Cc' }];
const abcd = [...abc, { value: 'd', label: 'Dd' }];
const mount = async (v: preact.VNode) => { await act(async () => { render(null, host); render(v, host); }); };

describe('Segmented', () => {
  test('premium: 3 options = segments with a thumb at the chosen index; keyboard and aria kept', async () => {
    premium();
    let v = 'b';
    await mount(<Segmented label="L" options={abc} value={v} onChange={(x) => (v = x)} />);
    expect(q('.sf-seg__thumb').getAttribute('style')?.replace(/\s/g, '')).toContain('--seg-i:1;--seg-n:3');
    expect(host.querySelectorAll('[role=radio]')).toHaveLength(3);
    expect(host.querySelectorAll('[role=radio][aria-checked=true]')).toHaveLength(1);
    await act(async () => { q('[role=radiogroup]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(v).toBe('c');
  });
  test('premium: 4+ options become a value row that opens a sheet list; keepSegments opts out', async () => {
    premium();
    let v = 'b';
    const draw = () => mount(<Segmented label="Level" options={abcd} value={v} onChange={(x) => { v = x; void draw(); }} />);
    await draw();
    expect(host.querySelector('.sf-seg')).toBeNull();
    expect(host.textContent).toContain('Bb');
    await act(async () => { q<HTMLButtonElement>('button.sf-row').click(); });
    const opts = Array.from(document.querySelectorAll('[role=radio]'));
    expect(opts.map((o) => o.textContent)).toEqual(['Aa', 'Bb', 'Cc', 'Dd']);
    await act(async () => { (opts[3] as HTMLButtonElement).click(); });
    expect(v).toBe('d');
    await mount(<Segmented label="Level" options={abcd} value="b" onChange={() => undefined} keepSegments />);
    expect(host.querySelectorAll('.sf-seg [role=radio]')).toHaveLength(4);
  });
  test('classic: always the old segments, no thumb, even with 4+ options', async () => {
    classic();
    await mount(<Segmented label="L" options={abcd} value="b" onChange={() => undefined} />);
    expect(host.querySelectorAll('.sf-seg [role=radio]')).toHaveLength(4);
    expect(host.querySelector('.sf-seg__thumb')).toBeNull();
  });
});

describe('Toggle', () => {
  test('both styles: same switch markup, role, aria-checked and keyboard-activatable button', async () => {
    for (const set of [premium, classic]) {
      set();
      let on = false;
      await mount(<Toggle label="Sound" checked={on} onChange={(n) => (on = n)} />);
      const s = q<HTMLButtonElement>('[role=switch]');
      expect(s.tagName).toBe('BUTTON');
      expect(s.getAttribute('aria-checked')).toBe('false');
      await act(async () => { s.click(); });
      expect(on).toBe(true);
    }
  });
});

describe('Chip', () => {
  test('premium: selected = aria-pressed + on class, no check glyph; classic keeps the check', async () => {
    premium();
    await mount(<Chip selected>Chest</Chip>);
    expect(q('.sf-chip').getAttribute('aria-pressed')).toBe('true');
    expect(q('.sf-chip').className).toContain('sf-chip--on');
    expect(host.querySelector('.sf-chip svg')).toBeNull();
    await act(async () => { render(null, host); });
    classic();
    await mount(<Chip selected>Chest</Chip>);
    expect(host.querySelector('.sf-chip svg')).not.toBeNull();
  });
  test('both styles: unselected chip has no check; an icon prop still shows', async () => {
    for (const set of [premium, classic]) {
      set();
      await mount(<Chip icon="plus">Add</Chip>);
      expect(host.querySelectorAll('.sf-chip svg')).toHaveLength(1);
    }
  });
});

describe('Input', () => {
  test('premium: floating label class, a blank placeholder to drive it, label still tied by for/id', async () => {
    premium();
    await mount(<Input label="Name" id="nm" {...{ value: '' }} onInput={() => undefined} />);
    expect(q('.sf-field').className).toContain('sf-field--float');
    expect(q<HTMLInputElement>('input').placeholder).toBe(' ');
    expect(q('label').getAttribute('for')).toBe('nm');
  });
  test('premium: a real placeholder or a search box does not float', async () => {
    premium();
    await mount(<Input label="Name" {...{ placeholder: 'Type', value: '' }} onInput={() => undefined} />);
    expect(q('.sf-field').className).not.toContain('sf-field--float');
    await mount(<Input label="Find" {...{ type: 'search', value: '' }} onInput={() => undefined} />);
    expect(q('.sf-field').className).not.toContain('sf-field--float');
  });
  test('premium: Cancel appears only while there is text, clears, and the input is never re-created', async () => {
    premium();
    const Box = () => {
      const [val, setVal] = useState('abc');
      return <Input label="Find" {...{ type: 'search', value: val }} onInput={() => undefined} onCancel={() => setVal('')} />;
    };
    await mount(<Box />);
    const input = q('input');
    expect(q('.sf-input__cancel').textContent).toBe('Cancel');
    await act(async () => { q<HTMLButtonElement>('.sf-input__cancel').click(); });
    expect(host.querySelector('.sf-input__cancel')).toBeNull();
    expect(q('input')).toBe(input);
  });
  test('classic: the plain field, no float, no Cancel', async () => {
    classic();
    await mount(<Input label="Find" {...{ value: 'abc' }} onInput={() => undefined} onCancel={() => undefined} />);
    expect(q('.sf-field').className).not.toContain('float');
    expect(host.querySelector('.sf-input__cancel')).toBeNull();
    expect(q<HTMLInputElement>('input').placeholder).toBe('');
  });
  test('the font size stays at least 16 px in the premium rules', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles/premium/controls.css'), 'utf8');
    const rule = css.match(/\.sf-field--float \.sf-field__label \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('font-size: var(--text-md)');
    expect(css).not.toMatch(/\.sf-input(:focus)? \{[^}]*font-size/);
  });
});

describe('Button and IconButton states', () => {
  test('loading blocks the press, sets aria-busy and the loading class (both styles); disabled blocks too', async () => {
    for (const set of [premium, classic]) {
      set();
      let n = 0;
      await mount(<><Button variant="primary" loading onPress={() => n++}>Go</Button><Button variant="danger" disabled onPress={() => n++}>No</Button><IconButton icon="x" label="X" loading onPress={() => n++} /></>);
      const [a, b, c] = Array.from(host.querySelectorAll('button')) as HTMLButtonElement[];
      await act(async () => { a!.click(); b!.click(); c!.click(); });
      expect(n).toBe(0);
      expect(a!.getAttribute('aria-busy')).toBe('true');
      expect(a!.className).toContain('sf-btn--loading');
      expect(c!.className).toContain('sf-iconbtn--loading');
      expect(b!.disabled).toBe(true);
    }
  });
  test('a normal button still presses and has no aria-busy', async () => {
    let n = 0;
    await mount(<Button onPress={() => n++}>Go</Button>);
    await act(async () => { q<HTMLButtonElement>('button').click(); });
    expect(n).toBe(1);
    expect(q('button').getAttribute('aria-busy')).toBeNull();
  });
  test('premium CSS has all four states for every kind', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles/premium/controls.css'), 'utf8');
    for (const s of ['.sf-btn--primary[data-pressed', '.sf-btn--secondary', '.sf-btn--danger', '.sf-iconbtn--secondary', '.sf-btn:disabled', '.sf-iconbtn:disabled', '.sf-btn--loading::before', '.sf-iconbtn--loading::before']) expect(css, s).toContain(s);
  });
});

describe('ActionMenu', () => {
  const items = (log: string[]) => [{ label: 'Add to go-tos', onPress: () => log.push('go') }, { label: 'Never show', onPress: () => log.push('never'), danger: true }];
  test('premium: one primary + a "..." button; the menu opens, an item runs and closes it', async () => {
    premium();
    const log: string[] = [];
    await mount(<ActionMenu primary={{ label: 'Add', onPress: () => log.push('add') }} items={items(log)} />);
    expect(host.querySelectorAll('.sf-btn--primary')).toHaveLength(1);
    const more = q<HTMLButtonElement>('button[aria-haspopup=menu]');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { more.click(); });
    expect(q('[role=menu]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('[role=menuitem]')).map((e) => e.textContent)).toEqual(['Add to go-tos', 'Never show']);
    await act(async () => { (host.querySelectorAll('[role=menuitem]')[1] as HTMLButtonElement).click(); });
    expect(log).toEqual(['never']);
    expect(host.querySelector('[role=menu]')).toBeNull();
  });
  test('premium: Escape and an outside press close it', async () => {
    premium();
    await mount(<ActionMenu primary={{ label: 'Add', onPress: () => undefined }} items={items([])} />);
    await act(async () => { q<HTMLButtonElement>('button[aria-haspopup=menu]').click(); });
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(host.querySelector('[role=menu]')).toBeNull();
    await act(async () => { q<HTMLButtonElement>('button[aria-haspopup=menu]').click(); });
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(host.querySelector('[role=menu]')).toBeNull();
  });
  test('classic: every action is its own button, no popover', async () => {
    classic();
    await mount(<ActionMenu primary={{ label: 'Add', onPress: () => undefined }} items={items([])} />);
    expect(Array.from(host.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Add', 'Add to go-tos', 'Never show']);
    expect(host.querySelector('[aria-haspopup]')).toBeNull();
  });
});

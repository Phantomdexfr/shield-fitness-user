// @vitest-environment happy-dom
// Phase 83: the button and control kit, Collapsible, and the guard that no naked-text button or plain link row remains.
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CollapseAll, Collapsible, ChoiceRow, NumberRow, Row, RowGroup, Switch, resetSectionsForTest } from '../../src/ui/components';
import { loadSections } from '../../src/data/repos/uiSections';

const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
};
const SRC = walk(join(__dirname, '../../src'));

describe('guard: no naked-text button, no plain link row (drives the 67 old ghost call sites to zero)', () => {
  const find = (re: RegExp) => SRC.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/^.*\/src\//, 'src/'));
  test('no variant="ghost" call site', () => expect(find(/variant=["{']+ghost/)).toEqual([]));
  test('no ghost css (button or icon button)', () => expect(find(/sf-(btn|iconbtn)--ghost/)).toEqual([]));
  test('no plain-link row classes', () => expect(find(/sf-(lab|lib|pr)__link/)).toEqual([]));
  test("ButtonVariant has exactly primary, secondary and danger", () => {
    expect(readFileSync(join(__dirname, '../../src/ui/components/Button.tsx'), 'utf8')).toContain("export type ButtonVariant = 'primary' | 'secondary' | 'danger';");
  });
  test('primary has no gradient and no glow', () => {
    const css = readFileSync(join(__dirname, '../../src/ui/styles/components.css'), 'utf8');
    const block = /\.sf-btn--primary \{[^}]*\}/.exec(css)![0];
    expect(block).not.toMatch(/gradient|glow|gold-metal|box-shadow/);
  });
});

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  resetSectionsForTest();
});
afterEach(() => act(() => render(null, root)));
const mount = (v: preact.ComponentChild) => act(() => render(v, root));
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 40)));
const q = <T extends Element>(sel: string, from: ParentNode = document) => from.querySelector(sel) as T;

describe('Collapsible', () => {
  test('a real button with aria-expanded; tap opens and closes; closed content is not rendered', async () => {
    mount(<Collapsible id="a" page="t1" title="Setups" summary="3 setups">body A</Collapsible>);
    await flush();
    const bar = q<HTMLButtonElement>('button.sf-sec__bar');
    expect(bar.tagName).toBe('BUTTON');
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    expect(root.textContent).not.toContain('body A');
    expect(root.textContent).toContain('3 setups');
    act(() => bar.click());
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(root.textContent).toContain('body A');
    act(() => bar.click());
    expect(bar.getAttribute('aria-expanded')).toBe('false');
  });
  test('defaultOpen is used until the person chooses, and the choice is remembered per page after a restart', async () => {
    mount(<Collapsible id="a" page="t2" title="T" defaultOpen>x</Collapsible>);
    await flush();
    expect(q('button.sf-sec__bar').getAttribute('aria-expanded')).toBe('true');
    act(() => q<HTMLButtonElement>('button.sf-sec__bar').click());
    await flush();
    expect((await loadSections())['t2:a']).toBe(false);
    act(() => render(null, root));
    resetSectionsForTest(); // simulates the app being killed and reopened
    mount(<Collapsible id="a" page="t2" title="T" defaultOpen>x</Collapsible>);
    await flush();
    expect(q('button.sf-sec__bar').getAttribute('aria-expanded')).toBe('false');
    // another page with the same section id is unaffected
    act(() => render(null, root));
    mount(<Collapsible id="a" page="other" title="T" defaultOpen>x</Collapsible>);
    await flush();
    expect(q('button.sf-sec__bar').getAttribute('aria-expanded')).toBe('true');
  });
  test('Collapse all / Expand all appears at 4 sections and not at 3', async () => {
    const page = (n: number) => (
      <div>
        <CollapseAll page="t3" />
        {Array.from({ length: n }, (_, i) => <Collapsible key={i} id={`s${i}`} page="t3" title={`S${i}`} defaultOpen>b{i}</Collapsible>)}
      </div>
    );
    mount(page(3));
    await flush();
    expect(q('.sf-sec__all')).toBeNull();
    act(() => render(null, root));
    resetSectionsForTest();
    mount(page(4));
    await flush();
    const all = q<HTMLButtonElement>('.sf-sec__all');
    expect(all.textContent).toBe('Collapse all');
    act(() => all.click());
    expect(Array.from(document.querySelectorAll('.sf-sec__bar')).every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(q('.sf-sec__all').textContent).toBe('Expand all');
  });
});

describe('Row, RowGroup, Switch, ChoiceRow, NumberRow', () => {
  test('a pressable row is a button with label and value; a group draws one box', () => {
    let n = 0;
    mount(<RowGroup label="Group"><Row label="Units" value="kg" onPress={() => n++} /><Row label="Plain" /></RowGroup>);
    expect(q('.sf-rowgroup__label').textContent).toBe('Group');
    const b = q<HTMLButtonElement>('button.sf-row');
    expect(b.textContent).toContain('Units');
    expect(b.textContent).toContain('kg');
    act(() => b.click());
    expect(n).toBe(1);
    expect(document.querySelectorAll('.sf-rowgroup__box').length).toBe(1);
  });
  test('Switch is role=switch with aria-checked and flips', () => {
    let v = false;
    const draw = () => mount(<Switch checked={v} label="Sound" onChange={(x) => { v = x; draw(); }} />);
    draw();
    const s = q<HTMLButtonElement>('[role=switch]');
    expect(s.getAttribute('aria-checked')).toBe('false');
    act(() => s.click());
    expect(q('[role=switch]').getAttribute('aria-checked')).toBe('true');
    expect(q('[role=switch]').className).toContain('sf-switch--on');
  });
  test('ChoiceRow shows the value, opens a sheet list, picks one and closes', () => {
    let v = 'b';
    const draw = () => mount(<ChoiceRow label="Level" value={v} options={[{ value: 'a', label: 'Aa' }, { value: 'b', label: 'Bb' }, { value: 'c', label: 'Cc' }, { value: 'd', label: 'Dd' }]} onChange={(x) => { v = x; draw(); }} />);
    draw();
    expect(root.textContent).toContain('Bb');
    act(() => q<HTMLButtonElement>('button.sf-row').click());
    const opts = Array.from(document.querySelectorAll('[role=radio]'));
    expect(opts.map((o) => o.textContent)).toEqual(['Aa', 'Bb', 'Cc', 'Dd']);
    expect(opts[1]!.getAttribute('aria-checked')).toBe('true');
    act(() => (opts[3] as HTMLButtonElement).click());
    expect(v).toBe('d');
    expect(document.querySelectorAll('[role=radio]').length).toBe(0);
  });
  test('NumberRow opens a stepper sheet, clamps to the range and applies only on Done', () => {
    let v = 5;
    const draw = () => mount(<NumberRow label="Rest" value={v} min={0} max={6} format={(n) => `${n} s`} onChange={(x) => { v = x; draw(); }} />);
    draw();
    expect(root.textContent).toContain('5 s');
    act(() => q<HTMLButtonElement>('button.sf-row').click());
    const plus = document.querySelector('[aria-label="Increase"]') as HTMLButtonElement;
    act(() => plus.click());
    act(() => (document.querySelector('[aria-label="Increase"]') as HTMLButtonElement).click());
    expect(document.querySelector('output')!.textContent).toBe('6 s'); // clamped at max
    expect(v).toBe(5); // not applied yet
    const done = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Done') as HTMLButtonElement;
    act(() => done.click());
    expect(v).toBe(6);
  });
});

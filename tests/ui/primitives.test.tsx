// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { render, type ComponentChild } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  Avatar, Badge, Button, Card, Chip, Dialog, EmptyState, Icon, IconButton, Input, PhotoFrame, ProgressBar,
  ProgressRing, Segmented, Sheet, Skeleton, Stepper, SubPageHeader, Tabs, ToastHost, Toggle,
  initialsOf, staggerDelay, toastStore, showToast,
} from '../../src/ui/components';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  toastStore.clear();
});
afterEach(() => {
  act(() => render(null, root));
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'vibrate');
});

const mount = (v: ComponentChild) => {
  act(() => render(v, root));
  return root;
};
const click = (el: Element | null) => {
  expect(el).not.toBeNull();
  act(() => (el as HTMLElement).click());
};
const q = (sel: string) => root.querySelector(sel);
const qa = (sel: string) => [...root.querySelectorAll(sel)];
const key = (el: Element, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })));

describe('press', () => {
  test('Button renders, press fires once, disabled does not fire', () => {
    const onPress = vi.fn();
    mount(<Button onPress={onPress}>Start</Button>);
    expect(q('button')?.textContent).toBe('Start');
    click(q('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    mount(<Button disabled onPress={onPress}>Start</Button>);
    click(q('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('pointer down marks pressed, pointer up clears it', () => {
    mount(<Button>Go</Button>);
    const b = q('button') as HTMLElement;
    act(() => void b.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(b.getAttribute('data-pressed')).toBe('true');
    act(() => void b.dispatchEvent(new Event('pointerup', { bubbles: true })));
    expect(b.getAttribute('data-pressed')).toBeNull();
  });

  test('haptic tick (8 ms) when the Vibration API exists; no error without it', () => {
    mount(<Button>Go</Button>);
    click(q('button')); // no vibrate: must not throw
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    click(q('button'));
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  test('IconButton has an accessible name; Icon is decorative unless labelled', () => {
    mount(<IconButton icon="x" label="Close" />);
    expect(q('button')?.getAttribute('aria-label')).toBe('Close');
    mount(<Icon name="check" />);
    expect(q('svg')?.getAttribute('aria-hidden')).toBe('true');
    mount(<Icon name="check" label="Done" />);
    expect(q('svg')?.getAttribute('role')).toBe('img');
  });
});

describe('long text wraps, nothing truncates', () => {
  const LONG = 'Supercalifragilisticexpialidocious'.repeat(6) + ' and then some more words '.repeat(8);
  const trees: Array<[string, ComponentChild]> = [
    ['Button', <Button>{LONG}</Button>],
    ['Chip', <Chip>{LONG}</Chip>],
    ['Badge', <Badge>{LONG}</Badge>],
    ['Card', <Card>{LONG}</Card>],
    ['EmptyState', <EmptyState title={LONG} hint={LONG} actionLabel="Go" onAction={() => {}} />],
    ['Toggle', <Toggle checked={false} onChange={() => {}} label={LONG} hint={LONG} />],
    ['Segmented', <Segmented options={[{ value: 'a', label: LONG }, { value: 'b', label: 'B' }]} value="a" onChange={() => {}} />],
    ['Tabs', <Tabs items={[{ value: 'a', label: LONG }]} active="a" onChange={() => {}} />],
    ['SubPageHeader', <SubPageHeader title={LONG} onBack={() => {}} />],
    ['Input', <Input label={LONG} hint={LONG} />],
    ['Stepper', <Stepper label="w" value={1} onChange={() => {}} format={() => LONG} />],
  ];
  test.each(trees)('%s keeps the full text and has no truncation classes', (_n, tree) => {
    mount(tree);
    expect(root.textContent).toContain(LONG.trim());
    for (const el of qa('*')) expect(el.getAttribute('class') ?? '').not.toMatch(/truncate|ellipsis|line-clamp/);
  });

  test('component CSS never forbids wrapping or truncates', () => {
    const css = readFileSync('src/ui/styles/components.css', 'utf8');
    expect(css).not.toMatch(/nowrap|text-overflow|line-clamp/);
  });
});

describe('form controls', () => {
  test('Stepper rounds to 2 dp (0.1 + 0.2), clamps, and disables at the ends', () => {
    const onChange = vi.fn();
    mount(<Stepper label="Weight" value={0.1} step={0.2} min={0} max={0.3} onChange={onChange} />);
    click(qa('button')[1] as Element);
    expect(onChange).toHaveBeenLastCalledWith(0.3);
    mount(<Stepper label="Weight" value={0} min={0} onChange={onChange} />);
    expect((qa('button')[0] as HTMLButtonElement).disabled).toBe(true);
    expect(q('[role=group]')?.getAttribute('aria-label')).toBe('Weight');
  });

  test('Toggle is a switch and reports the next value', () => {
    const onChange = vi.fn();
    mount(<Toggle checked={false} onChange={onChange} label="Rest-day hints" />);
    const sw = q('[role=switch]') as HTMLElement;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('Segmented selects by tap and by arrow keys; Tabs expose aria-selected', () => {
    const onChange = vi.fn();
    mount(<Segmented label="Unit" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} value="a" onChange={onChange} />);
    click(qa('[role=radio]')[1] as Element);
    expect(onChange).toHaveBeenLastCalledWith('b');
    key(q('[role=radiogroup]') as Element, 'ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('b');
    const onTab = vi.fn();
    mount(<Tabs items={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }]} active="x" onChange={onTab} />);
    expect(qa('[role=tab]').map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    click(qa('[role=tab]')[1] as Element);
    expect(onTab).toHaveBeenCalledWith('y');
  });

  test('Input label is bound to the control; error sets aria-invalid', () => {
    mount(<Input label="Name" error="Required" />);
    const input = q('input') as HTMLInputElement;
    expect(q('label')?.getAttribute('for')).toBe(input.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(q('[role=alert]')?.textContent).toBe('Required');
  });
});

describe('overlays and toasts', () => {
  test('Sheet: closed renders nothing; Escape, backdrop and close button close it; content click does not', () => {
    const onClose = vi.fn();
    mount(<Sheet open={false} onClose={onClose} title="Pick" />);
    expect(q('[role=dialog]')).toBeNull();
    mount(<Sheet open onClose={onClose} title="Pick">body</Sheet>);
    expect(q('[role=dialog]')?.getAttribute('aria-modal')).toBe('true');
    expect(document.documentElement.classList.contains('sf-scroll-lock')).toBe(true);
    click(q('.sf-sheet__body'));
    expect(onClose).not.toHaveBeenCalled();
    key(document.body, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    click(q('.sf-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
    click(q('[aria-label=Close]'));
    expect(onClose).toHaveBeenCalledTimes(3);
    mount(<Sheet open={false} onClose={onClose} title="Pick" />);
    expect(document.documentElement.classList.contains('sf-scroll-lock')).toBe(false);
  });

  test('Dialog: confirm and cancel call their handlers', () => {
    const ok = vi.fn();
    const no = vi.fn();
    mount(<Dialog open title="Delete?" message="This cannot be undone." danger onConfirm={ok} onCancel={no} confirmLabel="Delete" />);
    expect(q('.sf-btn--danger')?.textContent).toBe('Delete');
    click(q('.sf-btn--danger'));
    click(q('.sf-btn--secondary'));
    expect(ok).toHaveBeenCalledTimes(1);
    expect(no).toHaveBeenCalledTimes(1);
  });

  test('Toast host shows a toast, dismiss button removes it, timeout removes it', () => {
    vi.useFakeTimers();
    mount(<ToastHost />);
    act(() => void showToast('Saved', { tone: 'ok' }));
    expect(q('.sf-toast')?.textContent).toContain('Saved');
    expect(q('.sf-toast--ok')).not.toBeNull();
    click(q('.sf-toast [aria-label=Dismiss]'));
    expect(q('.sf-toast')).toBeNull();
    act(() => void showToast('Gone soon', { durationMs: 1000 }));
    expect(qa('.sf-toast')).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(1001));
    expect(qa('.sf-toast')).toHaveLength(0);
  });
});

describe('display primitives', () => {
  test('PhotoFrame: lazy 4:3 image, placeholder when missing or when loading fails', () => {
    mount(<PhotoFrame src="/machines/a.webp" alt="Leg press" />);
    const img = q('img') as HTMLImageElement;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('alt')).toBe('Leg press');
    act(() => void img.dispatchEvent(new Event('error')));
    expect(q('img')).toBeNull();
    expect(q('.sf-photo--missing')?.getAttribute('aria-label')).toBe('Leg press');
    mount(<PhotoFrame alt="No photo" />);
    expect(q('.sf-photo--missing')).not.toBeNull();
  });

  test('Avatar initials', () => {
    expect(initialsOf('asha rao')).toBe('AR');
    expect(initialsOf('Madonna')).toBe('M');
    expect(initialsOf('  ')).toBe('?');
    mount(<Avatar name="Ravi Kumar" />);
    expect(q('.sf-avatar')?.textContent).toBe('RK');
  });

  test('Progress ring and bar clamp to 0..100', () => {
    mount(<ProgressRing label="Goal" value={1.7}>7</ProgressRing>);
    expect(q('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('100');
    mount(<ProgressRing label="Goal" value={Number.NaN} />);
    expect(q('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('0');
    mount(<ProgressBar label="Volume" value={0.456} />);
    expect(q('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('46');
  });

  test('EmptyState shows one action; SubPageHeader back fires; Skeleton is hidden from AT; Card with onPress is a button', () => {
    const act1 = vi.fn();
    mount(<EmptyState title="No sessions" hint="Start one." actionLabel="Start" onAction={act1} />);
    expect(qa('button')).toHaveLength(1);
    click(q('button'));
    expect(act1).toHaveBeenCalled();
    const back = vi.fn();
    mount(<SubPageHeader title="Training" onBack={back} />);
    click(q('[aria-label=Back]'));
    expect(back).toHaveBeenCalled();
    expect(q('h1')?.textContent).toBe('Training');
    mount(<Skeleton />);
    expect(q('.sf-skeleton')?.getAttribute('aria-hidden')).toBe('true');
    const press = vi.fn();
    mount(<Card onPress={press}>Whole card</Card>);
    click(q('button.sf-card'));
    expect(press).toHaveBeenCalled();
  });

  test('list stagger: first 8 items only, none under reduced motion', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBeGreaterThan(0);
    expect(staggerDelay(8)).toBe(0);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(staggerDelay(3)).toBe(0);
    vi.unstubAllGlobals();
  });
});

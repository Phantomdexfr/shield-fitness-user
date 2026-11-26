import type { JSX } from 'preact';
import { useUx } from '../useUx';
import { Pressable } from './Pressable';
import { ChoiceRow } from './Rows';
import { cx } from './util';

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** Arrow keys move the selection (roving) for Segmented and Tabs. */
function onArrows<T extends string>(e: JSX.TargetedKeyboardEvent<HTMLElement>, options: Option<T>[], value: T, pick: (v: T) => void) {
  const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!dir || options.length === 0) return;
  e.preventDefault();
  const i = options.findIndex((o) => o.value === value);
  const next = options[(i + dir + options.length) % options.length];
  if (next) pick(next.value);
}

export interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  class?: string;
  /** Premium only: keep 4+ options as segments (for view switches that are actions, not a stored value). */
  keepSegments?: boolean;
}

/** Few mutually exclusive choices, equal width, labels wrap. Premium (ux.controls): a sliding gold thumb; 4 or more options become a value row that opens a sheet list. */
export function Segmented<T extends string>({ options, value, onChange, label, class: cls, keepSegments }: SegmentedProps<T>) {
  const ux = useUx('controls');
  const premium = ux === 'premium';
  if (premium && options.length >= 4 && !keepSegments) return <ChoiceRow label={label ?? ''} value={value} options={options} onChange={onChange} />;
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      class={cx('sf-seg', cls)}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => onArrows(e, options, value, onChange)}
    >
      {premium && index >= 0 && <span class="sf-seg__thumb" aria-hidden="true" style={`--seg-i:${index};--seg-n:${options.length}`} />}
      {options.map((o) => (
        <Pressable
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          class={cx('sf-seg__item', o.value === value && 'sf-seg__item--on')}
          onPress={() => onChange(o.value)}
        >
          <span class="sf-seg__label">{o.label}</span>
        </Pressable>
      ))}
    </div>
  );
}

export interface TabsProps<T extends string> {
  items: Option<T>[];
  active: T;
  onChange: (id: T) => void;
  label?: string;
  class?: string;
}

/** Tab row. The consumer renders the panel (give it id `panel-<id>`). */
export function Tabs<T extends string>({ items, active, onChange, label, class: cls }: TabsProps<T>) {
  return (
    <div class={cx('sf-tabs', cls)} role="tablist" aria-label={label} onKeyDown={(e) => onArrows(e, items, active, onChange)}>
      {items.map((t) => (
        <Pressable
          key={t.value}
          role="tab"
          id={`tab-${t.value}`}
          aria-selected={t.value === active}
          aria-controls={`panel-${t.value}`}
          tabIndex={t.value === active ? 0 : -1}
          class={cx('sf-tabs__item', t.value === active && 'sf-tabs__item--on')}
          onPress={() => onChange(t.value)}
        >
          <span class="sf-tabs__label">{t.label}</span>
        </Pressable>
      ))}
    </div>
  );
}

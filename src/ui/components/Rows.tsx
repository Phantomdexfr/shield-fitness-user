// Phase 83: rows and controls of the new kit (docs/UX_REDESIGN_PLAN.md section 2). A row is a 52 px line inside a bordered group:
// label left, value or chevron right. It replaces every borderless "ghost" text button and plain link row.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { t } from '../../i18n';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Sheet } from './Overlay';
import { Stepper } from './Form';
import { Button } from './Button';
import { cx } from './util';

export interface RowProps {
  /** Left text. Omit and pass children to draw custom content (it still wraps, never truncates). */
  label?: string;
  hint?: string;
  /** Right text. */
  value?: string;
  /** A route: the row is a link with a chevron. */
  href?: string;
  /** A tap action: the row is a button (chevron when `chevron` is not false). */
  onPress?: (e: Event) => void;
  /** Right-side control (a Switch, say). No chevron is drawn. */
  trailing?: ComponentChildren;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
  class?: string;
  'aria-label'?: string;
  children?: ComponentChildren;
}

export function Row({ label, hint, value, href, onPress, trailing, chevron, danger, disabled, class: cls, children, ...rest }: RowProps) {
  const showChev = chevron ?? (!trailing && (href !== undefined || onPress !== undefined));
  const body = (
    <>
      <span class="sf-row__main">
        {label !== undefined && <span class="sf-row__label">{label}</span>}
        {hint && <span class="sf-row__hint">{hint}</span>}
        {children}
      </span>
      {value !== undefined && <span class="sf-row__value">{value}</span>}
      {trailing}
      {showChev && <Icon name="caret-right" size={20} class="sf-row__chev" />}
    </>
  );
  const klass = cx('sf-row', danger && 'sf-row--danger', cls);
  if (href !== undefined) {
    return (
      <Link href={href} class={cx(klass, 'sf-press')} aria-label={rest['aria-label']}>
        {body}
      </Link>
    );
  }
  if (onPress) {
    return (
      <Pressable class={klass} onPress={onPress} disabled={disabled} aria-label={rest['aria-label']}>
        {body}
      </Pressable>
    );
  }
  return <div class={klass}>{body}</div>;
}

/** Rows share one bordered group (radius 14-16, 1 px line, hairlines between rows). An optional 12 px uppercase section label sits above. */
export function RowGroup({ label, class: cls, children }: { label?: string; class?: string; children?: ComponentChildren }) {
  return (
    <div class={cx('sf-rowgroup', cls)}>
      {label && <p class="sf-rowgroup__label">{label}</p>}
      <div class="sf-rowgroup__box">{children}</div>
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name (the visible text is the row's label). */
  label: string;
  disabled?: boolean;
}

/** On/off with a clear on state (gold track). Put it in a Row's `trailing`, or use it alone. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <Pressable role="switch" aria-checked={checked} aria-label={label} disabled={disabled} class={cx('sf-switch', checked && 'sf-switch--on')} onPress={() => onChange(!checked)}>
      <span class="sf-switch__thumb" />
    </Pressable>
  );
}

export interface ChoiceRowProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  /** Sheet title (default: the row label). */
  title?: string;
  disabled?: boolean;
}

/** 4 or more options: a row showing the chosen value; a tap opens a bottom sheet list. (2 options = Segmented, 3 = Segmented.) */
export function ChoiceRow<T extends string>({ label, value, options, onChange, title, disabled }: ChoiceRowProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <>
      <Row label={label} value={current} onPress={() => setOpen(true)} disabled={disabled} aria-label={`${label}: ${current}`} />
      <Sheet open={open} onClose={() => setOpen(false)} title={title ?? label}>
        <div class="sf-choice" role="radiogroup" aria-label={label}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              role="radio"
              aria-checked={o.value === value}
              class={cx('sf-row', 'sf-choice__opt', o.value === value && 'sf-choice__opt--on')}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span class="sf-row__main"><span class="sf-row__label">{o.label}</span></span>
              {o.value === value && <Icon name="check" size={20} class="sf-row__chev" />}
            </Pressable>
          ))}
        </div>
      </Sheet>
    </>
  );
}

export interface NumberRowProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Text for a value, e.g. (v) => `${v} kg`. */
  format?: (v: number) => string;
  title?: string;
  disabled?: boolean;
  /** Row text while no value is chosen yet (the sheet still opens on `value`). Omit once a value exists. */
  empty?: string;
}

/** A number with a sane range: a row showing it; a tap opens a sheet with a stepper (never a free text box). The change applies on Done. */
export function NumberRow({ label, value, onChange, min, max, step = 1, format = String, title, disabled, empty }: NumberRowProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const show = () => {
    setDraft(Math.min(max, Math.max(min, value)));
    setOpen(true);
  };
  return (
    <>
      <Row label={label} value={empty ?? format(value)} onPress={show} disabled={disabled} aria-label={`${label}: ${empty ?? format(value)}`} />
      <Sheet open={open} onClose={() => setOpen(false)} title={title ?? label}>
        <div class="sf-numrow">
          <Stepper label={label} value={draft} onChange={setDraft} min={min} max={max} step={step} format={format} />
          <div class="sf-numrow__actions">
            <Button variant="secondary" onPress={() => setOpen(false)}>{t('ui.cancel')}</Button>
            <Button onPress={() => { onChange(draft); setOpen(false); }}>{t('ui.done')}</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

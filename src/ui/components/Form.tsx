import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';
import { useUx } from '../useUx';
import { IconButton } from './Button';
import { LABELS } from './labels';
import { Pressable } from './Pressable';
import { cx } from './util';

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  class?: string;
  /** Phase 113 (Tidy layout): omit the visible label; the control keeps it as aria-label. */
  hideLabel?: boolean;
  children?: ComponentChildren;
}

/** Label + control + hint/error. Text wraps. */
export function Field({ id, label, hint, error, class: cls, hideLabel, children }: FieldProps) {
  return (
    <div class={cx('sf-field', error && 'sf-field--error', cls)}>
      {!hideLabel && (
        <label class="sf-field__label" for={id}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p class="sf-field__error" id={`${id}-msg`} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p class="sf-field__hint" id={`${id}-msg`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export type InputProps = Omit<JSX.HTMLAttributes<HTMLInputElement>, 'class' | 'className' | 'label'> & {
  label: string;
  hint?: string;
  error?: string;
  class?: string;
  /** Premium search: a Cancel button inside the field while it has text. Calls this to clear. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Phase 113 (Tidy layout): no visible label above the box (aria-label keeps it). */
  hideLabel?: boolean;
};

/** Premium (ux.controls): the label floats up inside the field (only when there is no placeholder and it is not a search box); gold focus ring; 16 px text kept for iOS. */
export function Input({ label, hint, error, id, class: cls, onCancel, cancelLabel = LABELS.cancel, hideLabel, ...rest }: InputProps) {
  const auto = useId();
  const premium = useUx('controls') === 'premium';
  const fid = typeof id === 'string' ? id : auto;
  const attrs = rest as { placeholder?: string; type?: string; value?: unknown };
  const float = premium && !attrs.placeholder && attrs.type !== 'search';
  const withCancel = premium && onCancel !== undefined;
  const input = (
    <input
      {...rest}
      {...(float ? { placeholder: ' ' } : {})}
      id={fid}
      {...(hideLabel ? { 'aria-label': label } : {})}
      class={cx('sf-input', withCancel && 'sf-input--cancel', cls)}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error || hint ? `${fid}-msg` : undefined}
    />
  );
  return (
    <Field id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} class={float ? 'sf-field--float' : undefined}>
      {withCancel ? (
        <div class="sf-input-wrap">
          {input}
          {String(attrs.value ?? '') !== '' && (
            <button type="button" class="sf-input__cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
        </div>
      ) : (
        input
      )}
    </Field>
  );
}

export interface SelectProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  hint?: string;
  error?: string;
  id?: string;
  class?: string;
}

/** Native <select> (best on phones), styled. */
export function Select<T extends string>({ label, options, value, onChange, hint, error, id, class: cls }: SelectProps<T>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error}>
      <select
        id={fid}
        class={cx('sf-input', 'sf-select', cls)}
        value={value}
        onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value as T)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Visible label; the whole row is the 44 px target. */
  label: string;
  hint?: string;
  disabled?: boolean;
  class?: string;
}

export function Toggle({ checked, onChange, label, hint, disabled, class: cls }: ToggleProps) {
  return (
    <Pressable
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      class={cx('sf-toggle', checked && 'sf-toggle--on', cls)}
      onPress={() => onChange(!checked)}
    >
      <span class="sf-toggle__text">
        <span class="sf-toggle__label">{label}</span>
        {hint && <span class="sf-toggle__hint">{hint}</span>}
      </span>
      <span class="sf-toggle__track" aria-hidden="true">
        <span class="sf-toggle__thumb" />
      </span>
    </Pressable>
  );
}

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Display text for the value, e.g. (v) => `${v} kg`. */
  format?: (v: number) => string;
  /** Accessible name of the whole control. */
  label: string;
  decreaseLabel?: string;
  increaseLabel?: string;
  class?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** [-] value [+] for one-handed logging. Result is clamped and rounded to 2 dp (no 0.1 + 0.2 artefacts). */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  format = String,
  label,
  decreaseLabel = LABELS.decrease,
  increaseLabel = LABELS.increase,
  class: cls,
}: StepperProps) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, round2(n))));
  return (
    <div class={cx('sf-stepper', cls)} role="group" aria-label={label}>
      <IconButton icon="minus" label={decreaseLabel} variant="secondary" disabled={value <= min} onPress={() => set(value - step)} />
      <output class="sf-stepper__value" aria-live="polite">
        {format(value)}
      </output>
      <IconButton icon="plus" label={increaseLabel} variant="secondary" disabled={value >= max} onPress={() => set(value + step)} />
    </div>
  );
}

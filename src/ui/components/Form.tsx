import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';
import { IconButton } from './Button';
import { LABELS } from './labels';
import { Pressable } from './Pressable';
import { cx } from './util';

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children?: ComponentChildren;
}

/** Label + control + hint/error. Text wraps. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div class={cx('sf-field', error && 'sf-field--error')}>
      <label class="sf-field__label" for={id}>
        {label}
      </label>
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
};

export function Input({ label, hint, error, id, class: cls, ...rest }: InputProps) {
  const auto = useId();
  const fid = typeof id === 'string' ? id : auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error}>
      <input
        {...rest}
        id={fid}
        class={cx('sf-input', cls)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
      />
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

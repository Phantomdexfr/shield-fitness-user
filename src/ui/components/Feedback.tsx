import type { ComponentChildren } from 'preact';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { cx } from './util';

export interface SkeletonProps {
  width?: string;
  height?: string;
  radius?: string;
  class?: string;
}

/** Placeholder block for anything that may take > 150 ms (never a spinner over a blank screen). */
export function Skeleton({ width = '100%', height = '1rem', radius, class: cls }: SkeletonProps) {
  return <span class={cx('sf-skeleton', cls)} aria-hidden="true" style={{ width, height, borderRadius: radius }} />;
}

export function SkeletonText({ lines = 3, class: cls }: { lines?: number; class?: string }) {
  return (
    <div class={cx('sf-skeleton-text', cls)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** One line saying what to do next. */
  hint?: string;
  actionLabel?: string;
  onAction?: (e: Event) => void;
}

/** What to do next, in one line, with one gold button. */
export function EmptyState({ icon = 'barbell', title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div class="sf-empty">
      <span class="sf-empty__icon">
        <Icon name={icon} size={32} />
      </span>
      <h2 class="sf-empty__title">{title}</h2>
      {hint && <p class="sf-empty__hint">{hint}</p>}
      {actionLabel && onAction && <Button onPress={onAction}>{actionLabel}</Button>}
    </div>
  );
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  /** Accessible name, e.g. "Weekly goal". */
  label: string;
  /** Centre content (a number, a short label). */
  children?: ComponentChildren;
  class?: string;
}

export function ProgressRing({ value, size = 72, stroke = 7, label, children, class: cls }: ProgressRingProps) {
  const v = clamp01(value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      class={cx('sf-ring', cls)}
      style={{ width: `${size}px`, height: `${size}px` }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle class="sf-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" stroke-width={stroke} />
        <circle
          class="sf-ring__bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children !== undefined && <div class="sf-ring__centre">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, label, class: cls }: { value: number; label: string; class?: string }) {
  const v = clamp01(value);
  return (
    <div class={cx('sf-bar', cls)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <span class="sf-bar__fill" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

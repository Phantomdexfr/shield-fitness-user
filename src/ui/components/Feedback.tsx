import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { currentUx } from '../useUx';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { PULL, claimPlay, fxPlays, pullDistance, pullIsVertical, pullMayStart, pullRelease, pullState, type PullState } from './motion';
import { cx } from './util';

const rootMotion = (): string | null => (typeof document === 'undefined' ? null : document.documentElement.getAttribute('data-motion'));
const viewPath = (): string => (typeof location === 'undefined' ? '' : location.pathname);

/** Does a first-reveal animation (count-up, draw-in) play for this piece of UI right now? Decided ONCE when it first shows data (not while
 *  `defer` is true, for example `loading`), so a later re-render never replays it. Premium: the in-app Motion setting also wins, and each
 *  (page, key) plays once per visit. Classic: unchanged (the phone's setting only). */
export function useFx(key: string, enabled = true, defer = false): boolean {
  const decided = useRef<boolean | null>(null);
  if (decided.current === null && !defer) {
    const style = currentUx('motion');
    decided.current = enabled && fxPlays(style, rootMotion()) && (style === 'classic' || claimPlay(viewPath(), key));
  }
  return decided.current ?? false;
}

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

/** Set-complete mark (Premium): a gold tick that draws itself once on a set that was just logged. Renders nothing in Classic or without motion. */
export function SetCheck() {
  const on = currentUx('motion') === 'premium' && fxPlays('premium', rootMotion());
  if (!on) return null;
  return (
    <span class="sf-fx-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1" />
      </svg>
    </span>
  );
}

/** The restrained PR moment (Premium): a small gold "PR" mark with one soft glow, once. No confetti. Classic shows nothing (its look is frozen);
 *  with Motion Reduced the mark stays but does not glow. */
export function PrMark({ replay }: { replay?: number }) {
  if (currentUx('motion') !== 'premium') return null;
  const on = fxPlays('premium', rootMotion());
  return (
    <span class={cx('sf-fx-pr', on && 'sf-fx-pr--glow')} key={replay} aria-label={t('fx.pr.aria')}>
      {t('fx.pr')}
    </span>
  );
}

const PULL_DONE_MS = 900;

/** Pull-to-refresh for a data page (Premium only; Classic and Reduced Motion render the children as they are). Touch only: with the page at the
 *  very top, pull down, let go past the line and `onRefresh` runs; a pill shows the state (the sync pill's job here). The page never scrolls
 *  sideways and the browser's own pull is held back while this is mounted. */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children?: ComponentChildren }) {
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const live = useRef({ busy: false, x: 0, y: 0, active: false, shown: 0, on: onRefresh });
  live.current.on = onRefresh;
  const enabled = currentUx('motion') === 'premium' && fxPlays('premium', rootMotion());
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const html = document.documentElement;
    const before = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'contain';
    const st = live.current;
    const set = (v: number) => {
      st.shown = v;
      setShown(v);
    };
    const start = (e: TouchEvent) => {
      const f = e.touches[0];
      st.active = false;
      if (!f || e.touches.length !== 1 || !pullMayStart(window.scrollY, st.busy)) return;
      st.x = f.clientX;
      st.y = f.clientY;
      st.active = true;
    };
    let decided = false;
    const move = (e: TouchEvent) => {
      const f = e.touches[0];
      if (!st.active || !f) return;
      const dx = f.clientX - st.x;
      const dy = f.clientY - st.y;
      if (!decided) {
        if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
        decided = true;
        if (!pullIsVertical(dx, dy)) {
          st.active = false;
          return;
        }
      }
      if (window.scrollY > 0) {
        st.active = false;
        set(0);
        return;
      }
      if (e.cancelable) e.preventDefault();
      set(pullDistance(dy));
    };
    const end = () => {
      decided = false;
      if (!st.active) return;
      st.active = false;
      const go = pullRelease(st.shown) === 'refresh';
      if (!go) return set(0);
      st.busy = true;
      setPhase('busy');
      set(PULL.thresholdPx);
      Promise.resolve()
        .then(() => st.on())
        .catch(() => undefined)
        .then(() => {
          st.busy = false;
          setPhase('done');
          window.setTimeout(() => {
            setPhase('idle');
            set(0);
          }, PULL_DONE_MS);
        });
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
      html.style.overscrollBehaviorY = before;
    };
  }, [enabled]);
  if (!enabled) return <>{children}</>;
  const state: PullState = pullState(shown);
  const text = phase === 'busy' ? t('fx.pull.busy') : phase === 'done' ? t('fx.pull.done') : state === 'ready' ? t('fx.pull.release') : t('fx.pull.pull');
  const pulling = shown > 0 || phase !== 'idle';
  return (
    <div class="sf-ptr" data-state={phase === 'idle' ? state : phase} style={pulling ? { '--ptr-y': `${shown}px` } : undefined}>
      <div class="sf-ptr__pill" role="status" aria-live="polite">
        <span class="sf-ptr__dot" aria-hidden="true" />
        <span>{pulling ? text : ''}</span>
      </div>
      <div class="sf-ptr__body">{children}</div>
    </div>
  );
}

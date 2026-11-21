import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { tick } from './haptics';
import { cx } from './util';

export type PressableProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'onClick' | 'class' | 'className'> & {
  as?: 'button' | 'a';
  href?: string;
  onPress?: (e: Event) => void;
  disabled?: boolean;
  class?: string;
  children?: ComponentChildren;
};

/**
 * Base for everything tappable: reacts on pointer-down (scale 0.97 + background shift via CSS
 * [data-pressed]), Android haptic tick on press, min 44 px target. Renders a real <button> (or <a>).
 */
export function Pressable({ as = 'button', onPress, disabled, class: cls, children, ...rest }: PressableProps) {
  const [pressed, setPressed] = useState(false);
  const down = () => {
    if (!disabled) setPressed(true);
  };
  const up = () => setPressed(false);
  const click = (e: Event) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    tick();
    onPress?.(e);
  };
  const common = {
    class: cx('sf-press', cls),
    'data-pressed': pressed ? 'true' : undefined,
    onPointerDown: down,
    onPointerUp: up,
    onPointerLeave: up,
    onPointerCancel: up,
    onClick: click,
  };
  if (as === 'a') {
    return (
      <a {...(rest as JSX.HTMLAttributes<HTMLAnchorElement>)} {...common} aria-disabled={disabled ? 'true' : undefined}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" {...rest} {...common} disabled={disabled}>
      {children}
    </button>
  );
}

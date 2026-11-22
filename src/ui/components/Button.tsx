import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from './Icon';
import { Pressable, type PressableProps } from './Pressable';
import { cx } from './util';

/** The only four kinds (Phase 83): primary (one per screen), secondary, destructive. Navigation is a Row; icon buttons are IconButton. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  fullWidth?: boolean;
  children?: ComponentChildren;
}

/** Text wraps (never truncates); the button grows to fit. */
export function Button({ variant = 'primary', size = 'md', icon, fullWidth, class: cls, children, ...rest }: ButtonProps) {
  return (
    <Pressable {...rest} class={cx('sf-btn', `sf-btn--${variant}`, `sf-btn--${size}`, fullWidth && 'sf-btn--full', cls)}>
      {icon && <Icon name={icon} size={20} />}
      <span class="sf-btn__label">{children}</span>
    </Pressable>
  );
}

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'aria-label'> {
  icon: IconName;
  /** Required: icon buttons have no visible text. */
  label: string;
  variant?: 'secondary' | 'primary';
  weight?: 'regular' | 'fill';
}

export function IconButton({ icon, label, variant = 'secondary', weight = 'regular', class: cls, ...rest }: IconButtonProps) {
  return (
    <Pressable {...rest} aria-label={label} class={cx('sf-iconbtn', `sf-iconbtn--${variant}`, cls)}>
      <Icon name={icon} weight={weight} size={24} />
    </Pressable>
  );
}

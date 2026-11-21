import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from './Icon';
import { Pressable, type PressableProps } from './Pressable';
import { cx } from './util';

export interface ChipProps extends Omit<PressableProps, 'children'> {
  selected?: boolean;
  icon?: IconName;
  children?: ComponentChildren;
}

/** Toggle / filter chip. Selected state = gold outline + wash + aria-pressed (never colour alone: also a check icon). */
export function Chip({ selected = false, icon, class: cls, children, ...rest }: ChipProps) {
  return (
    <Pressable {...rest} aria-pressed={selected} class={cx('sf-chip', selected && 'sf-chip--on', cls)}>
      {selected ? <Icon name="check" size={16} weight="fill" /> : icon && <Icon name={icon} size={16} />}
      <span class="sf-chip__label">{children}</span>
    </Pressable>
  );
}

export interface BadgeProps {
  tone?: 'neutral' | 'gold' | 'ok' | 'warn' | 'danger' | 'info';
  icon?: IconName;
  class?: string;
  children?: ComponentChildren;
}

/** Small static label. Always carries text, so meaning never rests on colour alone. */
export function Badge({ tone = 'neutral', icon, class: cls, children }: BadgeProps) {
  return (
    <span class={cx('sf-badge', `sf-badge--${tone}`, cls)}>
      {icon && <Icon name={icon} size={14} weight="fill" />}
      <span class="sf-badge__label">{children}</span>
    </span>
  );
}

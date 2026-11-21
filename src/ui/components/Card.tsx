import type { ComponentChildren } from 'preact';
import { Pressable } from './Pressable';
import { cx } from './util';

export interface CardProps {
  as?: 'div' | 'section' | 'article';
  tone?: 'raised' | 'card' | 'gold';
  padded?: boolean;
  /** Makes the whole card a button (detail = a page or a sheet, never in-place expansion). */
  onPress?: (e: Event) => void;
  class?: string;
  children?: ComponentChildren;
}

/** A fixed surface. Cards never expand, collapse or flip: they show their whole content. */
export function Card({ as = 'div', tone = 'raised', padded = true, onPress, class: cls, children }: CardProps) {
  const klass = cx('sf-card', `sf-card--${tone}`, padded && 'sf-card--padded', cls);
  if (onPress) {
    return (
      <Pressable class={cx(klass, 'sf-card--press')} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  const Tag = as as 'div';
  return <Tag class={klass}>{children}</Tag>;
}

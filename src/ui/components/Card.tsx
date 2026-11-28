import type { ComponentChildren } from 'preact';
import { Pressable } from './Pressable';
import { cx } from './util';

export interface CardProps {
  as?: 'div' | 'section' | 'article';
  tone?: 'raised' | 'card' | 'gold';
  /** Premium depth level (Phase 97): 1 rows and small cards, 2 cards (default look), 3 raised panels. Classic ignores it. */
  elevation?: 1 | 2 | 3;
  padded?: boolean;
  /** Makes the whole card a button (detail = a page or a sheet, never in-place expansion). */
  onPress?: (e: Event) => void;
  class?: string;
  /** Phase 116: guided-walkthrough target (an attribute only). */
  'data-tour'?: string;
  children?: ComponentChildren;
}

/** A fixed surface. Cards never expand, collapse or flip: they show their whole content. */
export function Card({ as = 'div', tone = 'raised', elevation, padded = true, onPress, class: cls, children, 'data-tour': tour }: CardProps) {
  const klass = cx('sf-card', `sf-card--${tone}`, padded && 'sf-card--padded', elevation && `sf-card--e${elevation}`, cls);
  if (onPress) {
    return (
      <Pressable class={cx(klass, 'sf-card--press')} onPress={onPress} data-tour={tour}>
        {children}
      </Pressable>
    );
  }
  const Tag = as as 'div';
  return <Tag class={klass} data-tour={tour}>{children}</Tag>;
}

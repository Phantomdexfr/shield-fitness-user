// Phase 97: the gold hero card. Premium: a faint gold radial wash and a thin gold gradient border (ONE per screen, gold only).
// Classic: exactly the existing gold Card. Same props and children either way, so a screen never branches on the style itself.
import type { ComponentChildren } from 'preact';
import { useUx } from '../useUx';
import { Card } from './Card';
import { cx } from './util';

export interface HeroCardProps {
  as?: 'div' | 'section' | 'article';
  padded?: boolean;
  class?: string;
  /** Phase 116: guided-walkthrough target (an attribute only). */
  'data-tour'?: string;
  children?: ComponentChildren;
}

export function HeroCard({ as = 'section', padded = true, class: cls, children, 'data-tour': tour }: HeroCardProps) {
  const style = useUx('surfaces');
  if (style === 'classic') {
    return (
      <Card as={as} tone="gold" padded={padded} class={cls} data-tour={tour}>
        {children}
      </Card>
    );
  }
  const Tag = as as 'div';
  return <Tag class={cx('sf-hero', padded && 'sf-hero--padded', cls)} data-tour={tour}>{children}</Tag>;
}

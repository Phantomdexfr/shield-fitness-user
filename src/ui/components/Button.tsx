import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useUx } from '../useUx';
import { Icon, type IconName } from './Icon';
import { LABELS } from './labels';
import { Pressable, type PressableProps } from './Pressable';
import { cx } from './util';

/** The only four kinds (Phase 83): primary (one per screen), secondary, destructive. Navigation is a Row; icon buttons are IconButton. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  fullWidth?: boolean;
  /** Phase 100: busy. Blocks presses, sets aria-busy; Premium also shows a spinner. */
  loading?: boolean;
  children?: ComponentChildren;
}

/** Text wraps (never truncates); the button grows to fit. */
export function Button({ variant = 'primary', size = 'md', icon, fullWidth, loading, disabled, class: cls, children, ...rest }: ButtonProps) {
  return (
    <Pressable {...rest} disabled={disabled || loading} aria-busy={loading ? 'true' : undefined} class={cx('sf-btn', `sf-btn--${variant}`, `sf-btn--${size}`, fullWidth && 'sf-btn--full', loading && 'sf-btn--loading', cls)}>
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
  /** Phase 100: busy. Blocks presses, sets aria-busy; Premium also shows a spinner over the icon. */
  loading?: boolean;
}

export function IconButton({ icon, label, variant = 'secondary', weight = 'regular', loading, disabled, class: cls, ...rest }: IconButtonProps) {
  return (
    <Pressable {...rest} disabled={disabled || loading} aria-busy={loading ? 'true' : undefined} aria-label={label} class={cx('sf-iconbtn', `sf-iconbtn--${variant}`, loading && 'sf-iconbtn--loading', cls)}>
      <Icon name={icon} weight={weight} size={24} />
    </Pressable>
  );
}

export interface ActionMenuItem {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export interface ActionMenuProps {
  /** The ONE primary action. */
  primary: { label: string; onPress: () => void; icon?: IconName };
  /** Everything else (for example: Add to go-tos, Never show, Got it do not show again). */
  items: ActionMenuItem[];
  moreLabel?: string;
}

/** One primary button + a "..." popover for the rest (Premium, ux.controls). Classic keeps every action as its own button, stacked. */
export function ActionMenu({ primary, items, moreLabel = LABELS.moreActions }: ActionMenuProps) {
  const premium = useUx('controls') === 'premium';
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    box.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!premium) {
    return (
      <div class="sf-page-body">
        <Button variant="primary" icon={primary.icon} onPress={primary.onPress}>{primary.label}</Button>
        {items.map((it) => (
          <Button key={it.label} variant={it.danger ? 'danger' : 'secondary'} onPress={it.onPress}>{it.label}</Button>
        ))}
      </div>
    );
  }
  return (
    <div class="sf-actionmenu" ref={box}>
      <Button variant="primary" icon={primary.icon} onPress={primary.onPress}>{primary.label}</Button>
      {items.length > 0 && (
        <IconButton icon="dots-three" label={moreLabel} aria-haspopup="menu" aria-expanded={open} onPress={() => setOpen(!open)} />
      )}
      {open && (
        <div class="sf-actionmenu__pop" role="menu" aria-label={moreLabel}>
          {items.map((it) => (
            <Pressable
              key={it.label}
              role="menuitem"
              class={cx('sf-actionmenu__item', it.danger && 'sf-actionmenu__item--danger')}
              onPress={() => {
                setOpen(false);
                it.onPress();
              }}
            >
              <span class="sf-actionmenu__label">{it.label}</span>
            </Pressable>
          ))}
        </div>
      )}
    </div>
  );
}

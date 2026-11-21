import { ICONS, type IconName } from '../icons/generated';

export type { IconName };
export interface IconProps {
  name: IconName;
  weight?: 'regular' | 'fill';
  size?: number;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  label?: string;
  class?: string;
}

/** Inlined Phosphor icon (see scripts/build-icons.mjs). No icon font, no emoji. */
export function Icon({ name, weight = 'regular', size = 24, label, class: cls }: IconProps) {
  return (
    <svg
      class={cls ? `sf-icon ${cls}` : 'sf-icon'}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[name][weight] }}
    />
  );
}

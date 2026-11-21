import { useState } from 'preact/hooks';
import { cx } from './util';

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0] as string)[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1] as string)[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export interface AvatarProps {
  name: string;
  /** Optional image URL (same-origin or data URL; profile photos stay on the device). */
  src?: string;
  size?: number;
  class?: string;
}

/** Initials in a gold-rimmed circle; an image replaces them when it loads. */
export function Avatar({ name, src, size = 40, class: cls }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImg = !!src && failedSrc !== src;
  return (
    <span class={cx('sf-avatar', cls)} style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }} role="img" aria-label={name}>
      {showImg ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src ?? null)} /> : <span aria-hidden="true">{initialsOf(name)}</span>}
    </span>
  );
}

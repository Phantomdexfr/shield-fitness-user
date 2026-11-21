import { useState } from 'preact/hooks';
import { Icon } from './Icon';
import { cx } from './util';

export interface PhotoFrameProps {
  src?: string;
  /** From the machine manifest. */
  alt: string;
  class?: string;
}

/**
 * Fixed 4:3 frame, object-fit cover, lazy, dark vignette, gold-outline placeholder when the photo is
 * missing or fails. Photos never carry text overlays.
 */
export function PhotoFrame({ src, alt, class: cls }: PhotoFrameProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ok = !!src && failedSrc !== src;
  return (
    <div class={cx('sf-photo', !ok && 'sf-photo--missing', cls)} role={ok ? undefined : 'img'} aria-label={ok ? undefined : alt}>
      {ok ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSrc(src ?? null)} />
      ) : (
        <Icon name="image" size={32} />
      )}
    </div>
  );
}

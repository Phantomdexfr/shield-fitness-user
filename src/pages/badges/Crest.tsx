import { t, type StringKey } from '../../i18n';
import { tierClass } from './badgesModel';

/** Shield crest in the tier colour. The tier name is written under it (never colour alone); the SVG itself is decorative. */
export function Crest({ tier, size = 'md', hideName = false }: { tier: number | null; size?: 'sm' | 'md' | 'lg'; hideName?: boolean }) {
  const name = tier == null ? t('badge.unranked') : t(`badge.tier.${tier}` as StringKey);
  return (
    <span class={`sf-bd__crest sf-bd__crest--${size} ${tierClass(tier)}`}>
      <svg viewBox="0 0 40 46" aria-hidden="true" focusable="false">
        <path class="sf-bd__shield" d="M20 2 L37 8 V23 C37 33 29 40 20 44 C11 40 3 33 3 23 V8 Z" />
        {tier === 8 && <path class="sf-bd__laurel" d="M12 22 C12 16 15 12 20 10 C25 12 28 16 28 22" />}
      </svg>
      {!hideName && <span class="sf-bd__crest-name">{name}</span>}
    </span>
  );
}

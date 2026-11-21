import { useEffect, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { loadSessionPromotions } from '../../data/repos/badges';
import type { Promotion } from '../../shared/badges';
import { Crest } from './Crest';

const label = (p: Promotion): string => (p.kind === 'overall' ? t('badge.overall.name') : t(`muscle.${p.id}` as StringKey));

/** Tier raises a finished workout produced. Reuses the record-burst look (sf-sm__burst), which is still when motion is reduced. Shows nothing when badges are off or nothing rose. */
export function PromotionBanner({ sessionId }: { sessionId: string }) {
  const [list, setList] = useState<Promotion[]>([]);
  useEffect(() => {
    let live = true;
    loadSessionPromotions(sessionId).then((p) => live && setList(p), () => undefined);
    return () => { live = false; };
  }, [sessionId]);
  if (list.length === 0) return null;
  // Overall first, then groups, then muscles; at most 6 lines so the summary stays short.
  const rank = { overall: 0, group: 1, muscle: 2 } as const;
  // A muscle whose id is also a group (Chest, Triceps ...) with the same new tier would read twice, so only the group line stays.
  const groupSame = new Set(list.filter((p) => p.kind === 'group').map((p) => `${p.id}:${p.to}`));
  const unique = list.filter((p) => p.kind !== 'muscle' || !groupSame.has(`${p.id}:${p.to}`));
  const shown = [...unique].sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 6);
  return (
    <div class="sf-sm__burst" role="status">
      <span class="sf-sm__burst-title">{t('badge.promo.title')}</span>
      {shown.map((p) => (
        <p key={`${p.kind}:${p.id}`} class="sf-sm__burst-line sf-bd__promo">
          <Crest tier={p.to} size="sm" hideName />
          <span>{t('badge.promo.line', { name: label(p), tier: t(`badge.tier.${p.to}` as StringKey) })}</span>
        </p>
      ))}
      {unique.length > shown.length && <p class="sf-sm__burst-was sf-rt__meta">{t('badge.promo.more', { n: unique.length - shown.length })}</p>}
    </div>
  );
}

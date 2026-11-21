import { useEffect, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { t } from '../../i18n';
import { Card } from '../../ui/components';
import { useFeature } from '../../app/flags';
import { istDayKey } from '../../shared/dates';
import { muscleOfWeek } from '../../shared/recap';

type Shown = { name: string; fact: string };

/** One muscle per ISO week with one everyday fact, from the atlas text. The atlas file is read only when this card opens. */
export function MuscleOfWeekCard() {
  const on = useFeature('muscle_of_week');
  const atlasOn = useFeature('holo_atlas');
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    void import('../../atlas/logic').then(({ ATLAS }) => {
      const w = muscleOfWeek(istDayKey(Date.now()), ATLAS);
      if (live && w) setShown({ name: w.row.name, fact: w.fact });
    });
    return () => {
      live = false;
    };
  }, [on]);
  if (!on || !shown) return null;
  return (
    <Card as="section" class="sf-mw" aria-label={t('mw.title')}>
      <h2 class="sf-pg__h">{t('mw.title')}</h2>
      <p class="sf-mw__name">{shown.name}</p>
      <p class="sf-lib__note">{t('mw.fact', { fact: shown.fact })}</p>
      {atlasOn && <Link href="/atlas" class="sf-lab__link">{t('mw.more')}</Link>}
    </Card>
  );
}

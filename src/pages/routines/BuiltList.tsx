import { t, type StringKey } from '../../i18n';
import { Badge, Button, IconButton } from '../../ui/components';
import { useUx } from '../../ui/useUx';
import type { BuildResult } from '../../shared/dayBuilder';

/** The exercises a builder made, grouped by slot, each with a Shuffle button. Used by the day builder sheet and Workout in a pinch. */
export function BuiltList({ result, onShuffle, note }: { result: BuildResult; onShuffle: (index: number) => void; note?: string | null }) {
  const tidy = useUx('tidy') === 'premium'; // Phase 115: Shuffle is one small icon button per row
  const used = Math.ceil(result.seconds / 60);
  const box = Math.round(result.limitSec / 60);
  let last = '';
  return (
    <div class="sf-rt__block">
      <p class="sf-rt__meta" role="status">{t('db.total', { used, box })}</p>
      {note && <p class="sf-rt__meta" role="status">{note}</p>}
      <ul class="sf-rt__list">
        {result.entries.map((e, i) => {
          const head = e.slot !== last;
          last = e.slot;
          return (
            <li key={`${e.slug}-${i}`} class="sf-db__entry">
              {head && <h3 class="sf-rt__h">{t(`db.slot.${e.slot}` as StringKey)}</h3>}
              <div class="sf-rt__item">
                <div class="sf-rt__card sf-db__text">
                  <span class="sf-rt__name">{e.name}</span>
                  <span class="sf-rt__meta">{t('db.line', { sets: e.sets, min: e.repMin, max: e.repMax, rest: e.restSec })}</span>
                  {e.group && <Badge tone="gold">{t('rb.d.ss')}</Badge>}
                </div>
                {tidy ? (
                  <IconButton icon="swap" variant="secondary" label={t('db.shuffle.aria', { name: e.name })} onPress={() => onShuffle(i)} />
                ) : (
                  <Button variant="secondary" aria-label={t('db.shuffle.aria', { name: e.name })} onPress={() => onShuffle(i)}>{t('db.shuffle')}</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

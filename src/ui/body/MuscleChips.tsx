import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { StringKey } from '../../i18n';
import { cx } from '../components/util';
import type { BodyMode, BodyPickerProps } from './BodyPicker';
import { stateClass } from './BodyPicker';
import { GROUP_ORDER, MUSCLE_IDS, expand, groupOf, lookup, tierOf, type MuscleId } from './taxonomy';

export interface MuscleChipsProps extends Pick<BodyPickerProps, 'value' | 'onChange' | 'heat' | 'recovery' | 'marks' | 'emphasis' | 'onSelect'> {
  mode: BodyMode;
  /** Optional right-hand text per muscle (e.g. exercise count). Heat mode shows the heat band when this is absent. */
  counts?: Record<MuscleId, string | number>;
  class?: string;
}

const name = (id: string) => t(`muscle.${id}` as StringKey);

/** Searchable, grouped text twin of the body figure: same data, same selection, same colours. */
export function MuscleChips(props: MuscleChipsProps) {
  const { mode } = props;
  const picking = mode === 'pick-one' || mode === 'pick-many';
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const selected = new Set<MuscleId>();
  if (picking) for (const id of props.value ?? []) for (const e of expand(id)) selected.add(e);
  const none = new Set<MuscleId>();

  const press = (id: MuscleId) => {
    if (picking && props.onChange) {
      const cur = props.value ?? [];
      const has = cur.includes(id);
      props.onChange(mode === 'pick-one' ? (has ? [] : [id]) : has ? cur.filter((x) => x !== id) : [...cur, id]);
    } else props.onSelect?.(id);
  };

  const groups = GROUP_ORDER.map((g) => ({
    g,
    ids: MUSCLE_IDS.filter((id) => groupOf(id) === g && (!needle || name(id).toLowerCase().includes(needle) || id.includes(needle) || t(`body.group.${g}` as StringKey).toLowerCase().includes(needle))),
  })).filter((x) => x.ids.length);

  return (
    <div class={cx('sf-chips', props.class)}>
      <input class="sf-chips__search" type="search" value={q} placeholder={t('body.chips.search')} aria-label={t('body.chips.search')} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {groups.map(({ g, ids }) => (
        <section key={g} class="sf-chips__group" aria-label={t(`body.group.${g}` as StringKey)}>
          <h3 class="sf-chips__h">{t(`body.group.${g}` as StringKey)}</h3>
          <ul class="sf-chips__list">
            {ids.map((id) => {
              const c = stateClass(id, props, selected, none);
              const tier = tierOf(id);
              const heat = lookup(props.heat, id);
              const meta = props.counts?.[id] ?? (heat !== undefined ? heat : '');
              return (
                <li key={id}>
                  <button type="button" class={cx('sf-chips__row', c && c.replace('sf-body__u--', 'sf-chips__row--'))} aria-pressed={picking ? selected.has(id) : undefined} data-m={id} onClick={() => press(id)}>
                    <span class="sf-chips__name">{name(id)}</span>
                    {meta !== '' && <span class="sf-chips__meta">{meta}</span>}
                    <span class="sf-chips__tier">{t(`body.tier.${tier}` as StringKey)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!groups.length && <p class="sf-chips__empty">{t('body.chips.empty')}</p>}
    </div>
  );
}

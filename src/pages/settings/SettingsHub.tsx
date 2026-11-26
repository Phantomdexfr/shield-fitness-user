import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Icon, PageIcon, SubPageHeader } from '../../ui/components';
import { useUx } from '../../ui/useUx';
import { readPref } from '../../data/repos/prefs';
import { GROUPS, MORE_GROUPS, type GroupDef, type PrefValue } from '../../shared/settings';
import { goBack } from '../../app/navBack';

type Values = Record<string, PrefValue>;

const valueLabel = (v: PrefValue | undefined): string => t(`st.v.${String(v)}` as StringKey);
const onOff = (v: PrefValue | undefined) => t(v === false ? 'st.v.off' : 'st.v.on');

/** The one-line current state shown under each group name. */
export function summaryFor(slug: string, v: Values): string {
  switch (slug) {
    case 'account':
      return t('st.s.level', { a: valueLabel(v['account.level']) });
    case 'training':
      return t('st.s.units', { a: valueLabel(v['training.units']), b: valueLabel(v['training.overloadMode']) });
    case 'workout-flow':
      return t('st.s.suggestions', { state: onOff(v['flow.suggestions']).toLowerCase() });
    case 'body':
      return t('st.s.heat', { a: valueLabel(v['body.heatPeriod']) });
    case 'appearance':
      return t('st.s.appearance', { a: valueLabel(v['appearance.motion']), b: valueLabel(v['appearance.density']) });
    default:
      return t('st.s.mode', { a: valueLabel(v['mode.level']) });
  }
}

/** /settings: a list of groups only. Every group is its own page. */
export default function SettingsHub() {
  const [, navigate] = useLocation();
  const [values, setValues] = useState<Values>({});
  useEffect(() => {
    let alive = true;
    const keys = [...new Set(GROUPS.flatMap((g: GroupDef) => g.summary))];
    void Promise.all(keys.map(async (k) => [k, await readPref(k)] as const)).then((pairs) => {
      if (alive) setValues(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, []);
  const premium = useUx('layout') === 'premium';
  const main = GROUPS.map((g) => (
    <li key={g.slug}>
      <Link href={`/settings/${g.slug}`} class="sf-st__group">
        <PageIcon id={`settings.${g.slug}`} classic={g.icon} />
        <span class="sf-st__text">
          <span class="sf-st__name">{t(`st.g.${g.slug}` as StringKey)}</span>
          <span class="sf-st__sum">{summaryFor(g.slug, values)}</span>
        </span>
        <span class="sf-st__caret" aria-hidden="true">
          <Icon name="caret-right" />
        </span>
      </Link>
    </li>
  ));
  const more = MORE_GROUPS.map((g) => (
    <li key={g.slug}>
      <Link href={`/settings/${g.slug}`} class="sf-st__group">
        <PageIcon id={`settings.${g.slug}`} classic={g.icon} />
        <span class="sf-st__text">
          <span class="sf-st__name">{t(`st.g.${g.slug}` as StringKey)}</span>
          <span class="sf-st__sum">{t(`st.s.${g.slug}` as StringKey)}</span>
        </span>
        <span class="sf-st__caret" aria-hidden="true">
          <Icon name="caret-right" />
        </span>
      </Link>
    </li>
  ));
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('st.title')} onBack={() => goBack(navigate, '/me')} />
      {premium ? (
        <div class="sf-groups">
          <ul class="sf-st__list">{main}</ul>
          <ul class="sf-st__list">{more}</ul>
        </div>
      ) : (
        <ul class="sf-st__list">
          {main}
          {more}
        </ul>
      )}
    </section>
  );
}

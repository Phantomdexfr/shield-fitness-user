import { Link } from 'wouter-preact';
import { t, type StringKey } from '../i18n';
import { Icon, type IconName } from '../ui/components';
import { resolveFeature } from '../app/flags';

interface MeLink {
  to: string;
  key: StringKey;
  icon: IconName;
  feature: string | null;
  /** shown when ANY of these is on (used by the gym area) */
  anyOf?: string[];
}

/** The Me tab: one list of where your own things live. A link whose feature is off is not shown. */
export const ME_LINKS: readonly MeLink[] = [
  { to: '/history', key: 'me.history', icon: 'check', feature: 'flexible_session' },
  { to: '/progress', key: 'me.progress', icon: 'barbell', feature: 'progress_charts' },
  { to: '/progress/records', key: 'me.records', icon: 'plus-square', feature: 'pr_board' },
  { to: '/progress/recap', key: 'me.recap', icon: 'image', feature: 'year_review' },
  { to: '/progress/photos', key: 'me.photos', icon: 'image', feature: 'progress_photos' },
  { to: '/goals', key: 'me.goals', icon: 'check', feature: 'goals' },
  { to: '/intake', key: 'me.intake', icon: 'plus', feature: 'intake' },
  { to: '/profile/muscles', key: 'me.badges', icon: 'user-circle', feature: 'muscle_badges' },
  { to: '/gym', key: 'me.gym', icon: 'user-circle', feature: null, anyOf: ['membership', 'attendance_qr', 'inbox', 'requests'] },
  { to: '/settings', key: 'me.settings', icon: 'info', feature: null },
];

export default function MePage() {
  return (
    <section class="sf-page-body sf-st">
      <h1 class="sf-st__title">{t('page.me.title')}</h1>
      <ul class="sf-st__list">
        {ME_LINKS.filter((l) => (l.anyOf ? l.anyOf.some((k) => resolveFeature(k)) : l.feature === null || resolveFeature(l.feature))).map((l) => (
          <li key={l.to}>
            <Link href={l.to} class="sf-st__group">
              <span class="sf-st__icon" aria-hidden="true"><Icon name={l.icon} /></span>
              <span class="sf-st__text"><span class="sf-st__name">{t(l.key)}</span></span>
              <span class="sf-st__caret" aria-hidden="true"><Icon name="caret-right" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

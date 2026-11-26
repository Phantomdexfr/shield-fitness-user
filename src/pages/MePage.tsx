import { Link } from 'wouter-preact';
import { t, type StringKey } from '../i18n';
import { Icon, PageIcon, type IconName } from '../ui/components';
import { useUx } from '../ui/useUx';
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

/** Premium layout: the list is cut into three groups where these rows start (no labels, just space between groups). */
const GROUP_STARTS: ReadonlySet<string> = new Set(['/goals', '/gym']);

export function splitMeGroups<T extends { to: string }>(links: readonly T[]): T[][] {
  const out: T[][] = [];
  for (const l of links) {
    if (out.length === 0 || GROUP_STARTS.has(l.to)) out.push([]);
    out[out.length - 1]!.push(l);
  }
  return out;
}

export default function MePage() {
  const premium = useUx('layout') === 'premium';
  const shown = ME_LINKS.filter((l) => (l.anyOf ? l.anyOf.some((k) => resolveFeature(k)) : l.feature === null || resolveFeature(l.feature)));
  const item = (l: MeLink) => (
    <li key={l.to}>
      <Link href={l.to} class="sf-st__group">
        <PageIcon id={l.key} classic={l.icon} />
        <span class="sf-st__text"><span class="sf-st__name">{t(l.key)}</span></span>
        <span class="sf-st__caret" aria-hidden="true"><Icon name="caret-right" /></span>
      </Link>
    </li>
  );
  return (
    <section class="sf-page-body sf-st">
      <h1 class="sf-st__title">{t('page.me.title')}</h1>
      {premium ? (
        <div class="sf-groups">
          {splitMeGroups(shown).map((g) => (
            <ul key={g[0]!.to} class="sf-st__list">{g.map(item)}</ul>
          ))}
        </div>
      ) : (
        <ul class="sf-st__list">{shown.map(item)}</ul>
      )}
    </section>
  );
}

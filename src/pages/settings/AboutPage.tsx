import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Icon, SubPageHeader } from '../../ui/components';
import { aboutIsEmpty, parseAbout } from '../../shared/content';
import aboutJson from '../../content/about.json';
import pkg from '../../../package.json';
import { goBack } from '../../app/navBack';

const about = parseAbout(aboutJson);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** /settings/about: app name and release, the maker (name in bold), the story, contact and links. Text comes from src/content/about.json. */
export default function AboutPage() {
  const [, navigate] = useLocation();
  const empty = aboutIsEmpty(about);
  return (
    <section class="sf-page-body sf-st sf-about">
      <SubPageHeader title={t('st.g.about')} onBack={() => goBack(navigate, '/settings')} />

      <div class="sf-st__row sf-about__hero">
        <h2 class="sf-about__app">{t('ab.name')}</h2>
        {about.tagline !== '' && <p class="sf-st__value">{about.tagline}</p>}
        <p class="sf-st__hint">{t('ab.version', { v: pkg.version })} · {t('ab.build', { b: __APP_BUILD__ })}</p>
      </div>

      {about.author !== '' && (
        <div class="sf-st__row">
          <p class="sf-about__kicker">{t('ab.madeby')}</p>
          <p class="sf-about__author">
            <Icon name="user-circle" /> <strong>{about.author}</strong>
          </p>
          {about.contact !== '' &&
            (isEmail(about.contact) ? (
              <a class="sf-st__link" href={`mailto:${about.contact}`}>{about.contact}</a>
            ) : (
              <p class="sf-st__para">{about.contact}</p>
            ))}
        </div>
      )}

      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('ab.app')}</h2>
        <p class="sf-st__para">{t('ab.what')}</p>
        {about.description.map((p, i) => (
          <p key={i} class="sf-st__hint">{p}</p>
        ))}
      </div>

      {about.author === '' && about.contact !== '' && (
        <div class="sf-st__row">
          <h2 class="sf-st__label">{t('ab.contact')}</h2>
          <p class="sf-st__para">{about.contact}</p>
        </div>
      )}
      {about.links.length > 0 && (
        <div class="sf-st__row">
          <h2 class="sf-st__label">{t('ab.links')}</h2>
          {about.links.map((l) => (
            <a key={l.url} class="sf-st__link" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
          ))}
        </div>
      )}
      {empty && (
        <div class="sf-st__row sf-st__row--fill">
          <span class="sf-st__lock">{t('ab.fill')}</span>
          <p class="sf-st__hint">{t('ab.fill.1')}</p>
        </div>
      )}
    </section>
  );
}

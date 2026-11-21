import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { SubPageHeader } from '../../ui/components';
import { aboutIsEmpty, parseAbout } from '../../shared/content';
import aboutJson from '../../content/about.json';
import pkg from '../../../package.json';
import { goBack } from '../../app/navBack';

const about = parseAbout(aboutJson);

/** /settings/about: fixed facts (name, version, build) plus the owner's text from src/content/about.json. Empty = a calm placeholder. */
export default function AboutPage() {
  const [, navigate] = useLocation();
  const empty = aboutIsEmpty(about);
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('st.g.about')} onBack={() => goBack(navigate, '/settings')} />
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('ab.name')}</h2>
        {about.tagline !== '' && <p class="sf-st__value">{about.tagline}</p>}
        <p class="sf-st__hint">{t('ab.what')}</p>
        <p class="sf-st__hint">{t('ab.version', { v: pkg.version })}</p>
        <p class="sf-st__hint">{t('ab.build', { b: __APP_BUILD__ })}</p>
      </div>
      {about.description.map((p, i) => (
        <p key={i} class="sf-st__para">{p}</p>
      ))}
      {about.contact !== '' && (
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

import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { SubPageHeader } from '../../ui/components';
import { parseCredits } from '../../shared/content';
import creditsJson from '../../content/credits.json';
import { goBack } from '../../app/navBack';

const credits = parseCredits(creditsJson);

/** /settings/credits: the owner's thanks (src/content/credits.json) and the required licences, which can never be empty. */
export default function CreditsPage() {
  const [, navigate] = useLocation();
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('st.g.credits')} onBack={() => goBack(navigate, '/settings')} />
      <p class="sf-st__hint">{t('cr.intro')}</p>
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('cr.own.h')}</h2>
        {credits.ownerCredits.length === 0 ? (
          <>
            <span class="sf-st__lock">{t('ab.fill')}</span>
            <p class="sf-st__hint">{t('cr.own.fill')}</p>
          </>
        ) : (
          credits.ownerCredits.map((c, i) => <p key={i} class="sf-st__para">{c}</p>)
        )}
      </div>
      <h2 class="sf-st__label">{t('cr.third.h')}</h2>
      <ul class="sf-st__list">
        {credits.thirdParty.map((c) => (
          <li key={c.name} class="sf-st__row">
            <span class="sf-st__label">{c.name}</span>
            <span class="sf-st__value">{c.licence}</span>
            {c.note !== '' && <span class="sf-st__hint">{c.note}</span>}
            {c.note !== '' && <a class="sf-st__link" href={c.url} target="_blank" rel="noopener noreferrer">{c.url}</a>}
          </li>
        ))}
      </ul>
      <p class="sf-st__hint">{t('cr.note')}</p>
    </section>
  );
}

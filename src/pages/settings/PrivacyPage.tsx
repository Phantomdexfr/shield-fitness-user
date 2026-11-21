import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { SubPageHeader } from '../../ui/components';
import { relayAvailable } from '../../data/relay/client';
import { goBack } from '../../app/navBack';

/** Settings -> Privacy: what leaves the phone and what never does (plan sharing; the AI text only goes where it is pasted). */
export default function PrivacyPage() {
  const [, navigate] = useLocation();
  return (
    <section class="sf-page-body sf-rt">
      <SubPageHeader title={t('ps.priv.title')} onBack={() => goBack(navigate, '/settings')} />
      <h2 class="sf-rt__h">{t('pv.stored.h')}</h2>
      <p class="sf-rt__meta">{t('pv.stored.1')}</p>
      <p class="sf-rt__meta">{t('pv.stored.2')}</p>
      <h2 class="sf-rt__h">{t('pv.photos.h')}</h2>
      <p class="sf-rt__meta">{t('pv.photos.1')}</p>
      <h2 class="sf-rt__h">{t('pv.net.h')}</h2>
      <p class="sf-rt__meta">{t('pv.net.1')}</p>
      <h2 class="sf-rt__h">{t('ps.priv.share.h')}</h2>
      <p class="sf-rt__meta">{t('ps.priv.share.1')}</p>
      <p class="sf-rt__meta">{t('ps.priv.share.2')}</p>
      <p class="sf-rt__meta">{t('ps.priv.share.3')}</p>
      <p class="sf-rt__meta">{t(relayAvailable() ? 'ps.priv.on' : 'ps.err.not_configured')}</p>
      <h2 class="sf-rt__h">{t('ps.priv.local.h')}</h2>
      <p class="sf-rt__meta">{t('ps.priv.local.1')}</p>
    </section>
  );
}

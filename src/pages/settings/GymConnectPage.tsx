import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader } from '../../ui/components';
import { checkGymCode } from '../../data/repos/gymPending';
import { gymErrorKey } from './GymAddPage';

/** `/connect#SFCFG1.<payload>`: read the code, wipe it from the address bar at once, check it, go to the confirm screen. */
export default function GymConnectPage() {
  const [, navigate] = useLocation();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    if (!hash) return setErr(t('gy.connect.none'));
    const r = checkGymCode(`https://x/#${hash}`);
    if (r.ok) navigate('/settings/gym/confirm', { replace: true });
    else setErr(t(gymErrorKey(r)));
  }, []);
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gy.connect.h')} onBack={() => navigate('/settings/gym', { replace: true })} />
      {err && (
        <>
          <p class="sf-rt__err" role="alert">{err}</p>
          <Button onPress={() => navigate('/settings/gym/add', { replace: true })}>{t('gy.add.h')}</Button>
        </>
      )}
    </section>
  );
}

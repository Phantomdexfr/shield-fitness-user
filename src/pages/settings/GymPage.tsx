import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader } from '../../ui/components';
import { goBack } from '../../app/navBack';
import { useConnection } from '../../data/repos/gymLink';
import { getPolicy } from '../../data/repos/gymPolicy';
import { syncNow } from '../../data/repos/gymLink';
import { SyncChip } from './SyncChip';
import { MoveToGym } from './MoveToGym';
import { useUpload } from '../../data/repos/gymLink';

/** /settings/gym (S1): standalone home, or the connected home (gym name, host, policy version, sync, Sign in, Refresh, Disconnect). */
export default function GymPage() {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const [busy, setBusy] = useState(false);
  // S9: while a password change is demanded, the gym area shows nothing else.
  useEffect(() => {
    if (conn?.mustChangePassword) navigate('/settings/gym/password', { replace: true });
  }, [conn]);
  const refresh = async () => {
    setBusy(true);
    await syncNow('manual').catch(() => undefined);
    setBusy(false);
  };
  const upload = useUpload();
  const version = getPolicy()?.version;
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('st.g.gym')} onBack={() => goBack(navigate, '/settings')} />
      {!conn ? (
        <>
          <div class="sf-st__row">
            <h2 class="sf-st__label">{t('gy.status.h')}</h2>
            <p class="sf-st__value">{t('gy.status')}</p>
            <p class="sf-st__hint">{t('gy.status.1')}</p>
          </div>
          <div class="sf-st__row">
            <Button variant="secondary" onPress={() => navigate('/settings/gym/add')}>{t('gy.add')}</Button>
          </div>
        </>
      ) : (
        <>
          <div class="sf-st__row">
            <h2 class="sf-st__label">{t('gy.status.h')}</h2>
            <p class="sf-st__value">{conn.config.name}</p>
            <p class="sf-st__hint" style={{ overflowWrap: 'anywhere' }}>{conn.host}</p>
            {version !== undefined && <p class="sf-st__hint">{t('gy.home.policy', { v: version })}</p>}
            <p class="sf-st__hint">{conn.signedIn ? t('gy.home.in') : t('gy.home.out')}</p>
            <SyncChip />
          </div>
          {conn.signedIn && !conn.mustChangePassword && <MoveToGym />}
          <div class="sf-st__row">
            {!conn.signedIn && <Button onPress={() => navigate('/settings/gym/signin')}>{t('gy.signin.go')}</Button>}
            {conn.signedIn && upload.ask && <p class="sf-st__hint">{t('gu.asked')}</p>}
            {conn.signedIn && !conn.mustChangePassword && <Button variant={upload.ask ? 'primary' : 'secondary'} onPress={() => navigate('/settings/gym/upload')}>{t('gu.row')}</Button>}
            <Button variant="secondary" disabled={busy} onPress={() => void refresh()}>{t('gy.home.refresh')}</Button>
            <Button variant="secondary" onPress={() => navigate('/settings/gym/sync')}>{t('gy.sync.h')}</Button>
            <Button variant="secondary" onPress={() => navigate('/settings/gym/disconnect')}>{t('gy.disc.go')}</Button>
          </div>
        </>
      )}
    </section>
  );
}

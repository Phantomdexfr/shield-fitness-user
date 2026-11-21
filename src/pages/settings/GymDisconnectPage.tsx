import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader } from '../../ui/components';
import { disconnect, syncNow, unsyncedCount } from '../../data/repos/gymLink';
import { useConnection } from '../../data/repos/gymLink';
import { useFeature } from '../../app/flags';
import { freeBuildReady } from '../../app/freeBuild';
import { switchOffer } from '../../shared/freeTransition';
import { readMode } from '../../data/gym/backupMeta';

/** S12 /settings/gym/disconnect: says what happens, counts what has not reached the gym, offers "Try to sync first". Personal data stays. */
export default function GymDisconnectPage() {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const cloudOn = useFeature('cloud_backup');
  const freeOn = useFeature('free_account');
  const refresh = () => void unsyncedCount().then(setN);
  useEffect(refresh, []);
  useEffect(() => {
    if (conn === null) navigate('/settings/gym', { replace: true });
  }, [conn]);

  const trySync = async () => {
    setBusy(true);
    await syncNow('manual').catch(() => undefined);
    setBusy(false);
    refresh();
  };
  const go = async () => {
    setBusy(true);
    const wasConnected = (await readMode().catch(() => 'standalone')) === 'connected';
    await disconnect();
    // Phase 80 (R10): a phone that was backing up to this gym is offered the free backup, with fresh consent.
    const hasFree = await import('../../data/gym/freeAccount').then((m) => m.readAccount()).then((a) => !!a).catch(() => false);
    const offer = switchOffer({ wasConnected, cloudBackupOn: cloudOn, freeAccountOn: freeOn, configReady: freeBuildReady(), hasFreeAccount: hasFree });
    navigate(offer ? '/settings/backup/switch' : '/settings/gym', { replace: true });
  };
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gy.disc.h')} onBack={() => navigate('/settings/gym', { replace: true })} />
      <p class="sf-st__value">{t('gy.disc.removed')}</p>
      <p class="sf-st__hint">{t('gy.disc.kept')}</p>
      {n > 0 && <p class="sf-rt__err" role="status">{t('gy.disc.waiting', { n })}</p>}
      {n > 0 && navigator.onLine && <Button variant="secondary" disabled={busy} onPress={() => void trySync()}>{t('gy.disc.try')}</Button>}
      <Button disabled={busy} onPress={() => void go()}>{n > 0 ? t('gy.disc.anyway') : t('gy.disc.go')}</Button>
      <Button variant="secondary" onPress={() => navigate('/settings/gym', { replace: true })}>{t('gy.disc.keep')}</Button>
    </section>
  );
}

import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig } from '../../app/freeBuild';
import { Button, SubPageHeader } from '../../ui/components';

/** R11 (/settings/backup/delete): removes the login, the backup and the recovery answers from the server. Everything on this phone stays. The phone forgets the account only after the server said yes. */
export default function BackupDeletePage() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [done, setDone] = useState(false);
  const back = () => navigate('/settings/backup', { replace: true });
  const go = async () => {
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    const r = await m.deleteFreeBackup({ config: freeConfig() });
    setBusy(false);
    if (r.ok) return setDone(true);
    if (r.error.goSignIn) return navigate('/settings/backup/signin');
    setErr(r.error.key as StringKey);
  };
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.del.h')} onBack={back} />
      {done ? (
        <>
          <p class="sf-st__para" role="status">{t('bk.del.done')}</p>
          <Button onPress={back}>{t('bk.back')}</Button>
        </>
      ) : (
        <>
          <p class="sf-st__para">{t('bk.del.what')}</p>
          {err && <p class="sf-st__err" role="alert">{t(err, { s: 30 })}</p>}
          <Button disabled={busy} onPress={() => void go()}>{busy ? t('bk.busy') : t('bk.del.go')}</Button>
          <Button variant="secondary" onPress={back}>{t('bk.del.keep')}</Button>
        </>
      )}
    </section>
  );
}

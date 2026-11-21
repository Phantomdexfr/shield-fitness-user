import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig } from '../../app/freeBuild';
import { Button, SubPageHeader, Toggle } from '../../ui/components';
import { GymInput } from './GymInput';

/** R5 (/settings/backup/signin): "Already have a backup?" Free id or username + password. A wrong id and a wrong password read the same. Forgot password (R7) is linked below (Phase 79). */
export default function BackupSignInPage() {
  const [, navigate] = useLocation();
  const [who, setWho] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [other, setOther] = useState(false);
  const [wait, setWait] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const back = () => navigate('/settings/backup', { replace: true });
  const go = async () => {
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    const d = { config: freeConfig() };
    const r = await m.signInFree(d, who, pw);
    setBusy(false);
    setPw('');
    if (r.ok) {
      void m.restoreAfterSignIn(d); // runs by itself; the restore page shows "n of m"
      return navigate('/settings/backup/restore', { replace: true });
    }
    if ('owner' in r) return setOther(true);
    if (r.error.retryAfter) setWait(r.error.retryAfter);
    setErr(r.error.key as StringKey);
  };
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.si.h')} onBack={back} />
      {other ? (
        <>
          <p class="sf-st__para" role="alert">{t('bk.rs.other')}</p>
          <Button variant="secondary" onPress={() => navigate('/settings/data')}>{t('bk.rs.other.go')}</Button>
        </>
      ) : (
        <>
          <GymInput label={t('bk.si.id')} value={who} autoComplete="username" autoCapitalize="none" onInput={(e) => setWho((e.target as HTMLInputElement).value)} />
          <GymInput label={t('bk.si.pw')} type={show ? 'text' : 'password'} value={pw} autoComplete="current-password" onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
          <Toggle checked={show} onChange={setShow} label={t('bk.si.show')} />
          {!online && <p class="sf-st__err" role="alert">{t('bk.offline')}</p>}
          {err && <p class="sf-st__err" role="alert">{err === 'bk.err.rate' ? t(err, { s: wait }) : t(err)}</p>}
          <Button disabled={busy || !online || wait > 0 || who.trim() === '' || pw === ''} onPress={() => void go()}>{busy ? t('bk.busy') : t('bk.si.go')}</Button>
          <Button variant="secondary" onPress={() => navigate('/settings/backup/forgot')}>{t('bk.si.forgot')}</Button>
          <Button variant="secondary" onPress={back}>{t('bk.cancel')}</Button>
        </>
      )}
    </section>
  );
}

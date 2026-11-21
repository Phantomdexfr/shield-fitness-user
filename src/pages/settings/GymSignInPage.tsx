import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader, Toggle } from '../../ui/components';
import { GymInput } from './GymInput';
import { signIn } from '../../data/repos/gymLink';
import { useConnection } from '../../data/repos/gymLink';

/** S8 /settings/gym/signin: member code or phone, password. One fixed sentence for every wrong answer. Sign-in is never forced. */
export default function GymSignInPage() {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const [who, setWho] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    if (conn === null) navigate('/settings/gym', { replace: true });
  }, [conn]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await signIn(who, pw);
    setBusy(false);
    setPw('');
    if (r.ok) return navigate(r.mustChange ? '/settings/gym/password' : '/settings/gym', { replace: true });
    if (r.retryAfter) setWait(r.retryAfter);
    setErr(r.key === 'gy.err.unknown' ? r.message || t('gy.err.unknown') : t(r.key, { s: r.retryAfter ?? 0 }));
  };
  const off = !online;
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gy.signin.h')} onBack={() => navigate('/settings/gym', { replace: true })} />
      <GymInput label={t('gy.signin.who')} value={who} autoComplete="username" autoCapitalize="characters" onInput={(e) => setWho((e.target as HTMLInputElement).value)} />
      <GymInput label={t('gy.signin.pw')} type={show ? 'text' : 'password'} value={pw} autoComplete="current-password" onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
      <Toggle checked={show} onChange={setShow} label={t('gy.signin.show')} />
      {off && <p class="sf-rt__err" role="alert">{t('gy.err.offline')}</p>}
      {err && <p class="sf-rt__err" role="alert">{wait > 0 ? t('gy.err.rate', { s: wait }) : err}</p>}
      <Button disabled={busy || off || wait > 0 || who.trim() === '' || pw === ''} onPress={() => void go()}>{busy ? t('gy.signin.busy') : t('gy.signin.go')}</Button>
      <Button variant="secondary" onPress={() => navigate('/settings/gym', { replace: true })}>{t('gy.signin.skip')}</Button>
      <p class="sf-st__hint">{t('gy.signin.note')}</p>
    </section>
  );
}

import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader } from '../../ui/components';
import { GymInput } from './GymInput';
import { changePassword } from '../../data/repos/gymLink';
import { useConnection } from '../../data/repos/gymLink';
import { passwordProblem } from '../../shared/sync';

/** S9 /settings/gym/password: the only gym screen while `must_change_password` is true. Rules in words; the server decides. */
export default function GymPasswordPage() {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setErr(null);
    if (next !== again) return setErr(t('gy.pw.nomatch'));
    const p = passwordProblem(next, '', '');
    if (p === 'weak') return setErr(t('gy.err.pw.weak'));
    setBusy(true);
    const r = await changePassword(cur, next);
    setBusy(false);
    if (r.ok) {
      setCur('');
      setNext('');
      setAgain('');
      return navigate('/settings/gym', { replace: true });
    }
    setErr(r.key === 'gy.err.unknown' ? r.message || t('gy.err.unknown') : t(r.key));
  };
  const forced = conn?.mustChangePassword === true;
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gy.pw.h')} onBack={() => navigate(forced ? '/settings' : '/settings/gym', { replace: true })} />
      {forced && <p class="sf-st__hint">{t('gy.pw.forced')}</p>}
      <p class="sf-st__hint">{t('gy.pw.rules')}</p>
      <GymInput label={t('gy.pw.current')} type="password" value={cur} autoComplete="current-password" onInput={(e) => setCur((e.target as HTMLInputElement).value)} />
      <GymInput label={t('gy.pw.new')} type="password" value={next} autoComplete="new-password" onInput={(e) => setNext((e.target as HTMLInputElement).value)} />
      <GymInput label={t('gy.pw.again')} type="password" value={again} autoComplete="new-password" onInput={(e) => setAgain((e.target as HTMLInputElement).value)} />
      {err && <p class="sf-rt__err" role="alert">{err}</p>}
      <Button disabled={busy || !cur || !next || !again} onPress={() => void go()}>{busy ? t('gy.signin.busy') : t('gy.pw.go')}</Button>
      {forced && <Button variant="secondary" onPress={() => navigate('/settings/gym/disconnect')}>{t('gy.disc.go')}</Button>}
    </section>
  );
}

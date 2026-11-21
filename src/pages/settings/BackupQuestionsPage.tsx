import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig } from '../../app/freeBuild';
import { MIN_ANSWER_CHARS, validateAnswers } from '../../shared/freeRecovery';
import { Button, SubPageHeader } from '../../ui/components';
import { GymInput } from './GymInput';

/** R3 (/settings/backup/questions): two fixed recovery prompts, required, no skip. The answers are typed here, sent once, and never kept on the phone. */
export default function BackupQuestionsPage() {
  const [, navigate] = useLocation();
  const [a1, setA1] = useState('');
  const [a2, setA2] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string[]>([]);
  const [err, setErr] = useState<StringKey | null>(null);

  const save = async () => {
    const v = validateAnswers({ p1: a1, p2: a2 });
    if (!v.ok) { setBad(v.fields); return setErr(null); }
    setBad([]);
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    const d = { config: freeConfig() };
    const r = await m.setRecoveryAnswers(d, { p1: a1, p2: a2 });
    if (!r.ok) {
      setBusy(false);
      if (r.error.goSignIn) return navigate('/settings/backup/signin', { replace: true });
      setBad(r.error.fields ?? []);
      return setErr(r.error.key as StringKey);
    }
    setA1('');
    setA2('');
    const f = await m.finishSetup(d); // the first backup; a failure leaves "Finish setting up" on R1 and the answers stay saved
    setBusy(false);
    if (!f.ok && f.error.goSignIn) return navigate('/settings/backup/signin', { replace: true });
    navigate('/settings/backup', { replace: true });
  };

  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.q.h')} onBack={() => navigate('/settings/backup', { replace: true })} />
      <p class="sf-st__para">{t('bk.q.warn')}</p>
      <GymInput label={t('bk.q.p1')} value={a1} autoComplete="off" maxLength={100} onInput={(e) => setA1((e.target as HTMLInputElement).value)} />
      {bad.includes('p1') && <p class="sf-st__err" role="alert">{t('bk.q.short', { n: MIN_ANSWER_CHARS })}</p>}
      <GymInput label={t('bk.q.p2')} value={a2} autoComplete="off" maxLength={100} onInput={(e) => setA2((e.target as HTMLInputElement).value)} />
      {bad.includes('p2') && <p class="sf-st__err" role="alert">{t('bk.q.short', { n: MIN_ANSWER_CHARS })}</p>}
      {err && <p class="sf-st__err" role="alert">{t(err)}</p>}
      <Button disabled={busy} onPress={() => void save()}>{busy ? t('bk.busy') : t('bk.q.save')}</Button>
    </section>
  );
}

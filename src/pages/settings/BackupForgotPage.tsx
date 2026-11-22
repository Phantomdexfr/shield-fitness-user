import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig } from '../../app/freeBuild';
import { MIN_ANSWER_CHARS, SESSIONS_BANDS, isLocked, validateForgot } from '../../shared/freeRecovery';
import { Button, DatePicker, Select, SubPageHeader } from '../../ui/components';
import { GymInput } from './GymInput';

/** R7 (/settings/backup/forgot): the facts the person remembers and the two answers. A person at the gym checks them; nothing resets by itself. */
export default function BackupForgotPage() {
  const [, navigate] = useLocation();
  const [who, setWho] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [band, setBand] = useState('');
  const [a1, setA1] = useState('');
  const [a2, setA2] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string[]>([]);
  const [err, setErr] = useState<StringKey | null>(null);
  const [wait, setWait] = useState(0);
  const [locked, setLocked] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void import('../../data/gym/freeAccount').then(async (m) => {
      setLocked(isLocked(await m.readForgotLock(), Date.now()));
      setOpen((await m.readTicket()) !== null);
    });
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const back = () => navigate('/settings/backup/signin', { replace: true });
  const send = async () => {
    const c = validateForgot({ identifier: who, firstMonth: first, lastMonth: last, band, answers: { p1: a1, p2: a2 } }, new Date().toISOString().slice(0, 7));
    if (!c.ok) { setBad(c.fields); return setErr('bk.err.fields'); }
    setBad([]);
    setErr(null);
    setBusy(true);
    const m = await import('../../data/gym/freeAccount');
    const r = await m.requestReset({ config: freeConfig() }, { identifier: who, firstMonth: first, lastMonth: last, band, answers: { p1: a1, p2: a2 } });
    setBusy(false);
    if (r.ok) { setA1(''); setA2(''); return navigate('/settings/backup/forgot/status', { replace: true }); }
    if (r.code === 'OPEN') return navigate('/settings/backup/forgot/status', { replace: true });
    if (r.code === 'SFE708') setLocked(true);
    if (r.error.retryAfter) setWait(r.error.retryAfter);
    if ('fields' in r && r.fields) setBad(r.fields);
    setErr(r.error.key as StringKey);
  };
  const mark = (f: string) => bad.includes(f);

  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.fp.h')} onBack={back} />
      <p class="sf-st__para">{t('bk.fp.intro')}</p>
      <GymInput label={t('bk.fp.id')} value={who} autoComplete="username" autoCapitalize="none" onInput={(e) => setWho((e.target as HTMLInputElement).value)} />
      <DatePicker mode="month" label={t('bk.fp.first')} value={first} onChange={setFirst} />
      <DatePicker mode="month" label={t('bk.fp.last')} value={last} onChange={setLast} />
      <Select label={t('bk.fp.band')} value={band} onChange={setBand} options={[{ value: '', label: t('bk.fp.pick') }, ...SESSIONS_BANDS.map((b, i) => ({ value: b as string, label: t(`bk.fp.band.${i}` as StringKey) }))]} />
      <GymInput label={t('bk.q.p1')} value={a1} autoComplete="off" maxLength={100} onInput={(e) => setA1((e.target as HTMLInputElement).value)} />
      <GymInput label={t('bk.q.p2')} value={a2} autoComplete="off" maxLength={100} onInput={(e) => setA2((e.target as HTMLInputElement).value)} />
      {(mark('p1') || mark('p2')) && <p class="sf-st__err" role="alert">{t('bk.q.short', { n: MIN_ANSWER_CHARS })}</p>}
      {err && <p class="sf-st__err" role="alert">{err === 'bk.err.rate' ? t(err, { s: wait }) : t(err)}</p>}
      {open && <p class="sf-st__hint">{t('bk.fp.open')}</p>}
      <p class="sf-st__hint">{t('bk.fp.linked')}</p>
      <Button disabled={busy || locked || wait > 0} onPress={() => void send()}>{busy ? t('bk.busy') : t('bk.fp.send')}</Button>
      <Button variant="secondary" onPress={() => navigate('/settings/backup/forgot/status')}>{t('bk.fp.have')}</Button>
    </section>
  );
}

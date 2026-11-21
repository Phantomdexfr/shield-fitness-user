import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig, freeBuildReady } from '../../app/freeBuild';
import { Button, SubPageHeader, Toggle } from '../../ui/components';

/** R10 (/settings/backup/switch): after leaving a gym, offer a free backup with FRESH consent (the R2 lines). The gym's copy is not touched. "Switch" makes the account like R2 does; nothing is created before it. */
export default function BackupSwitchPage() {
  const [, navigate] = useLocation();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ key: StringKey } | null>(null);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const later = () => navigate('/settings/gym', { replace: true });
  const go = async () => {
    if (!freeBuildReady()) return setErr({ key: 'bk.err.off' });
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    const r = await m.createFreeAccount({ config: freeConfig() });
    setBusy(false);
    if (r.ok) return navigate('/settings/backup/password', { replace: true });
    if (r.error.retryAfter) setWait(r.error.retryAfter);
    setErr({ key: r.error.key as StringKey });
  };
  const lines: StringKey[] = ['bk.consent.where', 'bk.consent.who', 'bk.consent.sent', 'bk.consent.keep', 'bk.consent.del', 'bk.consent.lost'];
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.sw.h')} onBack={later} />
      <p class="sf-st__para">{t('bk.sw.line')}</p>
      <ul class="sf-st__steps">
        {lines.map((k) => <li key={k} class="sf-st__para">{t(k)}</li>)}
      </ul>
      <Toggle checked={ok} onChange={setOk} label={t('bk.consent.tick')} />
      {err && <p class="sf-st__err" role="alert">{err.key === 'bk.err.rate' ? t('bk.err.rate', { s: wait }) : t(err.key)}</p>}
      <Button disabled={!ok || busy || wait > 0} onPress={() => void go()}>{busy ? t('bk.busy') : t('bk.sw.go')}</Button>
      <Button variant="secondary" onPress={later}>{t('bk.sw.later')}</Button>
    </section>
  );
}

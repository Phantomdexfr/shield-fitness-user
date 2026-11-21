import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader } from '../../ui/components';
import { clearPendingGym, getPendingGym } from '../../data/repos/gymPending';
import { connectToGym, type ConnectStep } from '../../data/repos/gymLink';

/** /settings/gym/confirm: the name and the server host, big. Connect runs S7 (reach, settings, version) and stores nothing unless all three pass. */
export default function GymConfirmPage() {
  const [, navigate] = useLocation();
  const p = getPendingGym();
  useEffect(() => {
    if (!p) navigate('/settings/gym/add', { replace: true });
  }, [p]);
  const [steps, setSteps] = useState<ConnectStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const connect = async () => {
    if (!p) return;
    setBusy(true);
    setErr(null);
    setSteps([]);
    const r = await connectToGym(p.config, p.host, (st) => setSteps((x) => [...x, st]));
    setBusy(false);
    if (r.ok) return navigate('/settings/gym/signin', { replace: true });
    setErr(t(r.key));
  };
  const cancel = () => {
    clearPendingGym();
    navigate('/settings/gym', { replace: true });
  };
  if (!p) return null;
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gy.confirm.h')} onBack={cancel} />
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('gy.confirm.name')}</h2>
        <p class="sf-st__value">{p.config.name}</p>
        <h2 class="sf-st__label">{t('gy.confirm.host')}</h2>
        <p class="sf-st__value" style={{ fontSize: 'var(--text-lg)', fontWeight: 700, overflowWrap: 'anywhere' }}>{p.host}</p>
        <p class="sf-st__hint">{`${t('gy.confirm.issued')}: ${p.config.issued}`}</p>
        <p class="sf-st__hint">{t('gy.confirm.nothing')}</p>
        <p class="sf-st__hint">{t('gy.confirm.trust')}</p>
      </div>
      {(busy || steps.length > 0) && (
        <ul class="sf-st__steps" aria-live="polite">
          {(['reach', 'settings', 'version'] as const).map((k) => (
            <li key={k}>{`${steps.includes(k) ? '✓' : '·'} ${t(`gy.step.${k}`)}`}</li>
          ))}
        </ul>
      )}
      {!online && <p class="sf-rt__err" role="alert">{t('gy.err.offline')}</p>}
      {err && <p class="sf-rt__err" role="alert">{err}</p>}
      <Button disabled={busy || !online} onPress={() => void connect()}>{err ? t('gy.confirm.retry') : t('gy.confirm.go')}</Button>
      <Button variant="secondary" disabled={busy} onPress={cancel}>{t('rb.cancel')}</Button>
    </section>
  );
}

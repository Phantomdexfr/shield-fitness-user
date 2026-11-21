import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, ProgressBar, SubPageHeader } from '../../ui/components';
import { uploadActions, useConnection, useUpload } from '../../data/repos/gymLink';
import { MoveToGym } from './MoveToGym';

/** /settings/gym/upload (S10): send the history made before connecting. Upload / Not now / Never, then progress with Cancel and Resume. */
export default function GymUploadPage() {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const { view, ask, loaded } = useUpload();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'finished' | 'cancelled' | 'offline' | 'idle' | null>(null);
  const stop = useRef(false);
  useEffect(() => {
    if (conn === null) navigate('/settings/gym', { replace: true });
  }, [conn]);

  const run = async () => {
    stop.current = false;
    setBusy(true);
    setOutcome(await uploadActions.run(() => stop.current).catch(() => 'idle' as const));
    setBusy(false);
  };
  // Resume on open when an upload was running (the app may have been closed in the middle).
  useEffect(() => {
    if (loaded && view?.state.running && !busy) void run();
  }, [loaded]);

  const back = () => navigate('/settings/gym', { replace: true });
  const s = view?.state;
  const p = view?.progress;
  const nothing = !!p && p.total === 0;
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gu.h')} onBack={back} />
      <MoveToGym />
      {!loaded || !view || !s || !p ? (
        <p role="status">{t('page.loading')}</p>
      ) : nothing ? (
        <p class="sf-st__para" role="status">{t('gu.nothing')}</p>
      ) : (
        <>
          <p class="sf-st__para">{t('gu.intro')}</p>
          <p class="sf-st__hint">{t('gu.what')}</p>
          {!s.running && !s.finishedAt && <p class="sf-st__value">{t('gu.count', { n: p.left })}</p>}
          {p.wifiLine && !s.running && <p class="sf-st__hint">{t('gu.wifi')}</p>}
          {(s.running || s.finishedAt) && (
            <div class="sf-st__row">
              <ProgressBar value={p.percent / 100} label={t('gu.h')} />
              <p class="sf-st__hint" role="status">{t('gu.progress', { done: p.queued, total: p.total })}</p>
            </div>
          )}
          {s.finishedAt && p.left === 0 && <p class="sf-st__para" role="status">{t('gu.done')}</p>}
          {outcome === 'offline' && <p class="sf-rt__err" role="alert">{t('gu.offline')}</p>}
          {view.failed > 0 && (
            <div class="sf-st__row">
              <p class="sf-st__hint">{t('gu.failed', { n: view.failed })}</p>
              <Button variant="secondary" onPress={() => navigate('/settings/gym/sync')}>{t('gu.failed.go')}</Button>
            </div>
          )}
          <div class="sf-st__row">
            {s.running ? (
              busy ? (
                <Button variant="secondary" onPress={() => { stop.current = true; }}>{t('gu.cancel')}</Button>
              ) : (
                <>
                  <Button onPress={() => void run()}>{t('gu.resume')}</Button>
                  <Button variant="secondary" onPress={() => void uploadActions.cancel()}>{t('gu.cancel')}</Button>
                </>
              )
            ) : !s.finishedAt ? (
              <>
                <Button onPress={() => void uploadActions.answer('upload').then(run)}>{t('gu.go')}</Button>
                {ask && <Button variant="secondary" onPress={() => void uploadActions.answer('not_now').then(back)}>{t('gu.notnow')}</Button>}
                {ask && <Button variant="secondary" onPress={() => void uploadActions.answer('never').then(back)}>{t('gu.never')}</Button>}
              </>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, ProgressBar, SubPageHeader } from '../../ui/components';
import { chunkRestoreStatus, runChunkRestoreNow, useConnection } from '../../data/repos/gymLink';
import { screenFor, type RestoreScreen } from '../../shared/restoreFlow';
import { useRestoreView } from '../../data/gym/autoRestore';
import type { Assessment } from '../../data/gym/autoRestore';
import { freeConfig } from '../../app/freeBuild';
import { readMode } from '../../data/gym/backupMeta';

/** R6 (/settings/backup/restore): bring the gym's chunk backup back to this phone. Starts by itself after sign-in when `auto_restore` allows; this page shows it, or offers the button. */
export default function BackupRestorePage() {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const live = useRestoreView();
  const [a, setA] = useState<Assessment | null>(null);
  const [screen, setScreen] = useState<RestoreScreen>('checking');
  // Phase 78: a phone in free backup mode restores from its free account (set at mount; null = not known yet).
  const [isFree, setIsFree] = useState<boolean | null>(null);
  useEffect(() => {
    void (async () => {
      setIsFree((await readMode()) === 'free_backup' && !!(await import('../../data/gym/freeAccount').then((m) => m.readAccount()).catch(() => null)));
    })();
  }, []);

  const check = async () => {
    setScreen('checking');
    const r = isFree
      ? await import('../../data/gym/freeAccount').then((m) => m.assessFree({ config: freeConfig() })).catch(() => null)
      : await chunkRestoreStatus().catch(() => null);
    if (!r) return setScreen('signin');
    setA(r);
    setScreen(screenFor(r.decision));
  };
  useEffect(() => {
    if (isFree === null) return;
    if (isFree) void check();
    else if (conn === null) navigate('/settings/gym', { replace: true });
    else if (conn) void check();
  }, [conn, isFree]);

  const run = async () => {
    if (!a) return;
    if (isFree) {
      const out = await import('../../data/gym/autoRestore').then((m) => m.runChunkRestore(a));
      if (out !== 'not_ready' && out.kind === 'paused' && out.reason === 'auth') setScreen('signin');
      return;
    }
    const r = await runChunkRestoreNow(a);
    if (r === 'not_ready') return setScreen('signin');
  };

  const running = live.s === 'running';
  const wifi = a && (a.decision.kind === 'offer' || a.decision.kind === 'start') && a.decision.wifi;
  const back = () => navigate('/settings/data');
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.rs.h')} onBack={back} />
      {screen === 'checking' && !running && <p role="status">{t('page.loading')}</p>}
      {screen === 'signin' && (
        <div class="sf-st__row">
          <p class="sf-st__para">{t(isFree ? 'bk.err.auth' : 'bk.rs.signin')}</p>
          <Button onPress={() => navigate(isFree ? '/settings/backup/signin' : '/settings/gym/signin')}>{t(isFree ? 'bk.signin' : 'gd.signin.go')}</Button>
        </div>
      )}
      {screen === 'password' && (
        <div class="sf-st__row">
          <p class="sf-st__para">{t('bk.rs.password')}</p>
          <Button onPress={() => navigate('/settings/gym/password')}>{t('gy.pw.h')}</Button>
        </div>
      )}
      {screen === 'offline' && <p class="sf-st__para" role="status">{t('bk.rs.offline')}</p>}
      {screen === 'none' && live.s !== 'done' && <p class="sf-st__para" role="status">{t('bk.rs.none')}</p>}
      {screen === 'closed' && <p class="sf-st__err" role="alert">{t('bk.rs.closed')}</p>}
      {screen === 'update' && <p class="sf-st__err" role="alert">{t('bk.rs.update')}</p>}
      {screen === 'owner' && (
        <>
          <p class="sf-st__para">{t('bk.rs.other')}</p>
          <Button variant="secondary" onPress={back}>{t('bk.rs.other.go')}</Button>
        </>
      )}
      {screen === 'offer' && !running && live.s !== 'done' && (
        <>
          <p class="sf-st__para">{t('bk.rs.offer')}</p>
          {a?.decision.kind === 'offer' && <p class="sf-st__hint">{t('bk.rs.offer.has')}</p>}
          {wifi && <p class="sf-st__hint">{t('bk.rs.wifi')}</p>}
          <Button onPress={() => void run()}>{t('bk.rs.go')}</Button>
        </>
      )}
      {(running || (screen === 'running' && live.s === 'idle')) && (
        <>
          {wifi && <p class="sf-st__hint">{t('bk.rs.wifi')}</p>}
          <p class="sf-st__para" role="status">{t('bk.rs.run', { n: running ? Math.min(live.total, live.done + 1) : 1, m: running ? live.total : a?.decision.kind === 'start' ? a.decision.parts : 1 })}</p>
          <ProgressBar value={running ? live.done / Math.max(1, live.total) : 0} label={t('bk.rs.h')} />
          <p class="sf-st__hint">{t('bk.rs.keep')}</p>
        </>
      )}
      {live.s === 'done' && (
        <>
          <p class="sf-st__para" role="status">{t('bk.rs.done')}</p>
          <p class="sf-st__hint">{t('bk.rs.notback')}</p>
          <Button onPress={back}>{t('bk.rs.back')}</Button>
        </>
      )}
      {live.s === 'paused' && (
        <>
          <p class="sf-st__err" role="alert">{t(live.why === 'auth' ? 'bk.rs.paused.auth' : 'bk.rs.paused.offline')}</p>
          <Button onPress={() => void (a ? run() : check())}>{t('bk.rs.retry')}</Button>
        </>
      )}
      {live.s === 'failed' && (
        <>
          <p class="sf-st__err" role="alert">{t(live.why === 'too_new' ? 'bk.rs.update' : 'bk.rs.failed')}</p>
          <Button onPress={() => void (a ? run() : check())}>{t('bk.rs.retry')}</Button>
        </>
      )}
    </section>
  );
}

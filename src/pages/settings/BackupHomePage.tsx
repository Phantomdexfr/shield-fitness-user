import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { freeConfig, freeBuildReady } from '../../app/freeBuild';
import { backupHomeView, type BackupHomeView, type FreeAccountRec } from '../../shared/freeAccount';
import { Button, SubPageHeader } from '../../ui/components';
import { readMode } from '../../data/gym/backupMeta';
import { liveRowCount } from '../../data/gym/restore';
import { BackupLine } from './BackupLine';
import { getConnection } from '../../data/gym/connection';

/** R1 (/settings/backup): where the backup stands and the buttons for this phone's mode (docs/GYM_CONNECTION.md P74-1). Nothing is sent from here before the opt-in. */
export default function BackupHomePage() {
  const [, navigate] = useLocation();
  const cloudOn = useFeature('cloud_backup');
  const freeOn = useFeature('free_account');
  const [view, setView] = useState<BackupHomeView | null>(null);
  const [acct, setAcct] = useState<FreeAccountRec | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [wait, setWait] = useState(0);
  const [resetAsked, setResetAsked] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [oldId, setOldId] = useState<string | null>(null);

  useEffect(() => {
    if (view?.kind !== 'free') return;
    // Phase 79: a signed-in phone that knows of an open reset request for its own account offers to cancel it.
    void import('../../data/gym/freeAccount').then(async (m) => {
      const tk = await m.readTicket();
      setResetAsked(!!tk && (await m.signedInFor(tk.identifier)));
    }).catch(() => undefined);
  }, [view]);
  useEffect(() => {
    // Phase 80: a gym-backed phone shows the member code; the free id it used before is kept here.
    if (view?.kind !== 'connected') return;
    void getConnection().then((c) => setCode(c?.memberCode ?? null)).catch(() => undefined);
    void import('../../data/gym/freeToGym').then((m) => m.readOldFreeId()).then(setOldId).catch(() => undefined);
  }, [view]);
  useEffect(() => {
    let dead = false;
    void (async () => {
      const [mode, rows] = await Promise.all([readMode(), liveRowCount()]);
      // The account store is only loaded once the phone has a free account or is about to: standalone phones stay light.
      const account = mode === 'free_backup' || mode === 'standalone' ? await import('../../data/gym/freeAccount').then((m) => m.readAccount()).catch(() => null) : null;
      if (dead) return;
      setAcct(account);
      setView(backupHomeView({ cloudBackupOn: cloudOn, freeAccountOn: freeOn, configReady: freeBuildReady(), mode, account, phoneEmpty: rows === 0 }));
    })();
    return () => { dead = true; };
  }, [cloudOn, freeOn]);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const finish = async () => {
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    if (!(await m.recoverySaved())) { setBusy(false); return navigate('/settings/backup/questions'); } // R3 comes first
    const r = await m.finishSetup({ config: freeConfig() });
    setBusy(false);
    if (r.ok) { setView({ kind: 'free' }); setAcct(await import('../../data/gym/freeAccount').then((m2) => m2.readAccount())); return; }
    if (r.error.goSignIn) return navigate('/settings/backup/signin');
    setErr(r.error.key as StringKey);
    if (r.error.retryAfter) setWait(r.error.retryAfter);
  };
  const now = async () => {
    setBusy(true);
    await import('../../data/gym/backupBoot').then((m) => m.kickBackup()).catch(() => undefined);
    setBusy(false);
  };

  const back = () => navigate('/settings/data');
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.go')} onBack={back} />
      {view?.kind === 'hidden' && <p class="sf-st__para" role="status">{t('bk.err.off')}</p>}
      {view && view.kind !== 'hidden' && <BackupLine link={false} />}
      {view?.kind === 'standalone' && (
        <>
          <p class="sf-st__hint">{t('bk.what')}</p>
          {view.canStart && view.signInFirst && (
            <>
              <Button onPress={() => navigate('/settings/backup/signin')}>{t('bk.si.first')}</Button>
              <Button variant="secondary" onPress={() => navigate('/settings/backup/consent')}>{t('bk.si.new')}</Button>
            </>
          )}
          {view.canStart && !view.signInFirst && (
            <>
              <Button onPress={() => navigate('/settings/backup/consent')}>{t('bk.go')}</Button>
              <Button variant="secondary" onPress={() => navigate('/settings/backup/signin')}>{t('bk.signin')}</Button>
            </>
          )}
        </>
      )}
      {view?.kind === 'finish' && (
        <>
          <p class="sf-st__para">{t('bk.finish.line')}</p>
          {err && <p class="sf-st__err" role="alert">{err === 'bk.err.rate' ? t(err, { s: wait }) : t(err)}</p>}
          <Button disabled={busy || wait > 0} onPress={() => void finish()}>{busy ? t('bk.busy') : t('bk.finish')}</Button>
        </>
      )}
      {view?.kind === 'free' && (
        <>
          {acct && <p class="sf-st__para">{t('bk.free.id', { id: acct.free_id })}</p>}
          <p class="sf-st__hint">{t('bk.what')}</p>
          {resetAsked && (
            <>
              <p class="sf-st__err" role="alert">{t('bk.fp.prompt')}</p>
              <Button onPress={() => navigate('/settings/backup/forgot/status')}>{t('bk.fp.cancel')}</Button>
            </>
          )}
          <Button disabled={busy} onPress={() => void now()}>{t('bk.now')}</Button>
          <Button variant="secondary" onPress={() => navigate('/settings/backup/restore')}>{t('bk.restore')}</Button>
          <Button variant="secondary" onPress={() => navigate('/settings/backup/delete')}>{t('bk.del.go')}</Button>
        </>
      )}
      {view?.kind === 'connected' && (
        <>
          <p class="sf-st__para">{t('bk.gym.line')}</p>
          {code && <p class="sf-st__para">{t('bk.id.member', { code })}</p>}
          {oldId && <p class="sf-st__hint">{t('bk.id.old', { id: oldId })}</p>}
          <Button disabled={busy} onPress={() => void now()}>{t('bk.now')}</Button>
          <Button variant="secondary" onPress={() => navigate('/settings/backup/restore')}>{t('bk.restore')}</Button>
        </>
      )}
    </section>
  );
}

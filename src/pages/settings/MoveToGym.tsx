import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button } from '../../ui/components';
import { syncNow } from '../../data/repos/gymLink';
import type { MoveScreen } from '../../data/gym/freeToGym';

/** R12 "Move to my gym": inline on the gym screens while this phone still backs up to a free account. Renders nothing for everyone else (one stored row is read). */
export function MoveToGym() {
  const [, navigate] = useLocation();
  const [s, setS] = useState<MoveScreen | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => setS(await import('../../data/gym/freeToGym').then((m) => m.readMoveScreen()).catch(() => null));
  useEffect(() => { void load(); }, []);
  if (!s || s.view === 'hidden') return null;
  const act = async (fn: (m: typeof import('../../data/gym/freeToGym')) => Promise<void>, sync = false) => {
    setBusy(true);
    await import('../../data/gym/freeToGym').then(fn).catch(() => undefined);
    if (sync) await syncNow('manual').catch(() => undefined);
    await load();
    setBusy(false);
  };
  const fail: StringKey | null = s.failCode && s.failCode !== 'RESTORE_FIRST' ? 'bk.mv.fail' : null;
  return (
    <div class="sf-st__row">
      <h2 class="sf-st__label">{t('bk.mv.h')}</h2>
      {s.view === 'ask' && (
        <>
          <p class="sf-st__value">{t('bk.mv.own')}</p>
          <p class="sf-st__hint">{t('bk.mv.own.hint')}</p>
          <Button disabled={busy} onPress={() => void act((m) => m.answerMine(true))}>{t('bk.mv.yes')}</Button>
          <Button variant="secondary" disabled={busy} onPress={() => void act((m) => m.answerMine(false))}>{t('bk.mv.no')}</Button>
        </>
      )}
      {s.view === 'other' && <p class="sf-st__para" role="status">{t('bk.mv.other')}</p>}
      {(s.view === 'consent' || s.view === 'waiting' || s.view === 'restore_first') && (
        <>
          <p class="sf-st__para">{t('bk.mv.line')}</p>
          <p class="sf-st__hint">{t('bk.mv.warn')}</p>
          <p class="sf-st__hint">{t('bk.mv.consent')}</p>
        </>
      )}
      {s.view === 'consent' && <Button disabled={busy} onPress={() => void act((m) => m.agreeMove(), true)}>{t('bk.mv.go')}</Button>}
      {s.view === 'waiting' && <p class="sf-st__hint" role="status">{t('bk.mv.waiting')}</p>}
      {s.view === 'restore_first' && (
        <>
          <p class="sf-st__err" role="alert">{t('bk.mv.first')}</p>
          <Button onPress={() => navigate('/settings/backup/restore')}>{t('bk.mv.first.go')}</Button>
        </>
      )}
      {s.view === 'kept' && <p class="sf-st__hint" role="status">{t('bk.mv.kept')}</p>}
      {fail && s.view !== 'kept' && <p class="sf-st__err" role="alert">{t(fail)}</p>}
    </div>
  );
}

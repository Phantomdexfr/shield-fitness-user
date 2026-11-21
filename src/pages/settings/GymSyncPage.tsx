import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader } from '../../ui/components';
import { listOutbox } from '../../data/local';
import type { OutboxRow } from '../../data/local';
import { retryFailed, syncNow } from '../../data/repos/gymLink';
import { useChip } from '../../data/repos/gymLink';
import { istTime } from '../../data/repos/gymLink';

const TABLE_LABEL: Record<string, string> = {
  sessions: 'gy.sync.t.sessions',
  routines: 'gy.sync.t.routines',
  customExercises: 'gy.sync.t.custom',
  favourites: 'gy.sync.t.favs',
  marks: 'gy.sync.t.marks',
  bodyStats: 'gy.sync.t.body',
  goals: 'gy.sync.t.goals',
  intake: 'gy.sync.t.intake',
};

/** The Pending screen /settings/gym/sync: what waits, what failed and why (plain words), Retry and Sync now. Nothing is dropped silently. */
export default function GymSyncPage() {
  const [, navigate] = useLocation();
  const chip = useChip();
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => void listOutbox().then(setRows);
  useEffect(load, [chip?.kind]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn().catch(() => undefined);
    setBusy(false);
    load();
  };
  const failed = rows.filter((r) => r.status === 'failed');
  const waiting = rows.filter((r) => r.status === 'pending');
  const label = (r: OutboxRow) => t((TABLE_LABEL[r.table] ?? 'gy.sync.t.other') as never);
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gy.sync.h')} onBack={() => navigate('/settings/gym', { replace: true })} />
      {chip?.kind === 'attention' && chip.reason === 'signin' && (
        <>
          <p class="sf-rt__err" role="alert">{t('gy.sync.signin')}</p>
          <Button onPress={() => navigate('/settings/gym/signin')}>{t('gy.signin.go')}</Button>
        </>
      )}
      {chip?.kind === 'attention' && chip.reason === 'version' && <p class="sf-rt__err" role="alert">{t('gy.err.version')}</p>}
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('gy.sync.waiting')}</h2>
        <p class="sf-st__value">{waiting.length === 0 ? t('gy.sync.none') : t('gy.sync.n', { n: waiting.length })}</p>
        {chip?.kind === 'idle' && chip.lastSyncedAt && <p class="sf-st__hint">{t('gy.chip.synced', { time: istTime(chip.lastSyncedAt) })}</p>}
      </div>
      {failed.length > 0 && (
        <div class="sf-st__row">
          <h2 class="sf-st__label">{t('gy.sync.failed')}</h2>
          {failed.map((r) => (
            <p key={r.id} class="sf-st__hint">{`${label(r)}: ${r.reason ?? t('gy.err.unknown')}`}</p>
          ))}
          <Button variant="secondary" disabled={busy} onPress={() => void run(retryFailed)}>{t('gy.sync.retry')}</Button>
        </div>
      )}
      <Button disabled={busy} onPress={() => void run(() => syncNow('manual'))}>{t('gy.sync.now')}</Button>
    </section>
  );
}

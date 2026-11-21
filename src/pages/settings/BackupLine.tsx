import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { Button } from '../../ui/components';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { backupLine, type BackupLineInput } from '../../shared/backupPlan';
import { useBackupLive } from '../../data/gym/backupState';
import { readDirty, readLast, readMode, readRestoreRec } from '../../data/gym/backupMeta';
import { istTime } from '../../data/repos/gymLink';

/** R13: one status line for the backup (docs/GYM_CONNECTION.md P74-3). Hidden while `cloud_backup` is off. Amber past about 7 days online. */
export function BackupLine({ link = true }: { link?: boolean } = {}) {
  const [, navigate] = useLocation();
  const on = useFeature('cloud_backup');
  const live = useBackupLive();
  const [i, setI] = useState<BackupLineInput | null>(null);
  useEffect(() => {
    if (!on) return;
    let dead = false;
    void (async () => {
      const [mode, dirty, last, rest] = await Promise.all([readMode(), readDirty(), readLast(), readRestoreRec()]);
      if (dead) return;
      setI({ mode, featureOn: on, online: live.online && (typeof navigator === 'undefined' || navigator.onLine !== false), saving: live.saving, restoring: rest?.status === 'running' || !!live.restoring, dirty: dirty.length, okAt: last?.ok_at ?? null, errorCode: last?.error_code, now: Date.now() });
    })();
    return () => { dead = true; };
  }, [on, live]);
  if (!on || !i) return null;
  const line = backupLine(i);
  const text = line.key === 'bk.state.ok' && line.amber ? t('bk.state.ok.old', { time: istTime(line.at!) })
    : line.key === 'bk.state.ok' ? t('bk.state.ok', { time: istTime(line.at!) })
    : line.key === 'bk.state.restoring' ? t(line.key, { done: live.restoring?.done ?? 0, total: live.restoring?.total ?? 0 })
    : t(line.key);
  return (
    <div class="sf-st__row">
      <h2 class="sf-st__label">{t('bk.h')}</h2>
      <p class={line.amber || line.key === 'bk.state.attn' || line.key === 'bk.state.blocked' || line.key === 'bk.state.update' ? 'sf-st__err' : 'sf-st__hint'} role="status">{text}</p>
      {link && <Button variant="secondary" onPress={() => navigate('/settings/backup')}>{t('bk.go')}</Button>}
    </div>
  );
}

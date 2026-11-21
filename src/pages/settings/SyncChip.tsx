import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { useChip } from '../../data/repos/gymLink';
import { istTime } from '../../data/repos/gymLink';
import { Pressable } from '../../ui/components';

/** The quiet sync chip (SYNC_SPEC). Only when connected; tap opens the Sync screen. Standalone renders nothing. */
export function SyncChip() {
  const [, navigate] = useLocation();
  const chip = useChip();
  if (!chip) return null;
  let text: string;
  if (chip.kind === 'syncing') text = t('gy.chip.syncing');
  else if (chip.kind === 'offline') text = t('gy.chip.offline', { n: chip.waiting });
  else if (chip.kind === 'backing_up') text = t('bk.state.saving');
  else if (chip.kind === 'attention' && chip.reason === 'backup_update') text = t('bk.state.update');
  else if (chip.kind === 'attention' && chip.reason === 'backup_blocked') text = t('bk.state.blocked');
  else if (chip.kind === 'attention') text = t('gy.chip.attention');
  else text = chip.lastSyncedAt ? t('gy.chip.synced', { time: istTime(chip.lastSyncedAt) }) : t('gy.chip.idle');
  return (
    <Pressable class={`sf-syncchip sf-syncchip--${chip.kind}`} onPress={() => navigate('/settings/gym/sync')} aria-label={text}>
      <span role="status">{text}</span>
    </Pressable>
  );
}

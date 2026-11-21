// Phase 78: app start for a phone in `free_backup` mode. Reads one stored row; a standalone phone (the default) stops here and never
// loads the free-account client. Called from main.tsx after the policy cache is read.
import { getDb } from '../local';
import { freeConfig } from '../../app/freeBuild';

export async function initFreeBackup(): Promise<void> {
  const mode = (await (await getDb()).get('meta', 'backup:mode'))?.value;
  if (mode !== 'free_backup') return;
  const m = await import('./freeAccount');
  await m.initFreeBackup({ config: freeConfig() });
}

import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button } from '../../ui/components';
import { proposeToGym, useConnection, useProposals } from '../../data/repos/gymLink';

/** "Propose to gym" on one of the member's own exercises. Only shown when connected and signed in. Works offline (queued, sent on the next sync). */
export function ProposeToGym({ slug }: { slug: string }) {
  const { conn } = useConnection();
  const list = useProposals();
  const [busy, setBusy] = useState(false);
  if (!conn || !conn.signedIn || conn.mustChangePassword || !slug.startsWith('my-')) return null;
  const mine = list.find((p) => p.slug === slug);
  if (mine) return <p class="sf-lib__note" role="status">{mine.sentAt ? t('gp.proposed') : t('gp.proposed.wait')}</p>;
  return (
    <div class="sf-st__row">
      <p class="sf-st__hint">{t('gp.propose.h')}</p>
      <Button variant="secondary" disabled={busy} onPress={() => { setBusy(true); void proposeToGym(slug).then(() => setBusy(false), () => setBusy(false)); }}>{t('gp.propose')}</Button>
    </div>
  );
}

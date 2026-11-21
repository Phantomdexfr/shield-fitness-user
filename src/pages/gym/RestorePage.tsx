import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, ProgressBar, SubPageHeader } from '../../ui/components';
import { restoreStatus, runRestoreNow, useConnection } from '../../data/repos/gymLink';

type View =
  | { s: 'checking' }
  | { s: 'signin' }
  | { s: 'nothing' }
  | { s: 'offer'; shrunk: boolean }
  | { s: 'owner' }
  | { s: 'running'; step: number; of: number }
  | { s: 'done'; added: number; replaced: number }
  | { s: 'failed'; why: 'offline' | 'auth' | 'server' };

/** /gym/restore: bring the gym's copy of my data back to this phone. Merges, never deletes, never pushes while it runs. */
export default function RestorePage() {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const [v, setV] = useState<View>({ s: 'checking' });

  const check = async () => {
    setV({ s: 'checking' });
    const r = await restoreStatus().catch(() => null);
    if (!r || !r.signedIn) return setV({ s: 'signin' });
    if (r.verdict === 'different_owner') return setV({ s: 'owner' });
    if (r.verdict === 'restore_offer' || r.verdict === 'block_push') return setV({ s: 'offer', shrunk: r.verdict === 'block_push' });
    setV({ s: 'nothing' });
  };
  useEffect(() => {
    if (conn === null) navigate('/settings/gym', { replace: true });
    else if (conn) void check();
  }, [conn]);

  const run = async () => {
    setV({ s: 'running', step: 0, of: 1 });
    const r = await runRestoreNow((p) => setV({ s: 'running', step: p.step, of: p.of })).catch(() => ({ ok: false as const, added: 0, replaced: 0, error: 'server' as const }));
    if (r === 'not_ready') return setV({ s: 'signin' });
    if (r.ok) return setV({ s: 'done', added: r.added, replaced: r.replaced });
    setV({ s: 'failed', why: r.error ?? 'server' });
  };

  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('rs.h')} onBack={() => navigate('/gym')} />
      {v.s === 'checking' && <p role="status">{t('page.loading')}</p>}
      {v.s === 'signin' && (
        <div class="sf-st__row">
          <p class="sf-st__para">{t('rs.signin')}</p>
          <Button onPress={() => navigate('/settings/gym/signin')}>{t('gd.signin.go')}</Button>
        </div>
      )}
      {v.s === 'nothing' && <p class="sf-st__para" role="status">{t('rs.nothing')}</p>}
      {v.s === 'offer' && (
        <>
          <p class="sf-st__para">{t(v.shrunk ? 'rs.shrunk' : 'rs.empty')}</p>
          <p class="sf-st__hint">{t('rs.what')}</p>
          <Button onPress={() => void run()}>{t('rs.go')}</Button>
        </>
      )}
      {v.s === 'owner' && (
        <>
          <p class="sf-st__para">{t('rs.owner')}</p>
          <Button variant="secondary" onPress={() => navigate('/settings/data')}>{t('rs.owner.go')}</Button>
        </>
      )}
      {v.s === 'running' && (
        <>
          <p class="sf-st__para" role="status">{t('rs.running', { n: Math.max(1, v.step), m: v.of })}</p>
          <ProgressBar value={v.step / Math.max(1, v.of)} label={t('rs.h')} />
          <p class="sf-st__hint">{t('rs.keep')}</p>
        </>
      )}
      {v.s === 'done' && (
        <>
          <p class="sf-st__para" role="status">{t('rs.done', { n: v.added + v.replaced })}</p>
          <p class="sf-st__hint">{t('rs.notback')}</p>
          <Button onPress={() => navigate('/gym')}>{t('rs.back')}</Button>
        </>
      )}
      {v.s === 'failed' && (
        <>
          <p class="sf-st__para" role="alert">{t(v.why === 'offline' ? 'rs.err.offline' : v.why === 'auth' ? 'rs.err.auth' : 'rs.err.server')}</p>
          <Button onPress={() => void run()}>{t('rs.retry')}</Button>
        </>
      )}
    </section>
  );
}

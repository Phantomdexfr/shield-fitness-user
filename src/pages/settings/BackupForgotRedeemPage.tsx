import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig } from '../../app/freeBuild';
import { Button, SubPageHeader, Toggle } from '../../ui/components';

/**
 * R9 (/settings/backup/forgot/redeem): the phone makes a NEW password and shows it once. The person ticks "I saved it" BEFORE
 * "Set this password" [A-P79.3]: the ticket works once, so a password nobody saved must never be set. The password lives in memory only.
 */
export default function BackupForgotRedeemPage() {
  const [, navigate] = useLocation();
  const [pw, setPw] = useState<string | null>(null);
  const [tk, setTk] = useState<{ identifier: string; code: string } | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [note, setNote] = useState<StringKey | null>(null);

  useEffect(() => {
    void import('../../data/gym/freeAccount').then(async (m) => {
      setTk(await m.readTicket());
      setPw(m.newResetPassword({ config: freeConfig() }));
    });
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(pw ?? ''); setNote('bk.pw.copied'); } catch { setNote(null); }
  };
  const set = async () => {
    if (!tk || !pw) return;
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    const r = await m.redeemReset({ config: freeConfig() }, tk.identifier, tk.code, pw);
    setBusy(false);
    if (r.ok) { setPw(null); return setDone(true); }
    setErr(r.error.key as StringKey);
    if (r.code === 'SFE710') navigate('/settings/backup/forgot/status', { replace: true });
  };

  if (done) {
    return (
      <section class="sf-page-body sf-st">
        <SubPageHeader title={t('bk.fp.nh')} onBack={() => navigate('/settings/backup/signin', { replace: true })} />
        <p class="sf-st__ok" role="status">{t('bk.fp.done')}</p>
        <Button onPress={() => navigate('/settings/backup/signin', { replace: true })}>{t('bk.fp.signin')}</Button>
      </section>
    );
  }
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.fp.nh')} onBack={() => navigate('/settings/backup/forgot/status', { replace: true })} />
      {tk === null ? (
        <>
          <p class="sf-st__para" role="status">{t('bk.err.noticket')}</p>
          <Button onPress={() => navigate('/settings/backup/forgot/status', { replace: true })}>{t('bk.back')}</Button>
        </>
      ) : (
        <>
          <p class="sf-st__err" role="alert">{t('bk.fp.nwarn')}</p>
          <p class="sf-st__title" style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }} data-testid="reset-password">{pw ?? ''}</p>
          <Button variant="secondary" onPress={() => void copy()}>{t('bk.pw.copy')}</Button>
          {note && <p class="sf-st__ok" role="status">{t(note)}</p>}
          <Toggle checked={saved} onChange={setSaved} label={t('bk.pw.tick')} />
          {err && <p class="sf-st__err" role="alert">{t(err)}</p>}
          <Button disabled={!saved || busy || !pw} onPress={() => void set()}>{busy ? t('bk.busy') : t('bk.fp.set')}</Button>
        </>
      )}
    </section>
  );
}

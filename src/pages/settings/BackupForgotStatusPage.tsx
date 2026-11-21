import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { freeConfig } from '../../app/freeBuild';
import { formatIst, parseIso } from '../../shared/dates';
import { ticketView, type ResetStatus, type TicketRec, type TicketView } from '../../shared/freeRecovery';
import { Button, SubPageHeader } from '../../ui/components';
import { GymInput } from './GymInput';

const shownDate = (iso: string | null): string => {
  const ms = iso ? parseIso(iso) : null;
  return ms === null ? '' : formatIst(ms);
};

/** R8 (/settings/backup/forgot/status): the ticket code and where the request stands. By the stored ticket, or by typing the id and code. */
export default function BackupForgotStatusPage() {
  const [, navigate] = useLocation();
  const [tk, setTk] = useState<TicketRec | null>(null);
  const [who, setWho] = useState('');
  const [code, setCode] = useState('');
  const [view, setView] = useState<TicketView | null>(null);
  const [same, setSame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<StringKey | null>(null);
  const [err, setErr] = useState<StringKey | null>(null);
  const [wait, setWait] = useState(0);

  const look = async (id: string, c: string, createdAt: number) => {
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    const r = await m.checkReset({ config: freeConfig() }, id, c);
    setBusy(false);
    if (!r.ok) { if (r.error.retryAfter) setWait(r.error.retryAfter); return setErr(r.error.key as StringKey); }
    const mine = await m.signedInFor(id);
    setSame(mine);
    setTk(await m.readTicket());
    setView(ticketView({ status: r.status, readyAfter: r.readyAfter, redeemUntil: r.redeemUntil }, { now: Date.now(), createdAt, signedInSameAccount: mine }));
  };
  useEffect(() => {
    void import('../../data/gym/freeAccount').then(async (m) => {
      const s = await m.readTicket();
      setTk(s);
      if (s) { setSame(await m.signedInFor(s.identifier)); void look(s.identifier, s.code, s.createdAt); }
    });
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const cancel = async () => {
    if (!tk) return;
    setBusy(true);
    setErr(null);
    const m = await import('../../data/gym/freeAccount');
    const r = await m.cancelReset({ config: freeConfig() }, tk.code);
    setBusy(false);
    if (r.ok) { setNote('bk.fp.cancelled'); setTk(null); return setView(ticketView({ status: 'cancelled' as ResetStatus }, { now: Date.now(), createdAt: Date.now(), signedInSameAccount: false })); }
    if (r.error.goSignIn) return navigate('/settings/backup/signin');
    if (r.code === 'SFE709') setTk(null);
    setErr(r.error.key as StringKey);
  };

  const id = tk?.identifier ?? who;
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('bk.fp.sh')} onBack={() => navigate('/settings/backup/signin', { replace: true })} />
      {tk ? (
        <>
          <p class="sf-st__title" style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }} data-testid="ticket-code">{t('bk.fp.ticket', { code: tk.code })}</p>
          <p class="sf-st__hint">{t('bk.fp.keep')}</p>
        </>
      ) : (
        <>
          <GymInput label={t('bk.fp.id')} value={who} autoCapitalize="none" onInput={(e) => setWho((e.target as HTMLInputElement).value)} />
          <GymInput label={t('bk.fp.code')} value={code} autoCapitalize="characters" onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        </>
      )}
      {view && <p class="sf-st__para" role="status">{t(view.key as StringKey, { date: shownDate(view.date) })}</p>}
      {note && !view && <p class="sf-st__ok" role="status">{t(note)}</p>}
      {same && view?.canCancel && <p class="sf-st__err" role="alert">{t('bk.fp.prompt')}</p>}
      <p class="sf-st__hint">{t('bk.fp.linked')}</p>
      {err && <p class="sf-st__err" role="alert">{err === 'bk.err.rate' ? t(err, { s: wait }) : t(err)}</p>}
      {view?.canRedeem && <Button onPress={() => navigate('/settings/backup/forgot/redeem')}>{t('bk.fp.new')}</Button>}
      {(!view || view.canCheck) && <Button variant="secondary" disabled={busy || wait > 0 || (!tk && (who.trim() === '' || code.trim() === ''))} onPress={() => void look(id, tk?.code ?? code, tk?.createdAt ?? Date.now())}>{busy ? t('bk.busy') : t('bk.fp.check')}</Button>}
      {view?.canCancel && <Button variant="secondary" disabled={busy} onPress={() => void cancel()}>{t('bk.fp.cancel')}</Button>}
      {view && !view.open && <Button variant="secondary" onPress={() => navigate(view.status === 'redeemed' ? '/settings/backup/signin' : '/settings/backup/forgot')}>{view.status === 'redeemed' ? t('bk.fp.signin') : t('bk.fp.send')}</Button>}
    </section>
  );
}

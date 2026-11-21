import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, Input, Select, Sheet, showToast } from '../../ui/components';
import { listRoutines } from '../../data/repos/routines';
import { envelopeFor } from '../../data/repos/planShare';
import { cancelShare, pollShare, startShare, type FlowEnv, type PollEnd, type StartError } from '../../data/relay/shareFlow';
import { secretToCode, shareLink } from '../../shared/planShare/secret';
import type { Routine } from '../../shared/routine';
import { QrSvg } from './qr';
import { clock, useCountdown } from './useCountdown';

const env = (): FlowEnv => ({ relay: {}, random: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), contractMajor: 1 });

type Phase =
  | { k: 'form' }
  | { k: 'busy' }
  | { k: 'live'; id: string; code: string; link: string; endMs: number }
  | { k: 'end'; why: PollEnd | StartError | 'empty' };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Share plan: choose a routine (default: the one given, else the active one), optional name and note, then QR / link / code for 3 minutes. */
export function SharePlanSheet({ open, onClose, routineId }: { open: boolean; onClose: () => void; routineId?: string }) {
  const [, navigate] = useLocation();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [pick, setPick] = useState('');
  const [from, setFrom] = useState('');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>({ k: 'form' });
  const cancelled = useRef(false);
  const live = phase.k === 'live' ? phase : null;
  const left = useCountdown(live ? live.endMs : null);

  useEffect(() => {
    if (!open) return;
    cancelled.current = false;
    setPhase({ k: 'form' });
    listRoutines().then((all) => {
      const list = all.filter((r) => !r.archived);
      setRoutines(list);
      setPick(routineId && list.some((r) => r.id === routineId) ? routineId : (list.find((r) => r.active) ?? list[0])?.id ?? '');
    }, () => setRoutines([]));
  }, [open]);

  const start = async () => {
    cancelled.current = false;
    setPhase({ k: 'busy' });
    const built = await envelopeFor(pick, from, note).catch(() => null);
    if (!built) return setPhase({ k: 'end', why: 'empty' });
    const e = env();
    const r = await startShare(e, built.envelope);
    if (!r.ok) return setPhase({ k: 'end', why: r.error });
    const base = `${location.origin}${import.meta.env.BASE_URL}`;
    setPhase({ k: 'live', id: r.value.id, code: secretToCode(r.value.secret), link: shareLink(base, r.value.secret), endMs: r.value.expiresAtMs });
    const end = await pollShare(r.value.id, e.relay, { sleep, now: () => Date.now(), expiresAtMs: r.value.expiresAtMs, isCancelled: () => cancelled.current });
    if (!cancelled.current) setPhase({ k: 'end', why: end });
  };

  const cancel = () => {
    cancelled.current = true;
    if (live) void cancelShare(live.id, {});
    onClose();
  };
  const close = () => (live ? cancel() : onClose());

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => showToast(t('ps.copied')), () => showToast(t('ps.copy.fail')));
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Sheet open={open} onClose={close} title={t('ps.share.title')}>
      <div class="sf-rt__menu">
        {phase.k === 'form' && (
          routines.length === 0 ? (
            <p class="sf-rt__meta" role="status">{t('ps.share.none')}</p>
          ) : (
            <>
              <Select label={t('ps.share.which')} value={pick} options={routines.map((r) => ({ value: r.id, label: r.name }))} onChange={setPick} />
              <Input label={t('ps.share.from')} hint={t('ps.share.from.hint')} {...{ value: from, maxLength: 30 }} onInput={(e) => setFrom((e.target as HTMLInputElement).value)} />
              <Input label={t('ps.share.note')} {...{ value: note, maxLength: 200 }} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
              <p class="sf-rt__meta">{t('ps.share.what')}</p>
              <Button variant="ghost" onPress={() => { onClose(); navigate('/settings/privacy'); }}>{t('ps.share.privacy')}</Button>
              <Button disabled={!pick} onPress={() => void start()}>{t('ps.share.go')}</Button>
            </>
          )
        )}
        {phase.k === 'busy' && <p class="sf-rt__meta" role="status">{t('ps.share.busy')}</p>}
        {live && (
          <>
            <QrSvg text={live.link} />
            <p class="sf-ps__count" role="timer" aria-label={t('ps.share.left')}>{clock(left)}</p>
            <p class="sf-rt__meta" role="status">{t('ps.share.waiting')}</p>
            <p class="sf-ps__code" aria-label={t('ps.share.code')}>{live.code}</p>
            <p class="sf-ps__link">{live.link}</p>
            <Button variant="secondary" icon="copy" onPress={() => void copy(live.link)}>{t('ps.share.copy')}</Button>
            {canShare && <Button variant="secondary" icon="export" onPress={() => void navigator.share({ url: live.link, title: t('ps.share.title') }).catch(() => undefined)}>{t('ps.share.system')}</Button>}
            <Button variant="danger" onPress={cancel}>{t('ps.share.cancel')}</Button>
          </>
        )}
        {phase.k === 'end' && (
          <>
            <p class={phase.why === 'delivered' ? 'sf-ps__ok' : 'sf-rt__err'} role="status">{t(`ps.end.${phase.why}` as never)}</p>
            {phase.why !== 'delivered' && phase.why !== 'not_configured' && phase.why !== 'empty' && <Button onPress={() => setPhase({ k: 'form' })}>{t('ps.share.again')}</Button>}
            <Button variant="secondary" onPress={onClose}>{t('rb.w.done')}</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Badge, Button, Card, EmptyState, Input, SubPageHeader } from '../../ui/components';
import { relayAvailable } from '../../data/relay/client';
import { receivePlan, type FlowEnv, type ReceiveError } from '../../data/relay/shareFlow';
import { prepareImport, savePlan, CONTRACT_MAJOR } from '../../data/repos/planShare';
import { newClientId } from '../../data/local';
import { codeToSecret, secretFromLink } from '../../shared/planShare/secret';
import type { ImportPlan, PlanEnvelope } from '../../shared/planShare/envelope';
import { muscleLabel } from '../exercise/muscleLabel';
import { Scanner } from './Scanner';
import { goBack } from '../../app/navBack';

const env = (): FlowEnv => ({ relay: {}, random: (n) => globalThis.crypto.getRandomValues(new Uint8Array(n)), contractMajor: CONTRACT_MAJOR });

type View =
  | { k: 'start' }
  | { k: 'scan' }
  | { k: 'busy' }
  | { k: 'preview'; plan: ImportPlan; env: PlanEnvelope }
  | { k: 'saving' }
  | { k: 'fail'; why: ReceiveError | 'save' };

/** `/share`: receive a plan. The link's `#secret` is read from this device only. Nothing is sent until the person taps Get plan. */
export default function ReceivePage() {
  const [, navigate] = useLocation();
  const [typed, setTyped] = useState('');
  const [typedErr, setTypedErr] = useState<string | null>(null);
  const [fromLink, setFromLink] = useState<Uint8Array | null>(null);
  const [view, setView] = useState<View>({ k: 'start' });
  const back = () => goBack(navigate, '/routines');

  useEffect(() => {
    const s = location.hash.length > 1 ? secretFromLink(location.hash) : null;
    if (s && s.ok) setFromLink(s.value);
    else if (location.hash.length > 1) setTypedErr(t('ps.err.code'));
  }, []);

  const get = async (secret: Uint8Array) => {
    setView({ k: 'busy' });
    const r = await receivePlan(env(), secret);
    if (!r.ok) return setView({ k: 'fail', why: r.error });
    try {
      setView({ k: 'preview', env: r.value, plan: await prepareImport(r.value, newClientId) });
    } catch {
      setView({ k: 'fail', why: 'save' });
    }
  };

  const typedGet = () => {
    const s = codeToSecret(typed);
    if (!s.ok) return setTypedErr(t('ps.err.code'));
    setTypedErr(null);
    void get(s.value);
  };

  const add = async (active: boolean) => {
    if (view.k !== 'preview') return;
    const { plan } = view;
    setView({ k: 'saving' });
    try {
      navigate(`/routine/${await savePlan(plan, active)}`);
    } catch {
      setView({ k: 'fail', why: 'save' });
    }
  };

  const header = <SubPageHeader title={t('ps.recv.title')} onBack={back} />;

  if (!relayAvailable()) return <section class="sf-page-body sf-rt">{header}<EmptyState icon="info" title={t('ps.err.not_configured')} /></section>;

  if (view.k === 'busy' || view.k === 'saving') return <section class="sf-page-body sf-rt">{header}<p class="sf-lib__note" role="status">{t(view.k === 'busy' ? 'ps.recv.busy' : 'ps.recv.saving')}</p></section>;

  if (view.k === 'fail')
    return (
      <section class="sf-page-body sf-rt">
        {header}
        <p class="sf-rt__err" role="alert">{t(`ps.err.${view.why}` as never)}</p>
        <Button variant="secondary" onPress={() => { setFromLink(null); setView({ k: 'start' }); }}>{t('ps.recv.again')}</Button>
      </section>
    );

  if (view.k === 'preview') {
    const { plan, env: e } = view;
    const f = plan.flags;
    const items = e.routine.days.reduce((n, d) => n + d.items.length, 0);
    return (
      <section class="sf-page-body sf-rt">
        {header}
        <Card tone="raised" class="sf-ps__prev">
          <span class="sf-rt__name">{plan.routine.name}</span>
          {e.from && <span class="sf-rt__meta">{t('ps.prev.from', { name: e.from })}</span>}
          {e.note && <p class="sf-ps__note">{e.note}</p>}
          <span class="sf-rt__meta">{t('rb.days', { n: e.routine.days.length })} · {t('rb.w.items', { n: items })}</span>
          {e.routine.schedule && <Badge tone="neutral">{t('ps.prev.schedule')}</Badge>}
        </Card>
        <ul class="sf-rt__list">
          {e.routine.days.map((d, i) => (
            <li key={i} class="sf-rt__vol">
              <span class="sf-rt__name">{d.name}</span>
              <span class="sf-rt__meta">{d.items.length === 0 ? t('rb.w.noitems') : t('rb.w.items', { n: d.items.length })}{d.targetMuscles.length ? ` · ${d.targetMuscles.map(muscleLabel).join(', ')}` : ''}</span>
            </li>
          ))}
        </ul>
        {f.unavailable.length > 0 && <p class="sf-rt__err" role="status">{t('ps.flag.unavailable', { n: f.unavailable.length })}</p>}
        {f.hidden.length > 0 && <p class="sf-rt__err" role="status">{t('ps.flag.hidden', { n: f.hidden.length })}</p>}
        {f.customAdded > 0 && <p class="sf-rt__meta" role="status">{t('ps.flag.custom', { n: f.customAdded })}</p>}
        <Button onPress={() => void add(false)}>{t('ps.prev.add')}</Button>
        <Button variant="secondary" onPress={() => void add(true)}>{t('ps.prev.active')}</Button>
        <Button variant="secondary" onPress={back}>{t('ps.prev.discard')}</Button>
      </section>
    );
  }

  if (view.k === 'scan') return <section class="sf-page-body sf-rt">{header}<Scanner onSecret={(s) => void get(s)} onClose={() => setView({ k: 'start' })} /></section>;

  return (
    <section class="sf-page-body sf-rt">
      {header}
      <p class="sf-rt__meta">{t('ps.recv.hint')}</p>
      {fromLink && <Button onPress={() => void get(fromLink)}>{t('ps.recv.get')}</Button>}
      <Button variant={fromLink ? 'secondary' : 'primary'} onPress={() => setView({ k: 'scan' })}>{t('ps.recv.scan')}</Button>
      <Input label={t('ps.recv.type')} error={typedErr ?? undefined} {...{ value: typed, placeholder: 'XXXX-XXXX-XXXX-XXXX', autoCapitalize: 'characters', autoComplete: 'off', spellcheck: false }} onInput={(e) => { setTyped((e.target as HTMLInputElement).value); setTypedErr(null); }} />
      <Button variant="secondary" disabled={typed.trim() === ''} onPress={typedGet}>{t('ps.recv.get')}</Button>
    </section>
  );
}

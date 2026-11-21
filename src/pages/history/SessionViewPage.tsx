import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation, useRoute } from 'wouter-preact';
import { t } from '../../i18n';
import { useFeature } from '../../app/flags';
import { Badge, Button, Card, EmptyState, SubPageHeader, showToast } from '../../ui/components';
import { BodyPicker } from '../../ui/body';
import { loadSessionView, type SessionView } from '../../data/repos/history';
import { beginRepeatOf } from '../../data/repos/sessions';
import { summaryOf, volumeText } from '../../shared/history';
import { formatIst, parseIso } from '../../shared/dates';
import { refId, type SessionItem } from '../../shared/session';
import { prToastText, recordText } from '../progress/prText';
import { AiReviewSheet } from '../aiReview/AiReviewSheet';
import { PromotionBanner } from '../badges/PromotionBanner';
import { setLine } from '../session/SetLogger';
import { dayLabel } from './dayText';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; view: SessionView };

function PrBurst({ view }: { view: SessionView }) {
  const first = view.prs[0];
  const hit = first?.hits[0];
  if (!first || !hit) return null;
  const name = view.names[first.ref] ?? first.slug;
  return (
    <div class="sf-sm__burst" role="status">
      <span class="sf-sm__burst-title">{t('sm.burst.title')}</span>
      <p class="sf-sm__burst-line">{`${name}: ${recordText(hit.metric, hit.value)}`}</p>
      <p class="sf-sm__burst-was sf-rt__meta">{hit.previous == null ? t('sm.burst.first') : t('sm.burst.was', { previous: recordText(hit.metric, hit.previous) })}</p>
    </div>
  );
}

function ItemBlock({ it, name }: { it: SessionItem; name: string }) {
  const work = it.sets.filter((s) => s.tag !== 'warmup');
  const warm = it.sets.length - work.length;
  return (
    <div class="sf-sm__ex">
      <h3 class="sf-sm__ex-name">{name}</h3>
      {it.status === 'skipped' && <Badge tone="neutral">{t('sm.skipped')}</Badge>}
      <p class="sf-sm__sets">
        {it.sets.length === 0 ? t('sm.nosets') : work.map((s) => setLine(s)).join(' · ')}
        {warm > 0 && ` (+${warm} ${t('sm.warmup')})`}
      </p>
    </div>
  );
}

/**
 * One finished workout. `/session/<id>/summary` is where finishing lands (with the record burst);
 * `/history/<id>` is the same screen opened later from History (no burst, "Repeat this session").
 */
export default function SessionViewPage() {
  const [isSummary, sp] = useRoute('/session/:id/summary');
  const [, hp] = useRoute('/history/:id');
  const id = (isSummary ? sp?.id : hp?.id) ?? '';
  const [, navigate] = useLocation();
  const celebrate = useFeature('pr_celebration');
  const aiOn = useFeature('ai_review_export');
  const badgesOn = useFeature('muscle_badges');
  const [aiOpen, setAiOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [bodyView, setBodyView] = useState<'front' | 'back'>('front');

  const read = () => {
    setLoad({ status: 'loading' });
    loadSessionView(id).then(
      (view) => {
        if (!view) return setLoad({ status: 'missing' });
        if (!view.session.endedAt) return navigate(`/session/${id}`, { replace: true });
        setLoad({ status: 'ready', view });
      },
      () => setLoad({ status: 'error' }),
    );
  };
  useEffect(read, [id]);

  const back = () => goBack(navigate, isSummary ? '/train' : '/history');
  const head = <SubPageHeader title={isSummary ? t('sm.title') : t('page.summary.title')} onBack={back} backLabel={t('sm.back')} />;

  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('sm.loading')}</p></section>;
  if (load.status === 'missing') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('sm.missing')} actionLabel={t('sm.back')} onAction={back} /></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('sm.error')} actionLabel={t('rb.error.retry')} onAction={read} /></section>;

  const { view } = load;
  const s = view.session;
  const st = summaryOf(s);
  const items = [...s.items].sort((a, b) => a.order - b.order);
  const start = parseIso(s.startedAt);
  const repeat = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await beginRepeatOf(s.id);
      if (next) navigate(`/session/${next.id}`);
      else showToast(t('sm.repeat.fail'), { tone: 'danger' });
    } catch {
      showToast(t('sm.repeat.fail'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="sf-page-body sf-rt">
      {head}
      <p class="sf-rt__meta">{`${s.dayName ?? t('hs.free')}${start !== null ? ` · ${dayLabel(formatIst(start).slice(0, 10))} ${formatIst(start).slice(11)}` : ''}`}</p>

      {isSummary && celebrate && <PrBurst view={view} />}
      {isSummary && celebrate && badgesOn && <PromotionBanner sessionId={s.id} />}

      <div class="sf-sm__stats">
        <div class="sf-sm__stat"><span class="sf-rt__meta">{t('sm.l.time')}</span><span class="sf-sm__val">{t('sm.min', { n: st.minutes })}</span></div>
        <div class="sf-sm__stat"><span class="sf-rt__meta">{t('sm.l.volume')}</span><span class="sf-sm__val">{volumeText(st.volume)}</span></div>
        <div class="sf-sm__stat"><span class="sf-rt__meta">{t('sm.l.sets')}</span><span class="sf-sm__val">{st.workingSets}</span></div>
        <div class="sf-sm__stat"><span class="sf-rt__meta">{t('sm.l.prs')}</span><span class="sf-sm__val">{view.prs.reduce((n, p) => n + p.hits.length, 0)}</span></div>
      </div>

      <Card class="sf-sm__block">
        <h2 class="sf-ex__h">{t('sm.prs')}</h2>
        {view.prs.length === 0 ? (
          <p class="sf-lib__note">{t('sm.prs.none')}</p>
        ) : (
          view.prs.map((p) => p.hits.map((h) => <p key={`${p.key}-${h.metric}`} class="sf-sm__pr"><strong>{view.names[p.ref] ?? p.slug}</strong><span>{prToastText(h)}</span></p>))
        )}
        <Link href="/progress/records" class="sf-pr__link">{t('sm.records')}</Link>
      </Card>

      <Card class="sf-sm__block">
        <h2 class="sf-ex__h">{t('sm.muscles')}</h2>
        {Object.keys(view.muscles).length === 0 ? (
          <p class="sf-lib__note">{t('sm.muscles.none')}</p>
        ) : (
          <div class="sf-sm__body"><BodyPicker mode="view" size="mini" sex="male" view={bodyView} onViewChange={setBodyView} emphasis={view.muscles} /></div>
        )}
      </Card>

      <Card class="sf-sm__block">
        <h2 class="sf-ex__h">{t('sm.exercises')}</h2>
        {items.map((it, i) => <ItemBlock key={`${refId(it.ref)}-${i}`} it={it} name={view.names[refId(it.ref)] ?? refId(it.ref)} />)}
      </Card>

      <div class="sf-sm__actions">
        <Button disabled={busy} onPress={() => void repeat()}>{t('sm.repeat')}</Button>
        {aiOn && <Button variant="secondary" onPress={() => setAiOpen(true)}>{t('ai.btn.copy')}</Button>}
        <Button variant="secondary" onPress={back}>{isSummary ? t('sm.done') : t('sm.back')}</Button>
      </div>
      {aiOn && <AiReviewSheet open={aiOpen} onClose={() => setAiOpen(false)} scope={{ kind: 'session', id: s.id }} />}
    </section>
  );
}

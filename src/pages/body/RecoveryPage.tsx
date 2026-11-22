import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Collapsible, Button, EmptyState, Sheet, SubPageHeader } from '../../ui/components';
import { BodyPicker, type Sex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { useFeature } from '../../app/flags';
import { loadRecovery, type RecoveryData } from '../../data/repos/recovery';
import { BALANCE_MIN } from '../../shared/recovery';
import { balanceLines, figureStates, markRecord, readyList, recRows, stateCounts, STATE_ORDER, waitText } from './recoveryModel';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: RecoveryData };

const name = (id: string): string => t(`muscle.${id}` as StringKey);

function sinceText(hours: number | null): string {
  if (hours === null) return t('rc.since.never');
  return hours < 48 ? t('rc.since.h', { n: Math.round(hours) }) : t('rc.since.d', { n: Math.floor(hours / 24) });
}

function waitLabel(hoursLeft: number): string {
  if (hoursLeft <= 0) return t('rc.ready.now');
  const w = waitText(hoursLeft);
  return w.unit === 'h' ? t('rc.wait.h', { n: w.n }) : t('rc.wait.d', { n: w.n });
}

/** `/body/recovery`: how rested each muscle is, who is ready today, and the 28-day balance. */
export default function RecoveryPage() {
  const [, navigate] = useLocation();
  const marksOn = useFeature('injury_marks');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [sex, setSex] = useFigureSex();
  const [view, setView] = useState<View>('front');
  const [picked, setPicked] = useState<string | null>(null);

  const read = () => {
    setLoad({ status: 'loading' });
    loadRecovery().then((data) => setLoad({ status: 'ready', data }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);

  const data = load.status === 'ready' ? load.data : null;
  const rows = useMemo(() => (data ? recRows(data.map, data.heat.tax) : []), [data]);
  const counts = useMemo(() => stateCounts(rows), [rows]);
  const ready = useMemo(() => (data ? readyList(data.map, data.heat.tax) : []), [data]);
  const head = <SubPageHeader title={t('page.recovery.title')} onBack={() => goBack(navigate, '/body')} backLabel={t('rc.back')} />;

  if (load.status === 'loading') return <div class="sf-hm">{head}<p class="sf-hm__note" role="status">{t('rc.loading')}</p></div>;
  if (load.status === 'error' || !data) {
    return <div class="sf-hm">{head}<p class="sf-hm__note" role="alert">{t('rc.error')}</p><Button onPress={read}>{t('rc.retry')}</Button></div>;
  }
  if (!data.hasWork) {
    return <div class="sf-hm">{head}<EmptyState title={t('rc.empty.title')} hint={t('rc.empty.hint')} actionLabel={t('rc.empty.go')} onAction={() => navigate('/train')} /></div>;
  }

  const lines = balanceLines(data.balance);
  const info = picked ? data.map[picked] : undefined;
  const sheetRows = picked ? rows.filter((r) => r.id === picked) : [];
  const kids = picked ? data.heat.tax.childrenOf(picked) : [];

  return (
    <div class="sf-hm">
      {head}
      <BodyPicker mode="recovery" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} onSelect={(id) => setPicked(id)} recovery={figureStates(data.map)} marks={markRecord(data.marks)} />

      <div class="sf-hm__legend" role="group" aria-label={t('rc.legend.title')}>
        {STATE_ORDER.map((s) => (
          <span key={s} class="sf-hm__key"><span class={`sf-hm__sw sf-hm__sw--rec-${s}`} aria-hidden="true" />{t(`body.rec.${s}` as StringKey)}: {t('rc.count', { n: counts[s] })}</span>
        ))}
      </div>

      <Collapsible id="rc-ready-title" title={t('rc.ready.title')} defaultOpen>
        {ready.length === 0 ? (
          <p class="sf-hm__note">{t('rc.ready.none')}</p>
        ) : (
          <>
            <p class="sf-hm__note">{t('rc.ready.hint')}</p>
            <ul class="sf-hm__rows">
              {ready.map((id) => (
                <li key={id}><button type="button" class="sf-hm__row sf-hm__btn" onClick={() => setPicked(id)}><span>{name(id)}</span><span class="sf-hm__val">{t(`body.rec.${data.map[id]?.state ?? 'fresh'}` as StringKey)}</span></button></li>
              ))}
            </ul>
            <Button variant="secondary" onPress={() => navigate('/train')}>{t('rc.ready.go')}</Button>
          </>
        )}
      </Collapsible>

      <Collapsible id="rc-bal-title" title={t('rc.bal.title')}>
        <p class="sf-hm__note">{t('rc.bal.hint')}</p>
        <ul class="sf-hm__rows">
          {lines.map((l) => (
            <li key={l.axis} class="sf-hm__row">
              {l.kind === 'no_data'
                ? t('rc.bal.none', { a: t(`rc.ax.${l.lead}` as StringKey), b: t(`rc.ax.${l.trail}` as StringKey) })
                : l.kind === 'balanced'
                  ? t('rc.bal.ok', { a: t(`rc.ax.${l.lead}` as StringKey), b: t(`rc.ax.${l.trail}` as StringKey) })
                  : t('rc.bal.lags', { lead: t(`rc.ax.${l.lead}` as StringKey), trail: t(`rc.ax.${l.trail}` as StringKey).toLowerCase(), n: l.percent ?? 0 })}
            </li>
          ))}
        </ul>
        <p class="sf-hm__note">{t('rc.bal.min', { n: BALANCE_MIN })}</p>
      </Collapsible>

      <Collapsible id="rc-list-title" title={t('rc.list.title')}>
        <ul class="sf-hm__rows">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" class="sf-hm__row sf-hm__btn" onClick={() => setPicked(r.id)}>
                <span>{name(r.id)}</span>
                <span class="sf-hm__val">{`${t(`body.rec.${r.state}` as StringKey)}, ${waitLabel(r.hoursLeft)}`}</span>
              </button>
            </li>
          ))}
        </ul>
      </Collapsible>

      {marksOn && <Button variant="secondary" onPress={() => navigate('/body/marks')}>{t('rc.marks.link')}</Button>}

      <Sheet open={picked !== null} onClose={() => setPicked(null)} title={picked ? name(picked) : ''}>
        {picked && (
          <div class="sf-hm">
            <p class="sf-hm__note">{t('rc.sheet.state', { state: t(`body.rec.${info?.state ?? 'fresh'}` as StringKey) })}</p>
            <p class="sf-hm__note">{t('rc.sheet.last', { when: sinceText(info?.hoursSince ?? null) })}</p>
            {info && info.hoursLeft > 0 && <p class="sf-hm__note">{waitLabel(info.hoursLeft)}</p>}
            {sheetRows.length === 0 && kids.length > 0 && (
              <ul class="sf-hm__rows">
                {kids.map((c) => (
                  <li key={c} class="sf-hm__row"><span>{name(c)}</span><span class="sf-hm__val">{t(`body.rec.${data.map[c]?.state ?? 'fresh'}` as StringKey)}</span></li>
                ))}
              </ul>
            )}
            <Button variant="secondary" onPress={() => navigate(`/muscle/${picked}`)}>{t('hm.sheet.train')}</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

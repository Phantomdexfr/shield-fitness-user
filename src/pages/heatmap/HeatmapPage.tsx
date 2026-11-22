import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Collapsible, Button, Chip, DatePicker, EmptyState, Sheet, SubPageHeader } from '../../ui/components';
import { BodyPicker, type Sex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { useFeature } from '../../app/flags';
import { loadHeatData, loadWeakSpots, addToRoutine, todayKey, type HeatData, type WeakSpotsData } from '../../data/repos/heatmap';
import { compareHeat, heatMap, lastDays, type HeatMap, type Period, type PeriodKind } from '../../shared/heat';
import type { DayKey } from '../../shared/dates';
import { dayLabel, monthLabel } from '../history/dayText';
import {
  PERIOD_KINDS, RANGE_PRESETS, canNext, canPrev, choosePeriod, compareBands, compareRows, comparePeriod, customFrom,
  heatBands, heatRows, muscleDetail, neglected, stepPeriod, trainableIds,
} from './heatmapModel';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: HeatData };

const name = (id: string): string => t(`muscle.${id}` as StringKey);
const bandText = (b: 0 | 1 | 2 | 3 | 4 | 5): string => (b === 0 ? '' : t(`hm.band.${b}` as StringKey));

function periodText(p: Period): string {
  if (p.kind === 'all') return t('hm.label.all');
  if (p.kind === 'day') return dayLabel(p.from);
  if (p.kind === 'month') return monthLabel(p.from.slice(0, 7));
  return `${dayLabel(p.from)} - ${dayLabel(p.to)}`;
}

function RangeSheet({ open, onClose, today, onPick }: { open: boolean; onClose: () => void; today: DayKey; onPick: (p: Period) => void }) {
  const [from, setFrom] = useState<string>(lastDays(30, today).from);
  const [to, setTo] = useState<string>(today);
  const range = customFrom(from, to);
  return (
    <Sheet open={open} onClose={onClose} title={t('hm.custom.title')}>
      <div class="sf-hm">
        <div class="sf-hm__chips" role="group" aria-label={t('hm.custom.title')}>
          {RANGE_PRESETS.map((n) => (
            <Chip key={n} onPress={() => onPick(lastDays(n, today))}>{t('hm.custom.last', { n })}</Chip>
          ))}
        </div>
        <DatePicker label={t('hm.custom.from')} value={from} max={to || undefined} today={today} onChange={setFrom} />
        <DatePicker label={t('hm.custom.to')} value={to} min={from || undefined} today={today} onChange={setTo} />
        {!range && <p class="sf-hm__note" role="alert">{t('hm.custom.bad')}</p>}
        <Button disabled={!range} onPress={() => range && onPick(range)}>{t('hm.custom.go')}</Button>
      </div>
    </Sheet>
  );
}

function WeakSpots({ data, today }: { data: HeatData; today: DayKey }) {
  const [res, setRes] = useState<WeakSpotsData | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let live = true;
    loadWeakSpots(data, today).then((r) => live && setRes(r), () => live && setRes(null));
    return () => {
      live = false;
    };
  }, [data]);
  if (!res) return null;
  const add = async (slug: string, group: string) => {
    const r = await addToRoutine(slug, group, data.tax).catch(() => null);
    if (!r) setMsg(t('hm.weak.failed'));
    else if (r.ok) setMsg(t('hm.weak.added', { day: r.day, routine: r.routine }));
    else setMsg(r.reason === 'already' ? t('hm.weak.already') : t('hm.weak.noroutine'));
  };
  return (
    <Collapsible id="hm-weak-title" title={t('hm.weak.title')}>
      {res.result.status === 'not_enough' && <p class="sf-hm__note">{t('hm.weak.not_enough')}</p>}
      {res.result.status === 'ok' && res.cards.length === 0 && <p class="sf-hm__note">{t('hm.weak.none')}</p>}
      {res.cards.map((c) => (
        <div key={c.group} class="sf-hm__card">
          <strong>{name(c.group)}</strong>
          <span class="sf-hm__note">{c.value === 0 ? t('hm.weak.zero') : t('hm.weak.line', { pct: Math.round(c.ratio * 100) })}</span>
          {c.picks.length > 0 && <span class="sf-hm__note">{t('hm.weak.try')}</span>}
          {c.picks.map((p) => (
            <Button key={p.slug} variant="secondary" disabled={!res.routineName} onPress={() => add(p.slug, c.group)}>{t('hm.weak.add', { name: p.name })}</Button>
          ))}
        </div>
      ))}
      {res.cards.length > 0 && !res.routineName && <p class="sf-hm__note">{t('hm.weak.noroutine')}</p>}
      {msg && <p class="sf-hm__note" role="status">{msg}</p>}
    </Collapsible>
  );
}

/** `/heatmap`: what you trained, painted on the body, for a day, week, month, custom range or all time. */
export default function HeatmapPage() {
  const [, navigate] = useLocation();
  const weakOn = useFeature('weak_spots');
  const badgesOn = useFeature('muscle_badges');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const today = useMemo(todayKey, []);
  const [kind, setKind] = useState<PeriodKind>('week');
  const [custom, setCustom] = useState<Period | undefined>();
  const [anchorShift, setShift] = useState(0);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [sex, setSex] = useFigureSex();
  const [view, setView] = useState<View>('front');
  const [picked, setPicked] = useState<string | null>(null);
  const [showAllNeg, setShowAllNeg] = useState(false);

  const read = () => {
    setLoad({ status: 'loading' });
    loadHeatData().then((data) => setLoad({ status: 'ready', data }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);

  const data = load.status === 'ready' ? load.data : null;
  const entryDays = useMemo(() => (data ? data.entries.map((e) => e.day) : []), [data]);
  const period = useMemo(() => {
    let p = choosePeriod(kind, today, entryDays, custom);
    const n = Math.abs(anchorShift);
    for (let i = 0; i < n; i++) p = stepPeriod(p, anchorShift < 0 ? -1 : 1);
    return p;
  }, [kind, today, entryDays, custom, anchorShift]);

  const map: HeatMap | null = useMemo(() => (data ? heatMap(data.entries, period, data.tax) : null), [data, period]);
  const basePeriod = compare ? comparePeriod(period) : null;
  const cmp = useMemo(() => (data && map && basePeriod ? compareHeat(heatMap(data.entries, basePeriod, data.tax), map) : null), [data, map, basePeriod]);
  const gl = useMemo(() => (cmp ? compareBands(cmp) : null), [cmp]);

  const pickKind = (k: PeriodKind) => {
    setShift(0);
    if (k === 'custom') setRangeOpen(true);
    else setKind(k);
  };
  const back = () => goBack(navigate, '/body');
  const head = <SubPageHeader title={t('page.heatmap.title')} onBack={back} backLabel={t('sm.back')} />;

  if (load.status === 'loading') return <div class="sf-hm">{head}<p class="sf-hm__note" role="status">{t('hm.loading')}</p></div>;
  if (load.status === 'error' || !data || !map) {
    return <div class="sf-hm">{head}<p class="sf-hm__note" role="alert">{t('hm.error')}</p><Button onPress={read}>{t('hm.retry')}</Button></div>;
  }
  if (data.entries.length === 0) {
    return <div class="sf-hm">{head}<EmptyState title={t('hm.empty.title')} hint={t('hm.empty.hint')} actionLabel={t('hm.empty.go')} onAction={() => navigate('/train')} /></div>;
  }

  const rows = heatRows(map);
  const neg = neglected(data.entries, map, trainableIds(data.muscleIds, data.tax), today);
  const negShown = showAllNeg ? neg : neg.slice(0, 8);
  const detail = picked ? muscleDetail(data.entries, period, data.tax, picked, today) : null;
  const pickedBand = picked ? (map.muscles[picked]?.band ?? map.rolled[picked]?.band ?? 0) : 0;
  const parts = picked ? data.tax.childrenOf(picked) : [];
  const figure = gl ? { heat: gl.gain, loss: gl.loss } : { heat: heatBands(map) };

  return (
    <div class="sf-hm">
      {head}
      <div class="sf-hm__chips" role="group" aria-label={t('hm.period.aria')}>
        {PERIOD_KINDS.map((k) => (
          <Chip key={k} selected={kind === k} onPress={() => pickKind(k)}>{t(`hm.period.${k}` as StringKey)}</Chip>
        ))}
      </div>
      <div class="sf-hm__nav">
        <Button variant="secondary" aria-label={t('hm.prev')} disabled={!canPrev(period)} onPress={() => setShift(anchorShift - 1)}>{'<'}</Button>
        <h2 class="sf-hm__label" role="status">{periodText(period)}</h2>
        <Button variant="secondary" aria-label={t('hm.next')} disabled={!canNext(period, today)} onPress={() => setShift(anchorShift + 1)}>{'>'}</Button>
      </div>
      <div class="sf-hm__chips">
        <Chip selected={compare} disabled={period.kind === 'all'} onPress={() => setCompare(!compare)}>{t('hm.compare')}</Chip>
      </div>
      {period.kind === 'all' && compare && <p class="sf-hm__note">{t('hm.compare.none')}</p>}
      {basePeriod && <p class="sf-hm__note">{t('hm.compare.vs', { label: periodText(basePeriod) })}</p>}

      <BodyPicker mode="heat" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} onSelect={(id) => setPicked(id)} {...figure} />

      <div class="sf-hm__legend" role="group" aria-label={t('hm.legend.title')}>
        {cmp ? (
          <>
            <span class="sf-hm__key"><span class="sf-hm__sw sf-hm__sw--more" aria-hidden="true" />{t('hm.legend.more')}</span>
            <span class="sf-hm__key"><span class="sf-hm__sw sf-hm__sw--less" aria-hidden="true" />{t('hm.legend.less')}</span>
          </>
        ) : (
          [1, 2, 3, 4, 5].map((b) => (
            <span key={b} class="sf-hm__key"><span class={`sf-hm__sw sf-hm__sw--h${b}`} aria-hidden="true" />{t(`hm.band.${b}` as StringKey)}</span>
          ))
        )}
      </div>
      {map.sets === 0 ? <p class="sf-hm__note">{t('hm.noperiod')}</p> : <p class="sf-hm__note">{t('hm.sets', { n: Math.round(map.sets * 10) / 10 })}</p>}

      {cmp ? (
        <Collapsible id="hm-cmp-title" title={t('hm.cmp.title')}>
          <ul class="sf-hm__rows">
            {compareRows(cmp).map((r) => (
              <li key={r.id} class={`sf-hm__row sf-hm__row--${r.trend}`}>
                <span>{name(r.id)}</span>
                <span class="sf-hm__val">{`${r.trend === 'gain' ? '+' : '-'}${Math.round(Math.abs(r.delta) * 100)}% ${r.trend === 'gain' ? t('hm.cmp.more') : t('hm.cmp.less')}`}</span>
              </li>
            ))}
          </ul>
        </Collapsible>
      ) : (
        rows.length > 0 && (
          <Collapsible id="hm-list-title" title={t('hm.list.title')} defaultOpen>
            <ul class="sf-hm__rows">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" class="sf-hm__row sf-hm__btn" onClick={() => setPicked(r.id)}>
                    <span>{name(r.id)}</span>
                    <span class="sf-hm__val">{bandText(r.band)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Collapsible>
        )
      )}

      <Collapsible id="hm-neg-title" title={t('hm.neg.title')}>
        {neg.length === 0 ? (
          <p class="sf-hm__note">{t('hm.neg.none')}</p>
        ) : (
          <div class="sf-hm__neg">
            {negShown.map((n) => (
              <Chip key={n.id} onPress={() => setPicked(n.id)}>
                {`${name(n.id)}: ${n.daysSince === null ? t('hm.neg.never') : n.daysSince === 1 ? t('hm.neg.day1') : t('hm.neg.days', { n: n.daysSince })}`}
              </Chip>
            ))}
          </div>
        )}
        {neg.length > 8 && !showAllNeg && <Button variant="secondary" onPress={() => setShowAllNeg(true)}>{t('hm.neg.more', { n: neg.length })}</Button>}
      </Collapsible>

      {weakOn && <WeakSpots data={data} today={today} />}
      {badgesOn && <Button variant="secondary" onPress={() => navigate('/profile/muscles')}>{t('badge.open')}</Button>}

      <RangeSheet
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        today={today}
        onPick={(p) => {
          setCustom(p);
          setKind('custom');
          setShift(0);
          setRangeOpen(false);
        }}
      />

      <Sheet open={picked !== null} onClose={() => setPicked(null)} title={picked ? name(picked) : ''}>
        {picked && detail && (
          <div class="sf-hm">
            <p class="sf-hm__note">{pickedBand > 0 ? t('hm.sheet.band', { band: bandText(pickedBand) }) : t('hm.sheet.none')}</p>
            {detail.sets > 0 && <p class="sf-hm__note">{t('hm.sheet.sets', { n: Math.round(detail.sets * 10) / 10 })}</p>}
            {parts.length > 0 && (
              <ul class="sf-hm__rows" aria-label={t('hm.sheet.parts')}>
                {parts.map((c) => (
                  <li key={c} class="sf-hm__row"><span>{name(c)}</span><span class="sf-hm__val">{bandText(map.muscles[c]?.band ?? 0)}</span></li>
                ))}
              </ul>
            )}
            {detail.hits.length > 0 && (
              <>
                <h3 class="sf-hm__h">{t('hm.sheet.exercises')}</h3>
                <ul class="sf-hm__rows">
                  {detail.hits.slice(0, 6).map((h) => (
                    <li key={h.name + (h.variation ?? '')} class="sf-hm__row"><span>{h.variation ? `${h.name} (${h.variation})` : h.name}</span><span class="sf-hm__val">{Math.round(h.sets * 10) / 10}</span></li>
                  ))}
                </ul>
              </>
            )}
            <p class="sf-hm__note">{detail.last ? t('hm.sheet.last', { day: dayLabel(detail.last) }) : t('hm.sheet.never')}</p>
            <Button onPress={() => navigate(`/muscle/${picked}`)}>{t('hm.sheet.train')}</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

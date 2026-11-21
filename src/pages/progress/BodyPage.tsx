import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Card, EmptyState, Input, Segmented, SubPageHeader, showToast } from '../../ui/components';
import { AreaChart, LineChart, StatTile } from '../../ui/charts';
import { MEASURES, RANGE, bmi, bmiBand, bodySeries, latestOf, parseNumber, type BodyEntry, type Measure } from '../../shared/goals';
import { deleteEntry, loadBody, saveEntry, writeHeight, type BodyData } from '../../data/repos/body';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: BodyData };
const MEASURE_KEY: Record<Measure, StringKey> = { chest: 'body.m.chest', waist: 'body.m.waist', hips: 'body.m.hips', arm: 'body.m.arm', thigh: 'body.m.thigh' };
const BAND_KEY = { under: 'body.bmi.under', healthy: 'body.bmi.healthy', over: 'body.bmi.over', high: 'body.bmi.high' } as const;

const entryText = (e: BodyEntry): string => {
  const parts: string[] = [];
  if (e.kg !== null) parts.push(`${e.kg} kg`);
  if (e.fat !== null) parts.push(`${e.fat} %`);
  for (const m of MEASURES) if (e.cm[m] !== undefined) parts.push(`${t(MEASURE_KEY[m])} ${e.cm[m]} cm`);
  return parts.join(' · ');
};

/** `/progress/body`: log weight, body fat and measurements; BMI from height; trend charts. */
export default function BodyPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [kg, setKg] = useState('');
  const [fat, setFat] = useState('');
  const [cm, setCm] = useState<Record<Measure, string>>({ chest: '', waist: '', hips: '', arm: '', thigh: '' });
  const [height, setHeight] = useState('');
  const [error, setError] = useState('');
  const [heightError, setHeightError] = useState('');
  const [measure, setMeasure] = useState<Measure>('waist');
  const read = () => {
    loadBody().then((data) => { setLoad({ status: 'ready', data }); setHeight((h) => (h === '' && data.heightCm ? String(data.heightCm) : h)); }, () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);
  const back = () => goBack(navigate, '/progress');
  const head = <SubPageHeader title={t('page.bodystats.title')} onBack={back} backLabel={t('prog.back')} />;
  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('prog.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('prog.error')} actionLabel={t('rb.error.retry')} onAction={() => { setLoad({ status: 'loading' }); read(); }} /></section>;
  const { entries, heightCm, today } = load.data;

  const save = async () => {
    const patch: { day: string; kg?: number; fat?: number; cm?: Partial<Record<Measure, number>> } = { day: today };
    const bad: string[] = [];
    const take = (text: string, min: number, max: number, label: string): number | undefined => {
      if (text.trim() === '') return undefined;
      const n = parseNumber(text, min, max);
      if (n === null) bad.push(label);
      return n ?? undefined;
    };
    const k = take(kg, RANGE.kg[0], RANGE.kg[1], t('body.weight'));
    const f = take(fat, RANGE.fat[0], RANGE.fat[1], t('body.fat'));
    const c: Partial<Record<Measure, number>> = {};
    for (const m of MEASURES) {
      const v = take(cm[m], RANGE.cm[0], RANGE.cm[1], t(MEASURE_KEY[m]));
      if (v !== undefined) c[m] = v;
    }
    if (bad.length) return setError(t('body.err.range', { fields: bad.join(', ') }));
    if (k === undefined && f === undefined && Object.keys(c).length === 0) return setError(t('body.err.empty'));
    if (k !== undefined) patch.kg = k;
    if (f !== undefined) patch.fat = f;
    if (Object.keys(c).length) patch.cm = c;
    setError('');
    try {
      await saveEntry(patch);
      setKg(''); setFat(''); setCm({ chest: '', waist: '', hips: '', arm: '', thigh: '' });
      showToast(t('body.saved'), { tone: 'ok' });
      read();
    } catch {
      setError(t('body.err.save'));
    }
  };
  const saveHeight = async () => {
    const n = height.trim() === '' ? null : parseNumber(height, RANGE.height[0], RANGE.height[1]);
    if (height.trim() !== '' && n === null) return setHeightError(t('body.err.height'));
    setHeightError('');
    await writeHeight(n).catch(() => undefined);
    read();
  };

  const latestKg = latestOf(entries, 'kg');
  const latestFat = latestOf(entries, 'fat');
  const b = bmi(latestKg, heightCm);
  const wSeries = bodySeries(entries, 'kg');
  const prevKg = wSeries.length > 1 ? (wSeries[wSeries.length - 2] as { y: number }).y : null;
  const mSeries = bodySeries(entries, measure);
  const recent = [...entries].reverse().slice(0, 10);
  return (
    <section class="sf-page-body sf-rt">
      {head}
      <div class="sf-pg__tiles">
        <StatTile label={t('body.weight')} value={latestKg ?? '–'} {...(latestKg !== null ? { unit: 'kg' } : {})} {...(latestKg !== null && prevKg !== null ? { delta: { value: Math.round((latestKg - prevKg) * 10) / 10, goodWhen: 'any' as const, unit: ' kg', label: t('body.vs.prev') } } : {})} />
        <StatTile label={t('body.bmi')} value={b ?? '–'} />
        <StatTile label={t('body.fat')} value={latestFat ?? '–'} {...(latestFat !== null ? { unit: '%' } : {})} />
      </div>
      {b !== null && <p class="sf-rt__meta">{t(BAND_KEY[bmiBand(b)])} {t('body.bmi.note')}</p>}
      {b === null && <p class="sf-rt__meta">{t('body.bmi.need')}</p>}

      <Card as="section" class="sf-pg__card">
        <h2 class="sf-pg__h">{t('body.log.title')}</h2>
        <p class="sf-lib__note">{t('body.log.note')}</p>
        <div class="sf-pg__form">
          <Input label={t('body.weight')} {...{ value: kg, inputMode: 'decimal' }} onInput={(e) => setKg((e.target as HTMLInputElement).value)} />
          <Input label={t('body.fat')} {...{ value: fat, inputMode: 'decimal' }} onInput={(e) => setFat((e.target as HTMLInputElement).value)} />
          {MEASURES.map((m) => (
            <Input key={m} label={`${t(MEASURE_KEY[m])} (cm)`} {...{ value: cm[m], inputMode: 'decimal' }} onInput={(e) => setCm({ ...cm, [m]: (e.target as HTMLInputElement).value })} />
          ))}
        </div>
        {error && <p class="sf-pg__err" role="alert">{error}</p>}
        <Button onPress={save}>{t('body.save')}</Button>
      </Card>

      <Card as="section" class="sf-pg__card">
        <h2 class="sf-pg__h">{t('body.height.title')}</h2>
        <Input label={t('body.height.label')} {...{ value: height, inputMode: 'decimal' }} error={heightError} hint={t('body.height.hint')} onInput={(e) => setHeight((e.target as HTMLInputElement).value)} />
        <Button variant="secondary" onPress={saveHeight}>{t('body.height.save')}</Button>
      </Card>

      <AreaChart title={t('body.chart.weight')} series={[{ id: 'kg', name: t('body.weight'), points: wSeries }]} unit="kg" emptyText={t('body.chart.empty')} />
      <LineChart title={t('body.chart.fat')} series={[{ id: 'fat', name: t('body.fat'), points: bodySeries(entries, 'fat') }]} unit="%" emptyText={t('body.chart.empty')} />
      <Segmented label={t('body.chart.measure')} value={measure} onChange={setMeasure} options={MEASURES.map((m) => ({ value: m, label: t(MEASURE_KEY[m]) }))} />
      <LineChart title={`${t(MEASURE_KEY[measure])} (cm)`} series={[{ id: measure, name: t(MEASURE_KEY[measure]), points: mSeries }]} unit="cm" emptyText={t('body.chart.empty')} />

      {recent.length > 0 && (
        <>
          <h2 class="sf-pg__h">{t('body.recent')}</h2>
          <ul class="sf-pg__list">
            {recent.map((e) => (
              <li key={e.day} class="sf-pg__row">
                <strong>{e.day}</strong>
                <span class="sf-rt__meta">{entryText(e)}</span>
                <Button variant="ghost" onPress={() => { deleteEntry(e.day).then(read, read); }}>{t('body.delete')}</Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div class="sf-pg__links"><Link href="/goals" class="sf-pr__link">{t('body.goals.link')}</Link></div>
    </section>
  );
}

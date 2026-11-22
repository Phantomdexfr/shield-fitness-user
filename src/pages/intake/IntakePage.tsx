import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, Card, EmptyState, Segmented, SubPageHeader, showToast, Row } from '../../ui/components';
import { BarChart, Ring, type BarDatum } from '../../ui/charts';
import { dayLabel } from '../../shared/chartMath';
import { GLASS_ML, PROTEIN_FACTORS, QUICK_PROTEIN, WATER_TARGET_ML, dayTotal, glasses, intakeSeries, lastEntry, proteinTarget, share } from '../../shared/intake';
import { useFeature } from '../../app/flags';
import { addIntake, loadIntake, removeIntake, writeFactor, type IntakeData } from '../../data/repos/intake';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: IntakeData };
type Span = '7' | '30';

const undoText = (kind: string, amount: number): string => (kind === 'water' ? t('intake.undo.water', { n: glasses(amount) }) : t('intake.undo.protein', { n: amount }));

/** `/intake`: protein (target from weight x factor) and water by the glass, with rings and 7 / 30 day charts. */
export default function IntakePage() {
  const [, navigate] = useLocation();
  const scanOn = useFeature('barcode_scan');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [span, setSpan] = useState<Span>('7');
  const read = () => {
    loadIntake().then((data) => setLoad({ status: 'ready', data }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);
  const head = <SubPageHeader title={t('page.intake.title')} onBack={() => goBack(navigate, '/progress')} backLabel={t('prog.back')} />;
  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('prog.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('prog.error')} actionLabel={t('rb.error.retry')} onAction={() => { setLoad({ status: 'loading' }); read(); }} /></section>;

  const { entries, today, kg, factor } = load.data;
  const target = proteinTarget(kg, factor);
  const protein = dayTotal(entries, today, 'protein');
  const water = dayTotal(entries, today, 'water');
  const last = lastEntry(entries, today);
  const add = async (kind: 'protein' | 'water', amount: number) => {
    const ok = await addIntake(kind, amount).catch(() => false);
    if (!ok) showToast(t('intake.err.save'), { tone: 'danger' });
    read();
  };
  const undo = async () => {
    if (!last) return;
    await removeIntake(last.id).catch(() => undefined);
    read();
  };
  const days = span === '7' ? 7 : 30;
  const bars = (kind: 'protein' | 'water'): BarDatum[] => intakeSeries(entries, kind, today, days).map((p) => ({ x: dayLabel(p.day, t, 'short'), y: p.total, label: dayLabel(p.day, t, 'full') }));

  return (
    <section class="sf-page-body sf-rt">
      {head}
      <Card as="section" class="sf-pg__card">
        <h2 class="sf-pg__h">{t('intake.protein.title')}</h2>
        <div class="sf-pg__week">
          <Ring title={t('intake.protein.title')} value={protein} max={target ?? Math.max(1, protein)} size={104} centre={<span>{protein} g</span>} />
          <div class="sf-pg__goalmeta">
            {target !== null ? <p>{t('intake.protein.of', { n: protein, target })}</p> : <p>{t('intake.protein.today', { n: protein })}</p>}
            {target !== null && <p class="sf-rt__meta">{t('intake.protein.how', { kg: String(kg), f: String(factor) })}</p>}
          </div>
        </div>
        {target === null && <><p class="sf-rt__meta">{t('intake.protein.need')}</p><Row href="/progress/body" label={t('prog.links.body')} /></>}
        <div class="sf-pg__quick" role="group" aria-label={t('intake.protein.quick')}>
          {QUICK_PROTEIN.map((g) => <Button key={g} variant="secondary" onPress={() => add('protein', g)}>{`+${g} g`}</Button>)}
        </div>
        <Segmented label={t('intake.factor')} value={String(factor)} onChange={(v) => { writeFactor(Number(v)).then(read, read); }} options={PROTEIN_FACTORS.map((f) => ({ value: String(f), label: `${f} g/kg` }))} />
      </Card>

      <Card as="section" class="sf-pg__card">
        <h2 class="sf-pg__h">{t('intake.water.title')}</h2>
        <div class="sf-pg__week">
          <Ring title={t('intake.water.title')} value={water} max={WATER_TARGET_ML} size={104} centre={<span>{glasses(water)}</span>} />
          <div class="sf-pg__goalmeta">
            <p>{t('intake.water.of', { n: glasses(water), target: glasses(WATER_TARGET_ML) })}</p>
            <p class="sf-rt__meta">{t('intake.water.ml', { ml: water, pct: Math.round(share(water, WATER_TARGET_ML) * 100) })}</p>
          </div>
        </div>
        <Button variant="secondary" onPress={() => add('water', GLASS_ML)}>{t('intake.water.add', { ml: GLASS_ML })}</Button>
      </Card>

      {scanOn && <Button variant="secondary" onPress={() => navigate('/intake/scan')}>{t('intake.scan.link')}</Button>}
      {last && <Button variant="secondary" onPress={undo}>{undoText(last.kind, last.amount)}</Button>}

      <Segmented label={t('intake.span')} value={span} onChange={setSpan} options={[{ value: '7', label: t('intake.span.7') }, { value: '30', label: t('intake.span.30') }]} />
      <BarChart title={t('intake.chart.protein')} data={bars('protein')} unit="g" {...(target !== null ? { target } : {})} emptyText={t('intake.chart.empty')} />
      <BarChart title={t('intake.chart.water')} data={bars('water')} unit="ml" target={WATER_TARGET_ML} emptyText={t('intake.chart.empty')} />
      <p class="sf-rt__meta">{t('intake.note')}</p>
    </section>
  );
}

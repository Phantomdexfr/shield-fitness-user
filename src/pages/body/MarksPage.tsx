import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, EmptyState, Sheet, SubPageHeader, showToast } from '../../ui/components';
import { BodyPicker, MuscleChips, type Sex, type View } from '../../ui/body';
import { useFeature } from '../../app/flags';
import { loadMarks, setMuscleMark } from '../../data/repos/marks';
import { getMuscles } from '../../dataset/loader';
import { buildTaxonomy, type Taxonomy } from '../../shared/muscles';
import { markOf, type MarkKind, type MuscleMark } from '../../shared/avoid';
import { applyChoice, markChoices, markRecord, markRows } from './recoveryModel';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; marks: MuscleMark[]; tax: Taxonomy };

const name = (id: string): string => t(`muscle.${id}` as StringKey);
const kindText = (k: MarkKind): string => t(`mk.state.${k}` as StringKey);
const choiceText = (c: MarkKind | 'clear'): string => (c === 'clear' ? t('mk.clear') : t(`mk.${c}` as StringKey));

/** `/body/marks`: tap an area, mark it avoid or sore, or clear it. Avoid and sore are read by suggestions, the day builder and swaps. */
export default function MarksPage() {
  const [, navigate] = useLocation();
  const on = useFeature('injury_marks');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [sex, setSex] = useState<Sex>('male');
  const [view, setView] = useState<View>('front');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const read = () => {
    setLoad({ status: 'loading' });
    Promise.all([loadMarks(), getMuscles()]).then(
      ([marks, { muscles }]) => setLoad({ status: 'ready', marks, tax: buildTaxonomy(muscles) }),
      () => setLoad({ status: 'error' }),
    );
  };
  useEffect(read, []);

  const marks = load.status === 'ready' ? load.marks : [];
  const record = useMemo(() => markRecord(marks), [marks]);
  const rows = useMemo(() => markRows(marks), [marks]);
  const head = <SubPageHeader title={t('page.marks.title')} onBack={() => goBack(navigate, '/body')} backLabel={t('rc.back')} />;

  if (!on) return <div class="sf-hm">{head}<EmptyState icon="info" title={t('lab.off.title')} hint={t('lab.off.hint')} /></div>;
  if (load.status === 'loading') return <div class="sf-hm">{head}<p class="sf-hm__note" role="status">{t('mk.loading')}</p></div>;
  if (load.status === 'error') return <div class="sf-hm">{head}<p class="sf-hm__note" role="alert">{t('mk.error')}</p><Button onPress={read}>{t('rc.retry')}</Button></div>;

  const tax = load.tax;
  const own = picked ? marks.find((m) => m.muscle === picked)?.kind : undefined;
  const via = picked && !own ? markOf(marks, picked, tax) : undefined;
  const parent = picked ? tax.parentOf(picked) : undefined;

  const choose = async (c: MarkKind | 'clear') => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      const next = applyChoice(marks, picked, own, c);
      const kind = next.find((m) => m.muscle === picked)?.kind ?? 'clear';
      await setMuscleMark(picked, kind);
      setLoad({ status: 'ready', marks: next, tax });
      showToast(t('mk.saved'));
      setPicked(null);
    } catch {
      showToast(t('mk.fail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="sf-hm">
      {head}
      <p class="sf-hm__note">{t('mk.intro')}</p>
      <BodyPicker mode="marks" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} onSelect={(id) => setPicked(id)} marks={record} />

      <div class="sf-hm__legend" role="group" aria-label={t('mk.legend.title')}>
        {(['avoid', 'sore'] as const).map((k) => (
          <span key={k} class="sf-hm__key"><span class={`sf-hm__sw sf-hm__sw--${k}`} aria-hidden="true" />{t(`mk.${k}` as StringKey)}</span>
        ))}
      </div>

      <MuscleChips mode="marks" marks={record} onSelect={(id) => setPicked(id)} />

      <section class="sf-hm__sec" aria-label={t('mk.list.title')}>
        <h2 class="sf-hm__h">{t('mk.list.title')}</h2>
        {rows.length === 0 ? (
          <p class="sf-hm__note">{t('mk.list.none')}</p>
        ) : (
          <ul class="sf-hm__rows">
            {rows.map((m) => (
              <li key={m.muscle}>
                <button type="button" class="sf-hm__row sf-hm__btn" onClick={() => setPicked(m.muscle)}><span>{name(m.muscle)}</span><span class="sf-hm__val">{kindText(m.kind)}</span></button>
              </li>
            ))}
          </ul>
        )}
        <p class="sf-hm__note">{t('mk.respect')}</p>
      </section>

      <Sheet open={picked !== null} onClose={() => setPicked(null)} title={picked ? name(picked) : ''}>
        {picked && (
          <div class="sf-hm">
            <p class="sf-hm__note">
              {own ? t('mk.sheet.own', { kind: kindText(own) }) : via && parent ? t('mk.sheet.via', { kind: kindText(via), parent: name(parent) }) : t('mk.sheet.none')}
            </p>
            {markChoices(own).map((c) => (
              <Button key={c} variant={c === 'clear' ? 'secondary' : 'primary'} disabled={busy} onPress={() => void choose(c)}>{choiceText(c)}</Button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

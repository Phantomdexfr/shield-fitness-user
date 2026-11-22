import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button, Segmented, Sheet, Toggle, showToast } from '../../ui/components';
import { aiReviewText, DEFAULT_INTRO, type AiHistory, type AiScope, type AiUnit } from '../../shared/aiReview';
import { getAiPrefs, loadAiHistory, parsePrefs, setAiPrefs, type AiPrefs } from '../../data/repos/aiReview';
import { muscleLabel } from '../exercise/muscleLabel';
import { browserCopyEnv, canShare, copyWithFallback } from './copyText';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; history: AiHistory; prefs: AiPrefs };

/**
 * The preview: the exact text, editable, with the options that shape it. Built on the phone from stored workouts; the app
 * never sends it anywhere. Name, bodyweight and body stats are off every time the sheet opens.
 */
export function AiReviewSheet({ open, onClose, scope, title }: { open: boolean; onClose: () => void; scope: AiScope; title?: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [personal, setPersonal] = useState({ name: false, bodyweight: false, bodyStats: false });
  const [values, setValues] = useState({ name: '', bodyweight: '', bodyStats: '' });
  const [override, setOverride] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  const read = () => {
    setLoad({ status: 'loading' });
    Promise.all([loadAiHistory(muscleLabel), getAiPrefs()]).then(
      ([history, prefs]) => setLoad({ status: 'ready', history, prefs }),
      () => setLoad({ status: 'error' }),
    );
  };
  useEffect(() => {
    if (!open) return;
    setPersonal({ name: false, bodyweight: false, bodyStats: false });
    setValues({ name: '', bodyweight: '', bodyStats: '' });
    setOverride(null);
    setMsg('');
    read();
  }, [open]);

  const prefs = load.status === 'ready' ? load.prefs : parsePrefs(null);
  const bw = Number.parseFloat(values.bodyweight.replace(',', '.'));
  const generated = useMemo(() => {
    if (load.status !== 'ready') return '';
    return aiReviewText(scope, load.history, {
      intro: prefs.intro,
      units: prefs.units,
      include: { ...prefs.include, ...personal },
      profile: { name: values.name, bodyweightKg: Number.isFinite(bw) && bw > 0 ? bw : null, bodyStats: values.bodyStats },
    });
  }, [load, scope.kind, JSON.stringify(scope), JSON.stringify(prefs), personal, values]);
  // A change of option or scope rebuilds the text; edits are dropped (the sheet says so).
  useEffect(() => setOverride(null), [generated]);
  const text = override ?? generated;

  const save = (next: AiPrefs) => {
    if (load.status !== 'ready') return;
    setLoad({ ...load, prefs: next });
    void setAiPrefs(next).catch(() => undefined);
  };
  const flag = (k: keyof AiPrefs['include'], label: string) => (
    <Toggle label={label} checked={prefs.include[k]} onChange={(v) => save({ ...prefs, include: { ...prefs.include, [k]: v } })} />
  );

  const copy = async () => {
    const r = await copyWithFallback(text, browserCopyEnv(area.current));
    setMsg(r === 'copied' ? t('ai.copied') : t('ai.selected'));
    if (r === 'copied') showToast(t('ai.copied'), { tone: 'ok' });
  };
  const share = async () => {
    try {
      await navigator.share({ text });
    } catch {
      // cancelled or refused: nothing to do
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title ?? t('ai.title')}>
      <div class="sf-rt">
        <p class="sf-lib__note">{t('ai.privacy')}</p>
        {load.status === 'loading' && <p class="sf-lib__note" role="status">{t('ai.loading')}</p>}
        {load.status === 'error' && (
          <div class="sf-rt__row">
            <p class="sf-lib__note" role="alert">{t('ai.error')}</p>
            <Button variant="secondary" onPress={read}>{t('rb.error.retry')}</Button>
          </div>
        )}
        {load.status === 'ready' && (
          <>
            <label class="sf-lib__note" for="ai-text">{t('ai.preview')}</label>
            <textarea
              id="ai-text"
              ref={area}
              class="sf-input sf-ex__note"
              rows={12}
              value={text}
              onInput={(e) => {
                setOverride((e.target as HTMLTextAreaElement).value);
                setMsg('');
              }}
            />
            <p class="sf-lib__note" role="status">{msg || t('ai.edits')}</p>
            <div class="sf-rt__row">
              <Button onPress={() => void copy()}>{t('ai.copy')}</Button>
              {canShare() && <Button variant="secondary" onPress={() => void share()}>{t('ai.share')}</Button>}
            </div>

            <h3 class="sf-ex__h">{t('ai.opt.title')}</h3>
            {flag('notes', t('ai.opt.notes'))}
            {flag('rpe', t('ai.opt.rpe'))}
            {flag('setups', t('ai.opt.setups'))}
            {flag('prs', t('ai.opt.prs'))}
            {flag('muscles', t('ai.opt.muscles'))}
            <Toggle label={t('ai.opt.bodyweight')} hint={t('ai.opt.off')} checked={personal.bodyweight} onChange={(v) => setPersonal({ ...personal, bodyweight: v })} />
            {personal.bodyweight && <input class="sf-input" inputMode="decimal" aria-label={t('ai.field.bodyweight')} placeholder={t('ai.field.bodyweight')} value={values.bodyweight} onInput={(e) => setValues({ ...values, bodyweight: (e.target as HTMLInputElement).value })} />}
            <Toggle label={t('ai.opt.name')} hint={t('ai.opt.off')} checked={personal.name} onChange={(v) => setPersonal({ ...personal, name: v })} />
            {personal.name && <input class="sf-input" aria-label={t('ai.field.name')} placeholder={t('ai.field.name')} value={values.name} onInput={(e) => setValues({ ...values, name: (e.target as HTMLInputElement).value })} />}
            <Toggle label={t('ai.opt.bodyStats')} hint={t('ai.opt.off')} checked={personal.bodyStats} onChange={(v) => setPersonal({ ...personal, bodyStats: v })} />
            {personal.bodyStats && <input class="sf-input" aria-label={t('ai.field.bodyStats')} placeholder={t('ai.field.bodyStats')} value={values.bodyStats} onInput={(e) => setValues({ ...values, bodyStats: (e.target as HTMLInputElement).value })} />}

            <Segmented<AiUnit>
              label={t('ai.units')}
              options={[{ value: 'kg', label: t('ai.units.kg') }, { value: 'lb', label: t('ai.units.lb') }]}
              value={prefs.units}
              onChange={(v) => save({ ...prefs, units: v })}
            />

            <Toggle label={t('ai.intro.on')} checked={prefs.intro !== null} onChange={(v) => save({ ...prefs, intro: v ? DEFAULT_INTRO : null })} />
            {prefs.intro !== null && (
              <>
                <textarea
                  class="sf-input sf-ex__note"
                  rows={3}
                  aria-label={t('ai.intro.label')}
                  value={prefs.intro}
                  onInput={(e) => save({ ...prefs, intro: (e.target as HTMLTextAreaElement).value })}
                />
                {prefs.intro !== DEFAULT_INTRO && <Button variant="secondary" onPress={() => save({ ...prefs, intro: DEFAULT_INTRO })}>{t('ai.intro.reset')}</Button>}
              </>
            )}
            <p class="sf-lib__note">{t('ai.disclaimer')}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

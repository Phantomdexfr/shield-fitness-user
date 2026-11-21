import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Field, SubPageHeader } from '../../ui/components';
import { goBack } from '../../app/navBack';
import { checkGymCode } from '../../data/repos/gymPending';
import { Scanner } from '../share/Scanner';
import type { GymConfigResult } from '../../shared/gymConfig';

type Mode = 'choose' | 'paste' | 'scan';

export function gymErrorKey(r: Extract<GymConfigResult, { ok: false }>): StringKey {
  return (r.allowListMiss ? 'gy.err.GCF_HOST_ALLOW' : `gy.err.${r.code}`) as StringKey;
}

/** /settings/gym/add: scan a QR, paste the code, or (by opening the link) land here from /connect. Nothing is sent. */
export default function GymAddPage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>('choose');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const check = (raw: string) => {
    const r = checkGymCode(raw);
    if (r.ok) return navigate('/settings/gym/confirm');
    setErr(t(gymErrorKey(r)));
    setMode('paste');
  };
  const back = () => (mode === 'choose' ? goBack(navigate, '/settings/gym') : (setMode('choose'), setErr(null)));
  const clip = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      /* the box is still there to paste into */
    }
  };

  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('gy.add.h')} onBack={back} />
      {mode === 'choose' && (
        <>
          <p class="sf-st__hint">{t('gy.add.intro')}</p>
          <Button onPress={() => setMode('scan')}>{t('gy.add.scan')}</Button>
          <Button variant="secondary" onPress={() => setMode('paste')}>{t('gy.add.paste')}</Button>
          <p class="sf-st__hint">{t('gy.add.link.note')}</p>
        </>
      )}
      {mode === 'scan' && (
        <>
          <Scanner onText={check} onClose={() => setMode('choose')} />
          <Button variant="secondary" onPress={() => setMode('paste')}>{t('gy.add.type')}</Button>
        </>
      )}
      {mode === 'paste' && (
        <>
          <Field id="gym-code" label={t('gy.paste.label')} error={err ?? undefined}>
            <textarea
              id="gym-code"
              class="sf-input"
              rows={5}
              autocapitalize="off"
              autocomplete="off"
              spellcheck={false}
              value={text}
              onInput={(e) => {
                setText((e.currentTarget as HTMLTextAreaElement).value);
                setErr(null);
              }}
            />
          </Field>
          <Button variant="secondary" onPress={clip}>{t('gy.paste.clip')}</Button>
          <Button disabled={!text.trim()} onPress={() => check(text)}>{t('gy.paste.check')}</Button>
        </>
      )}
    </section>
  );
}

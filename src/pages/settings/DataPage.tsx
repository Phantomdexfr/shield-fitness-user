import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, Dialog, Input, SubPageHeader } from '../../ui/components';
import { WIPE_WORD, formatBytes, isWipeConfirm } from '../../shared/dataTools';
import { getQuota, makeBackup, requestPersist, restoreBackup, wipeAllData, type QuotaInfo } from '../../data/repos/dataTools';
import { goBack } from '../../app/navBack';
import { BackupLine } from './BackupLine';

type Note = { tone: 'ok' | 'err'; text: string } | null;

/** /settings/data: save a copy, restore from a file, storage, wipe with a typed word. Each action says what happened. */
export default function DataPage() {
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const loadStorage = async () => {
    setQuota(await getQuota());
    try {
      setPersisted((await navigator.storage?.persisted?.()) === true);
    } catch {
      setPersisted(false);
    }
  };
  useEffect(() => {
    void loadStorage();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const { name, text } = await makeBackup(Date.now());
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNote({ tone: 'ok', text: t('dt.export.done', { name }) });
    } catch {
      setNote({ tone: 'err', text: t('dt.export.fail') });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await restoreBackup(await file.text());
      setNote({ tone: 'ok', text: t('dt.import.done', { added: r.added, updated: r.updated, skipped: r.skipped }) });
    } catch {
      setNote({ tone: 'err', text: t('dt.import.fail') });
    } finally {
      setBusy(false);
    }
  };

  const protect = async () => {
    const ok = await requestPersist();
    setPersisted(ok);
    if (!ok) setNote({ tone: 'err', text: t('dt.storage.persist.denied') });
  };

  const wipe = async () => {
    if (!isWipeConfirm(typed)) return;
    try {
      await wipeAllData();
      window.location.replace('/');
    } catch {
      setWipeOpen(false);
      setNote({ tone: 'err', text: t('dt.wipe.fail') });
    }
  };

  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t('st.g.data')} onBack={() => goBack(navigate, '/settings')} />
      {note && (
        <p class={note.tone === 'err' ? 'sf-st__err' : 'sf-st__ok'} role="status">
          {note.text}
        </p>
      )}
      <BackupLine />
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('dt.export.h')}</h2>
        <p class="sf-st__hint">{t('dt.export.1')}</p>
        <Button onPress={() => void save()} disabled={busy}>{t('dt.export.btn')}</Button>
      </div>
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('dt.import.h')}</h2>
        <p class="sf-st__hint">{t('dt.import.1')}</p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void restore(e)} />
        <Button variant="secondary" onPress={() => fileRef.current?.click()} disabled={busy}>{t('dt.import.btn')}</Button>
      </div>
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('dt.storage.h')}</h2>
        <p class="sf-st__hint">
          {quota?.supported
            ? t('dt.storage.used', { used: formatBytes(quota.usageBytes), quota: formatBytes(quota.quotaBytes) })
            : t('dt.storage.unknown')}
        </p>
        <p class="sf-st__hint">{t(persisted ? 'dt.storage.persist.on' : 'dt.storage.persist.off')}</p>
        {!persisted && <Button variant="secondary" onPress={() => void protect()}>{t('dt.storage.persist.btn')}</Button>}
      </div>
      <div class="sf-st__row">
        <h2 class="sf-st__label">{t('dt.wipe.h')}</h2>
        <p class="sf-st__hint">{t('dt.wipe.1')}</p>
        <Button variant="danger" onPress={() => { setTyped(''); setWipeOpen(true); }}>{t('dt.wipe.btn')}</Button>
      </div>
      <Dialog
        open={wipeOpen}
        danger
        title={t('dt.wipe.title')}
        message={t('dt.wipe.msg', { word: WIPE_WORD })}
        confirmLabel={t('dt.wipe.confirm')}
        onCancel={() => setWipeOpen(false)}
        onConfirm={() => void wipe()}
      >
        <Input
          label={t('dt.wipe.input', { word: WIPE_WORD })}
          {...{ value: typed, autoCapitalize: 'characters', autoComplete: 'off' }}
          onInput={(e) => setTyped((e.currentTarget as HTMLInputElement).value)}
        />
      </Dialog>
    </section>
  );
}

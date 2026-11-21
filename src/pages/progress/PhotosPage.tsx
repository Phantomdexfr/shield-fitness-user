import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, Card, Dialog, EmptyState, SubPageHeader, showToast } from '../../ui/components';
import { MAX_PHOTOS, addPhoto, listPhotos, removePhoto, type ProgressPhoto } from '../../data/repos/photos';
import { dayLabel } from '../../shared/chartMath';
import { shrinkImage } from './photoResize';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; photos: ProgressPhoto[] };

/** `/progress/photos`: progress photos kept on this device only, with a side-by-side compare of any two. */
export default function PhotosPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [pick, setPick] = useState<string[]>([]);
  const [del, setDel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const read = () => {
    listPhotos().then((photos) => setLoad({ status: 'ready', photos }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);
  const head = <SubPageHeader title={t('page.photos.title')} onBack={() => goBack(navigate, '/progress')} backLabel={t('prog.back')} />;
  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('prog.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('prog.error')} actionLabel={t('rb.error.retry')} onAction={() => { setLoad({ status: 'loading' }); read(); }} /></section>;

  const { photos } = load;
  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setBusy(true);
    const img = await shrinkImage(f);
    const id = img ? await addPhoto(img.mime, img.data).catch(() => null) : null;
    setBusy(false);
    showToast(id ? t('photos.saved') : photos.length >= MAX_PHOTOS ? t('photos.err.full', { n: MAX_PHOTOS }) : t('photos.err.read'), { tone: id ? 'ok' : 'danger' });
    read();
  };
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1]!, id] : [...p, id]));
  const chosen = pick.map((id) => photos.find((p) => p.id === id)).filter((p): p is ProgressPhoto => !!p);
  const pair = chosen.length === 2 ? [...chosen].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.addedAt - b.addedAt)) : null;

  return (
    <section class="sf-page-body sf-rt">
      {head}
      <Card as="section" class="sf-pg__card">
        <h2 class="sf-pg__h">{t('photos.private.title')}</h2>
        <p class="sf-lib__note">{t('photos.private.body')}</p>
      </Card>
      <input ref={file} type="file" accept="image/*" hidden onChange={onFile} aria-label={t('photos.add')} />
      <Button disabled={busy} onPress={() => file.current?.click()}>{busy ? t('photos.busy') : t('photos.add')}</Button>

      {pair && (
        <Card as="section" class="sf-pg__card">
          <h2 class="sf-pg__h">{t('photos.compare')}</h2>
          <div class="sf-ph__pair">
            {pair.map((p, i) => (
              <figure key={p.id} class="sf-ph__fig">
                <img class="sf-ph__img" src={p.data} alt={t(i === 0 ? 'photos.before' : 'photos.after', { day: dayLabel(p.day, t, 'full') })} />
                <figcaption class="sf-rt__meta">{t(i === 0 ? 'photos.before' : 'photos.after', { day: dayLabel(p.day, t, 'full') })}</figcaption>
              </figure>
            ))}
          </div>
        </Card>
      )}

      {photos.length === 0 ? (
        <EmptyState icon="image" title={t('photos.empty.title')} hint={t('photos.empty.body')} />
      ) : (
        <>
          <p class="sf-lib__note">{t('photos.pick')}</p>
          <ul class="sf-ph__grid">
            {photos.map((p) => (
              <li key={p.id} class="sf-ph__cell">
                <button type="button" class={`sf-ph__btn${pick.includes(p.id) ? ' sf-ph__btn--on' : ''}`} aria-pressed={pick.includes(p.id)} onClick={() => toggle(p.id)}>
                  <img class="sf-ph__img" src={p.data} alt={dayLabel(p.day, t, 'full')} loading="lazy" />
                </button>
                <span class="sf-rt__meta">{dayLabel(p.day, t, 'short')}</span>
                <Button variant="ghost" onPress={() => setDel(p.id)}>{t('photos.delete')}</Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Dialog open={del !== null} title={t('photos.delete.title')} message={t('photos.delete.body')} danger confirmLabel={t('photos.delete')} onCancel={() => setDel(null)} onConfirm={() => { const id = del; setDel(null); if (id) removePhoto(id).then(() => { setPick((p) => p.filter((x) => x !== id)); read(); }, read); }} />
    </section>
  );
}

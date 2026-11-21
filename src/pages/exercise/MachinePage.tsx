import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation, useParams } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { useFeature } from '../../app/flags';
import { loadMachinePage, type MachinePageData } from '../../data/repos/exercisePage';
import { Badge, EmptyState, PhotoFrame, Sheet, SubPageHeader } from '../../ui/components';
import { galleryPhotos, groupMuscles, nice, statusTone, type GalleryPhoto } from './exerciseModel';
import { muscleLabel } from './muscleLabel';
import { exercisesRepo } from '../../data/repos/exercises';
import { loadMovementData, movementFor } from '../../data/repos/movement';
import { MovementSection, type MuscleChip } from '../../ui/movement/MovementSection';
import type { MovementData } from '../../shared/movement';
import { goBack } from '../../app/navBack';
import { machineStatusFor } from '../../data/repos/gymPolicy';

type State = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; data: MachinePageData };

/** `/machine/<slug>`: photo gallery, status, muscles, exercises on this machine. */
export default function MachinePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const photosOn = useFeature('machine_photos');
  const labOn = useFeature('machine_lab');
  const movementOn = useFeature('movement_map');
  const [mdata, setMdata] = useState<MovementData | null>(null);
  const [mi, setMi] = useState(0);
  const [mchips, setMchips] = useState<MuscleChip[]>([]);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const back = () => goBack(navigate, '/library?tab=machines');

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    setMi(0);
    loadMachinePage(slug).then(
      (data) => live && setState(data ? { status: 'ready', data } : { status: 'missing' }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [slug]);

  useEffect(() => {
    let live = true;
    if (movementOn) loadMovementData().then((d) => live && setMdata(d), () => undefined);
    return () => {
      live = false;
    };
  }, [movementOn]);

  const mapped = state.status === 'ready' ? state.data.exercises.filter((e) => movementFor(mdata, e.slug)) : [];
  const cur = mapped[Math.min(mi, Math.max(0, mapped.length - 1))];
  const curSlug = cur?.slug;
  useEffect(() => {
    let live = true;
    setMchips([]);
    if (curSlug)
      exercisesRepo.get(curSlug).then(
        (full) => {
          if (!live || !full) return;
          const g = groupMuscles(full.muscles, full.detail.notes);
          setMchips(g.primary.slice(0, 4).map((m) => ({ id: m.id, label: muscleLabel(m.id) })));
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [curSlug]);

  if (state.status !== 'ready') {
    return (
      <section class="sf-page-body sf-ex">
        <SubPageHeader title={t('page.machine.title')} onBack={back} backLabel={t('mc.back')} />
        {state.status === 'loading' ? <p class="sf-lib__note" role="status">{t('ex.loading')}</p> : <EmptyState icon="warning" title={state.status === 'missing' ? t('mc.unknown') : t('mc.error')} actionLabel={t('mc.back')} onAction={back} />}
      </section>
    );
  }

  const { machine, photos, exercises } = state.data;
  const gallery = galleryPhotos(photos);
  const gymStatus = machineStatusFor(machine.slug, machine.status);
  return (
    <section class="sf-page-body sf-ex">
      <SubPageHeader title={machine.name} onBack={back} backLabel={t('mc.back')} />
      <div class="sf-ex__chips">
        <Badge>{nice(machine.category)}</Badge>
        {machine.brand && <Badge>{machine.brand}</Badge>}
        <Badge tone={statusTone(gymStatus.status)}>{t(`lib.status.${gymStatus.status}` as StringKey)}</Badge>
        {machine.zone && <Badge>{`${t('mc.zone')}: ${machine.zone}`}</Badge>}
      </div>
      {gymStatus.note && <p class="sf-lib__note">{gymStatus.note}</p>}

      {labOn && (
        <Link href={`/machines/${machine.slug}/lab`} class="sf-lab__link">
          {t('mc.lab')}
        </Link>
      )}

      {photosOn && (
        <section aria-label={t('mc.photos')} class="sf-ex__block">
          {gallery.length === 0 ? (
            <PhotoFrame alt={t('mc.nophotos')} />
          ) : (
            <ul class="sf-ex__gallery">
              {gallery.map((p) => (
                <li key={p.thumb}>
                  <button type="button" class="sf-ex__gbtn" aria-label={t('mc.photo.open', { alt: p.alt })} onClick={() => setOpen(p)}>
                    <PhotoFrame src={p.thumb} alt={p.alt} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {movementOn && mdata && (
        <section aria-label={t('mm.title')} class="sf-ex__block">
          <h2 class="sf-ex__h">{t('mm.title')}</h2>
          {cur && movementFor(mdata, cur.slug) ? (
            <>
              <div class="sf-mm__nav-row">
                <button type="button" class="sf-mm__nav" aria-label={t('mm.prev')} disabled={mi <= 0} onClick={() => setMi(Math.max(0, mi - 1))}>
                  {'<'}
                </button>
                <span class="sf-mm__nav-name">{cur.name}</span>
                <button type="button" class="sf-mm__nav" aria-label={t('mm.next')} disabled={mi >= mapped.length - 1} onClick={() => setMi(Math.min(mapped.length - 1, mi + 1))}>
                  {'>'}
                </button>
              </div>
              <p class="sf-lib__note">{t('mm.count', { n: Math.min(mi, mapped.length - 1) + 1, total: mapped.length })}</p>
              <MovementSection pattern={movementFor(mdata, cur.slug)!.pattern} param={movementFor(mdata, cur.slug)!.param} name={cur.name} machineCategory={machine.category} chips={mchips} bare />
              <Link href={`/exercise/${cur.slug}`} class="sf-lab__link">
                {t('mm.open')}
              </Link>
            </>
          ) : (
            <p class="sf-lib__note">{t('mm.machine.none')}</p>
          )}
        </section>
      )}

      {machine.muscles.length > 0 && (
        <section aria-label={t('mc.muscles')} class="sf-ex__block">
          <h2 class="sf-ex__h">{t('mc.muscles')}</h2>
          <p class="sf-ex__line">{machine.muscles.map(muscleLabel).join(' · ')}</p>
        </section>
      )}

      {machine.cues.length > 0 && (
        <section aria-label={t('mc.cues')} class="sf-ex__block">
          <h2 class="sf-ex__h">{t('mc.cues')}</h2>
          <ul class="sf-ex__list">
            {machine.cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t('mc.exercises')} class="sf-ex__block">
        <h2 class="sf-ex__h">{t('mc.exercises')}</h2>
        {exercises.length === 0 ? (
          <p class="sf-lib__note">{t('mc.exercises.none')}</p>
        ) : (
          <ul class="sf-lib__list">
            {exercises.map((e) => (
              <li key={e.slug} class="sf-lib__row">
                <Link href={`/exercise/${e.slug}`} class="sf-lib__link">
                  <span class="sf-lib__name">{e.name}</span>
                  <span class="sf-lib__meta">{nice(e.category)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={machine.name} closeLabel={t('mc.photo.close')}>
        {open && <PhotoFrame src={open.detail} alt={open.alt} />}
      </Sheet>
    </section>
  );
}

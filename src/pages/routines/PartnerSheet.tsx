import { useEffect, useRef, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { Badge, Button, Sheet } from '../../ui/components';
import { loadPartners } from '../../data/repos/dayBuilder';
import type { Partner } from '../../shared/dayBuilder';

const SWIPE_PX = 60;

/** Superset swipe: one suggested partner at a time from the pairs data. Swipe right (or Superset with this) to pair, left (or Skip) for the next. */
export function PartnerSheet({ open, onClose, slug, name, onPick }: {
  open: boolean;
  onClose: () => void;
  slug: string;
  name: string;
  onPick: (partnerSlug: string) => void;
}) {
  const [list, setList] = useState<Partner[] | null>(null);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setList(null);
    setI(0);
    setFailed(false);
    loadPartners(slug).then((l) => live && setList(l), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, slug]);

  const cur = list?.[i];
  const next = () => setI((n) => n + 1);
  const pick = () => cur && onPick(cur.slug);
  const up = (x: number) => {
    const from = startX.current;
    startX.current = null;
    if (from === null) return;
    const dx = x - from;
    if (dx >= SWIPE_PX) pick();
    else if (dx <= -SWIPE_PX) next();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('db.ss.title', { name })}>
      <div class="sf-rt__menu">
        {failed ? (
          <p class="sf-rt__err" role="alert">{t('db.error')}</p>
        ) : list === null ? (
          <p class="sf-rt__meta" role="status">{t('db.loading')}</p>
        ) : list.length === 0 ? (
          <p class="sf-rt__meta">{t('db.ss.none')}</p>
        ) : cur ? (
          <>
            <p class="sf-rt__meta">{t('db.ss.hint')}</p>
            <div
              class="sf-db__swipe"
              role="group"
              aria-label={cur.name}
              onPointerDown={(e) => { startX.current = (e as PointerEvent).clientX; }}
              onPointerUp={(e) => up((e as PointerEvent).clientX)}
              onPointerCancel={() => { startX.current = null; }}
            >
              <span class="sf-rt__meta">{t('db.ss.count', { n: i + 1, total: list.length })}</span>
              <span class="sf-db__swipe-name">{cur.name}</span>
              <Badge tone={cur.type === 'antagonist' ? 'gold' : 'neutral'}>{t(`db.ss.${cur.type === 'antagonist' ? 'antagonist' : 'compatible'}` as StringKey)}</Badge>
              {cur.muscles.length > 0 && <span class="sf-rt__meta">{cur.muscles.join(' + ')}</span>}
            </div>
            <Button onPress={pick}>{t('db.ss.add')}</Button>
            <Button variant="secondary" onPress={next}>{t('db.ss.skip')}</Button>
          </>
        ) : (
          <>
            <p class="sf-rt__meta" role="status">{t('db.ss.end')}</p>
            <Button variant="secondary" onPress={() => setI(0)}>{t('db.ss.again')}</Button>
          </>
        )}
        <Button variant="ghost" onPress={onClose}>{t('rb.w.done')}</Button>
      </div>
    </Sheet>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Button, Sheet, showToast } from '../../ui/components';
import type { Routine } from '../../shared/routine';
import { refKey } from '../../shared/routineEdit';
import type { ImageLabels } from '../../shared/routineImage';
import type { ExInfo } from '../../data/repos/routineEdit';
import { browserShareEnv, canvasBlob, drawRoutineImage, fontsReady, imageFileName, paletteFromCss, shareOrDownload } from './routineImageCanvas';

const labels = (): ImageLabels => ({
  footer: t('app.name'),
  days: (n) => t(n === 1 ? 'ri.days.one' : 'ri.days.many', { n }),
  more: (n) => t('ri.more', { n }),
  empty: t('ri.empty'),
  untitled: t('ri.untitled'),
});

/** The routine drawn as a 1080 x 1350 picture on this phone. Share it (share sheet) or save it (download). Nothing is uploaded. */
export function RoutineImageSheet({ open, onClose, routine, info }: { open: boolean; onClose: () => void; routine: Routine; info: ReadonlyMap<string, ExInfo> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'drawing' | 'ready' | 'error'>('drawing');
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setState('drawing');
    const p = paletteFromCss();
    void fontsReady(p).then(() => {
      if (!live || !ref.current) return;
      const nameOf = (r: Routine['days'][number]['items'][number]['ref']) => info.get(refKey(r))?.name ?? (r.kind === 'lib' ? r.slug : t('ri.custom'));
      const layout = drawRoutineImage(ref.current, routine, nameOf, labels(), p);
      if (!layout) return setState('error');
      setHidden(layout.hidden);
      setState('ready');
    });
    return () => {
      live = false;
    };
  }, [open, routine, info]);

  const out = async (): Promise<void> => {
    const blob = ref.current ? await canvasBlob(ref.current) : null;
    if (!blob) {
      showToast(t('ri.fail'), { tone: 'danger' });
      return;
    }
    const res = await shareOrDownload(blob, imageFileName(routine.name), routine.name, browserShareEnv());
    if (res === 'downloaded') showToast(t('ri.saved'), { tone: 'ok' });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('ri.title')}>
      <div class="sf-ri">
        <canvas ref={ref} class="sf-ri__canvas" role="img" aria-label={t('ri.alt', { name: routine.name })} />
        {state === 'drawing' && <p class="sf-lib__note" role="status">{t('ri.drawing')}</p>}
        {state === 'error' && <p class="sf-lib__note" role="alert">{t('ri.fail')}</p>}
        {hidden > 0 && <p class="sf-lib__note">{t('ri.hidden', { n: hidden })}</p>}
        <p class="sf-lib__note">{t('ri.note')}</p>
        <Button variant="primary" disabled={state !== 'ready'} onPress={() => void out()}>{t('ri.share')}</Button>
      </div>
    </Sheet>
  );
}

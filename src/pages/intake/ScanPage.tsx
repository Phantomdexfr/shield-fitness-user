import { useEffect, useRef, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Card, Input, Segmented, SubPageHeader, Row } from '../../ui/components';
import { NUTRIENTS, hasServing, normalizeBarcode, nutrientText, type BarcodeError, type Nutrient, type Product } from '../../shared/barcode';
import { lookupBarcode, type LookupResult } from '../../data/repos/barcode';
import { proteinForPortion, type Portion, type PortionError } from '../../shared/intake';
import { addProteinEntry, proteinToday, removeIntake } from '../../data/repos/intake';
import { createDetector } from './detector';
import { goBack } from '../../app/navBack';

type Per = '100' | 'serving';
type Phase = { kind: 'idle' } | { kind: 'looking' } | { kind: 'done'; result: LookupResult };

const NUTRIENT_KEY: Record<Nutrient, StringKey> = {
  kcal: 'bc.n.kcal',
  protein: 'bc.n.protein',
  carbs: 'bc.n.carbs',
  fat: 'bc.n.fat',
  sugar: 'bc.n.sugar',
  salt: 'bc.n.salt',
};
const UNIT: Record<Nutrient, string> = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', sugar: 'g', salt: 'g' };
const INPUT_ERROR: Record<BarcodeError, StringKey> = { empty: 'bc.err.empty', chars: 'bc.err.chars', length: 'bc.err.length', checksum: 'bc.err.checksum' };

/** Which camera message to show for a getUserMedia failure. */
function cameraMessage(name: string | undefined): string {
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    const standalone = (navigator as { standalone?: boolean }).standalone === true;
    return standalone ? t('bc.cam.denied.ios') : t('bc.cam.denied');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('bc.cam.none');
  if (name === 'NotReadableError' || name === 'AbortError') return t('bc.cam.busy');
  return t('bc.cam.fail');
}

/** The camera view. It starts only after the Scan tap that mounted it, stops the camera on close or on a good read, and ignores reads that are not a valid code. */
function CameraScan({ onCode, onClose, onProblem }: { onCode: (code: string) => void; onClose: () => void; onProblem: (msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return onProblem(t('bc.cam.unsupported'));
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        return onProblem(cameraMessage((e as { name?: string })?.name));
      }
      if (stop) return stream.getTracks().forEach((tr) => tr.stop());
      const v = video.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      let det: Awaited<ReturnType<typeof createDetector>>;
      try {
        det = await createDetector();
      } catch {
        return onProblem(t('bc.cam.detector'));
      }
      const tick = async () => {
        if (stop) return;
        if (v.videoWidth > 0) {
          const raw = await det.read(v).catch(() => null);
          const n = raw === null ? null : normalizeBarcode(raw);
          if (n && n.ok && !stop) return onCode(n.code);
        }
        timer = window.setTimeout(tick, 300);
      };
      tick();
    })();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);
  return (
    <div class="sf-ps__scan">
      <video ref={video} class="sf-ps__video" playsInline muted aria-label={t('bc.cam.label')} />
      <p class="sf-rt__meta" role="status">{t('bc.cam.hint')}</p>
      <Button variant="secondary" onPress={onClose}>{t('rb.cancel')}</Button>
    </div>
  );
}

const ADD_ERROR: Record<PortionError, StringKey> = { bad_amount: 'bc.add.err.bad_amount', no_serving: 'bc.add.err.no_serving', no_protein: 'bc.add.err.no_protein', too_much: 'bc.add.err.too_much' };
type Choice = '0.5' | '1' | '2' | 'g';
const PICK_LABEL: Record<Choice, StringKey> = { '0.5': 'bc.add.half', '1': 'bc.add.one', '2': 'bc.add.two', g: 'bc.add.grams' };

/** "Add protein to today": a portion (1/2, 1, 2 servings or grams) becomes one protein-only intake entry. The card itself is never logged. */
function AddProtein({ product }: { product: Product }) {
  const canServe = product.perServing.protein !== null;
  const [pick, setPick] = useState<Choice>(canServe ? '1' : 'g');
  const [grams, setGrams] = useState('');
  const [added, setAdded] = useState<{ id: string; n: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const active: Choice = pick !== 'g' && !canServe ? 'g' : pick;
  const portion: Portion = active === 'g' ? { kind: 'grams', g: Number(grams.replace(',', '.')) } : { kind: 'servings', n: Number(active) };
  const calc = proteinForPortion(product, portion);
  const add = async () => {
    setMsg(null);
    if (!calc.ok) return setMsg(t(ADD_ERROR[calc.error]));
    const id = await addProteinEntry(calc.grams).catch(() => null);
    if (id === null) return setMsg(t('bc.add.err.save'));
    const sum = await proteinToday().catch(() => null);
    setAdded({ id, n: calc.grams });
    setTotal(sum);
  };
  const undo = async () => {
    if (!added) return;
    await removeIntake(added.id).catch(() => undefined);
    setTotal(await proteinToday().catch(() => null));
    setAdded(null);
    setMsg('undone');
  };
  const options = [...(canServe ? (['0.5', '1', '2'] as Choice[]) : []), 'g' as Choice].map((v) => ({ value: v, label: t(PICK_LABEL[v]) }));
  return (
    <div class="sf-bc__add">
      <h3 class="sf-pg__h">{t('bc.add.title')}</h3>
      <p class="sf-rt__meta">{t('bc.add.how')}</p>
      <Segmented label={t('bc.add.portion')} value={active} onChange={(v) => { setPick(v === 'g' ? 'g' : v === '0.5' ? '0.5' : v === '2' ? '2' : '1'); setAdded(null); setMsg(null); }} options={options} />
      {active === 'g' && <Input label={t('bc.add.g.label')} {...{ value: grams, inputMode: 'decimal', autoComplete: 'off' }} onInput={(e) => { setGrams((e.target as HTMLInputElement).value); setAdded(null); setMsg(null); }} />}
      {calc.ok && <p class="sf-rt__meta" role="status">{t('bc.add.preview', { n: calc.grams })}</p>}
      <Button variant="primary" onPress={add}>{t('bc.add.button')}</Button>
      {added && <p class="sf-rt__meta" role="status">{t('bc.add.done', { n: added.n, total: total ?? added.n })}</p>}
      {added && <Button variant="secondary" onPress={undo}>{t('bc.add.undo', { n: added.n })}</Button>}
      {msg === 'undone' && <p class="sf-rt__meta" role="status">{t('bc.add.undone', { total: total ?? 0 })}</p>}
      {msg !== null && msg !== 'undone' && <p class="sf-rt__err" role="alert">{msg}</p>}
      <Row href="/intake">{t('bc.add.link')}</Row>
    </div>
  );
}

function NutritionCard({ product, fromCache }: { product: Product; fromCache: boolean }) {
  const [per, setPer] = useState<Per>('100');
  const serving = hasServing(product);
  const set = per === 'serving' && serving ? product.perServing : product.per100;
  return (
    <Card as="section" class="sf-pg__card">
      <h2 class="sf-pg__h">{product.name}</h2>
      {product.brand && <p class="sf-rt__meta">{product.brand}</p>}
      {product.quantity && <p class="sf-rt__meta">{t('bc.pack', { q: product.quantity })}</p>}
      <p class="sf-rt__meta">{product.servingText ? t('bc.serving', { s: product.servingText }) : t('bc.serving.none')}</p>
      <Segmented
        label={t('bc.per')}
        value={per === 'serving' && !serving ? '100' : per}
        onChange={(v) => setPer(v === 'serving' ? 'serving' : '100')}
        options={[{ value: '100', label: t('bc.per.100') }, ...(serving ? [{ value: 'serving', label: t('bc.per.serving') }] : [])]}
      />
      <dl class="sf-bc__list">
        {NUTRIENTS.map((n) => (
          <div key={n} class="sf-bc__row">
            <dt>{t(NUTRIENT_KEY[n])}</dt>
            <dd>{set[n] === null ? <span aria-label={t('bc.unknown')}>-</span> : `${nutrientText(set[n])} ${UNIT[n]}`}</dd>
          </div>
        ))}
      </dl>
      {!serving && <p class="sf-rt__meta">{t('bc.serving.missing')}</p>}
      {fromCache && <p class="sf-rt__meta">{t('bc.cached')}</p>}
      <p class="sf-rt__meta">{t('bc.credit')}</p>
      <AddProtein product={product} />
    </Card>
  );
}

const RESULT_TEXT: Record<'not_found' | 'offline' | 'malformed' | 'server', StringKey> = {
  not_found: 'bc.res.notfound',
  offline: 'bc.res.offline',
  malformed: 'bc.res.malformed',
  server: 'bc.res.server',
};

/** `/intake/scan`: scan a packaged-food barcode (or type it) and see its nutrition card. No food log; nothing is stored except the last 50 looked-up products. */
export default function ScanPage() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // Every call comes from a tap (Look up) or from a code read by the camera the person started with the Scan tap.
  const look = (raw: string) => {
    setPhase({ kind: 'looking' });
    lookupBarcode(raw).then((result) => setPhase({ kind: 'done', result }), () => setPhase({ kind: 'done', result: { status: 'server' } }));
  };
  const scanStart = () => {
    setProblem(null);
    setPhase({ kind: 'idle' });
    setCamera(true);
  };
  const scanned = (c: string) => {
    setCamera(false);
    setCode(c);
    look(c);
  };
  const cameraProblem = (msg: string) => {
    setCamera(false);
    setProblem(msg);
  };

  const res = phase.kind === 'done' ? phase.result : null;
  return (
    <section class="sf-page-body sf-rt">
      <SubPageHeader title={t('page.scan.title')} onBack={() => goBack(navigate, '/intake')} backLabel={t('prog.back')} />
      <Card as="section" class="sf-pg__card">
        {camera ? (
          <CameraScan onCode={scanned} onClose={() => setCamera(false)} onProblem={cameraProblem} />
        ) : (
          <Button variant="primary" onPress={scanStart}>{t('bc.scan')}</Button>
        )}
        {problem && <p class="sf-rt__err" role="alert">{problem}</p>}
        <Input label={t('bc.field')} hint={t('bc.field.hint')} {...{ value: code, inputMode: 'numeric', autoComplete: 'off' }} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        <Button variant="secondary" onPress={() => look(code)} disabled={phase.kind === 'looking'}>{t('bc.lookup')}</Button>
      </Card>

      {phase.kind === 'looking' && <p class="sf-lib__note" role="status">{t('bc.looking')}</p>}
      {res && res.status === 'invalid' && <p class="sf-rt__err" role="alert">{t(INPUT_ERROR[res.error])}</p>}
      {res && res.status !== 'invalid' && res.status !== 'found' && <p class="sf-rt__err" role="alert">{t(RESULT_TEXT[res.status])}</p>}
      {res && res.status === 'found' && <NutritionCard key={res.product.code} product={res.product} fromCache={res.fromCache} />}
      <p class="sf-rt__meta">{t('bc.note')}</p>
    </section>
  );
}

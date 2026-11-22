import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { t } from '../../i18n';
import type { StringKey } from '../../i18n';
import { Button } from '../components/Button';
import { Segmented } from '../components/Choice';
import { cx } from '../components/util';
import { tick } from '../components/haptics';
import { loadFigure, peekFigure, type Figure, type Sex, type Unit, type View } from './figures';
import { FALLBACK, expand, lookup, parentOf, type MuscleId } from './taxonomy';

export type BodyMode = 'pick-one' | 'pick-many' | 'heat' | 'recovery' | 'marks' | 'view';
export type HeatBand = 0 | 1 | 2 | 3 | 4 | 5;
export type RecoveryState = 'fatigued' | 'recovering' | 'ready' | 'fresh';
export type MarkKind = 'avoid' | 'sore';
export type Emphasis = 'primary' | 'secondary';

export interface BodyPickerProps {
  mode: BodyMode;
  sex: Sex;
  view: View;
  onViewChange?: (v: View) => void;
  onSexChange?: (s: Sex) => void;
  value?: MuscleId[];
  onChange?: (ids: MuscleId[]) => void;
  heat?: Record<MuscleId, HeatBand>;
  /** Compare mode (Phase 44): less work than the other period, drawn in the steel ramp (never red). `heat` then holds the gains. */
  loss?: Record<MuscleId, HeatBand>;
  recovery?: Record<MuscleId, RecoveryState>;
  /** Muscle badges (Phase 47): tier position 0 (Wood) to 8 (Olympian) per ranked muscle, drawn in the tier colours. */
  tier?: Record<MuscleId, number>;
  marks?: Record<MuscleId, MarkKind>;
  emphasis?: Record<MuscleId, Emphasis>;
  onSelect?: (id: MuscleId) => void;
  size?: 'full' | 'compact' | 'mini';
  showScan?: boolean;
  class?: string;
}

const SWIPE_MIN = 60;
const SWIPE_RATIO = 1.5;
const LONG_PRESS_MS = 500;
const SNAP_PX = 22;
const SMALL_PX = 44;
const VIEWBOX = { x: 170, y: 30, w: 684, h: 1440 };

const muscleName = (id: string) => t(`muscle.${id}` as StringKey);

/** Visual state of one muscle. Order of precedence: marks > selected > emphasis > recovery > heat > idle. */
export function stateClass(id: MuscleId, p: Pick<BodyPickerProps, 'mode' | 'heat' | 'recovery' | 'marks' | 'emphasis' | 'tier'> & { loss?: BodyPickerProps['loss'] }, selected: ReadonlySet<MuscleId>, soft: ReadonlySet<MuscleId>): string {
  const mark = p.mode === 'marks' || p.marks ? lookup(p.marks, id) : undefined;
  if (mark) return `sf-body__u--${mark}`;
  if (selected.has(id)) return 'sf-body__u--sel';
  const em = lookup(p.emphasis, id);
  if (em) return em === 'primary' ? 'sf-body__u--pri' : 'sf-body__u--sec';
  const rec = lookup(p.recovery, id);
  if (rec) return `sf-body__u--rec-${rec}`;
  const tr = lookup(p.tier, id);
  if (tr !== undefined) return `sf-body__u--tier-${tr}`;
  const lo = lookup(p.loss, id);
  if (lo !== undefined) return `sf-body__u--loss-${lo}`;
  const h = lookup(p.heat, id);
  if (h !== undefined) return `sf-body__u--heat-${h}`;
  if (soft.has(id)) return 'sf-body__u--soft';
  return '';
}

/** Spoken state for a muscle, appended to its aria-label. */
function stateWords(id: MuscleId, cls: string, p: BodyPickerProps): string[] {
  const out: string[] = [];
  if (cls.includes('--avoid')) out.push(t('body.state.avoid'));
  else if (cls.includes('--sore')) out.push(t('body.state.sore'));
  else if (cls.includes('--sel')) out.push(t('body.state.selected'));
  else if (cls.includes('--pri')) out.push(t('body.state.primary'));
  else if (cls.includes('--sec')) out.push(t('body.state.secondary'));
  const rec = lookup(p.recovery, id);
  if (rec) out.push(t(`body.rec.${rec}` as StringKey));
  const tr = lookup(p.tier, id);
  if (tr !== undefined) out.push(t(`badge.tier.${tr}` as StringKey));
  const lo = lookup(p.loss, id);
  if (lo !== undefined) out.push(t('hm.state.loss', { n: lo }));
  const h = lookup(p.heat, id);
  if (h !== undefined) out.push(t('body.state.heat', { n: h }));
  return out;
}

export function BodyPicker(props: BodyPickerProps) {
  const { mode, sex, view, size = 'full', showScan = false } = props;
  const mini = size === 'mini';
  const picking = mode === 'pick-one' || mode === 'pick-many';
  const [fig, setFig] = useState<Figure | undefined>(() => peekFigure(sex, view));
  const [zoom, setZoom] = useState(false);
  const [caption, setCaption] = useState('');
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | undefined>();
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | undefined; fired: boolean }>({ timer: undefined, fired: false });

  useEffect(() => {
    let live = true;
    const hit = peekFigure(sex, view);
    if (hit) setFig(hit);
    else {
      setFig(undefined);
      loadFigure(sex, view).then((f) => live && setFig(f)).catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [sex, view]);

  const value = props.value;
  const selected = useMemo(() => {
    const s = new Set<MuscleId>();
    if (picking) for (const id of value ?? []) for (const e of expand(id)) s.add(e);
    return s;
  }, [picking, value]);

  /** Fallback regions: selected muscles with no drawn region tint their surface neighbour softly. */
  const soft = useMemo(() => {
    const s = new Set<MuscleId>();
    const ids = new Set<MuscleId>(picking ? (value ?? []) : [...Object.keys(props.emphasis ?? {}), ...Object.keys(props.heat ?? {}), ...Object.keys(props.tier ?? {})]);
    for (const id of ids) for (const f of FALLBACK[id] ?? []) for (const e of expand(f)) s.add(e);
    return s;
  }, [picking, value, props.emphasis, props.heat, props.tier]);

  const units = useMemo(() => (fig ? [...fig.units].sort((a, b) => Number(b.muscle === 'neck') - Number(a.muscle === 'neck')) : []), [fig]);
  /** Companion hit paths: large first, small last so small regions win overlaps. */
  const hitUnits = useMemo(() => [...units].sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3]), [units]);

  const cls = new Map<string, string>();
  for (const u of units) cls.set(u.id, stateClass(u.muscle, props, selected, soft));

  const activate = (id: MuscleId, group = false) => {
    if (mini) return;
    const target = group ? parentOf(id) : id;
    if (picking && props.onChange) {
      const cur = value ?? [];
      const has = cur.includes(target);
      props.onChange(mode === 'pick-one' ? (has && !group ? [] : [target]) : has ? cur.filter((x) => x !== target) : [...cur, target]);
    } else props.onSelect?.(id);
    setCaption(muscleName(id));
    tick();
  };

  const idOfEvent = (e: Event): { unit: Unit; id: MuscleId } | undefined => {
    const el = (e.target as Element | null)?.closest?.('[data-unit]');
    const uid = el?.getAttribute('data-unit');
    const unit = uid ? units.find((u) => u.id === uid) : undefined;
    return unit ? { unit, id: unit.muscle } : undefined;
  };

  const clearPress = () => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = undefined;
  };

  const onPointerDown = (e: JSX.TargetedPointerEvent<SVGSVGElement>) => {
    if (mini) return;
    gesture.current = { x: e.clientX, y: e.clientY };
    press.current.fired = false;
    const hit = idOfEvent(e);
    if (hit && picking) {
      clearPress();
      press.current.timer = setTimeout(() => {
        press.current.fired = true;
        activate(hit.id, true);
      }, LONG_PRESS_MS);
    }
  };

  const nearestSmall = (clientX: number, clientY: number): Unit | undefined => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const r = svg.getBoundingClientRect();
    if (!r.width) return undefined;
    const k = r.width / VIEWBOX.w;
    const px = (clientX - r.left) / k + VIEWBOX.x;
    const py = (clientY - r.top) / k + VIEWBOX.y;
    let best: Unit | undefined;
    let bestD = SNAP_PX / k;
    for (const u of units) {
      if (u.box[2] * k >= SMALL_PX) continue;
      const d = Math.hypot(px - (u.box[0] + u.box[2] / 2), py - (u.box[1] + u.box[3] / 2));
      if (d <= bestD) {
        best = u;
        bestD = d;
      }
    }
    return best;
  };

  const onPointerUp = (e: JSX.TargetedPointerEvent<SVGSVGElement>) => {
    clearPress();
    const g = gesture.current;
    gesture.current = null;
    if (mini || !g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) {
      props.onViewChange?.(view === 'front' ? 'back' : 'front');
      return;
    }
    if (press.current.fired) return;
    const hit = idOfEvent(e);
    if (hit) activate(hit.id);
    else {
      const near = nearestSmall(e.clientX, e.clientY);
      if (near) activate(near.muscle);
    }
  };

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<SVGSVGElement>) => {
    if (mini) return;
    const hit = idOfEvent(e);
    if (e.key === 'Enter' || e.key === ' ') {
      if (hit) {
        e.preventDefault();
        activate(hit.id);
      }
    } else if (e.key === 'Escape') {
      if (mode === 'pick-one' && (value?.length ?? 0) > 0) props.onChange?.([]);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const paths = [...(svgRef.current?.querySelectorAll<SVGElement>('[data-unit][role="button"]') ?? [])];
      const i = hit ? paths.findIndex((p) => p.getAttribute('data-unit') === hit.unit.id) : -1;
      const next = paths[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + paths.length) % paths.length];
      next?.focus();
    }
  };

  const onMove = (e: JSX.TargetedPointerEvent<SVGSVGElement>) => {
    if (mini || e.pointerType !== 'mouse') return;
    const hit = idOfEvent(e);
    const fr = frameRef.current?.getBoundingClientRect();
    if (hit && fr) {
      const label = muscleName(hit.id) + (hit.unit.tier === 'approximate' ? ` (${t('body.approx')})` : '');
      setHover({ name: label, x: Math.min(Math.max(e.clientX - fr.left, 8), Math.max(fr.width - 8, 8)), y: Math.max(e.clientY - fr.top - 36, 4) });
    } else setHover(undefined);
  };

  const figLabel = t('body.figure', { sex: t(`body.sex.${sex}` as StringKey), view: t(`body.view.${view}` as StringKey) });
  const firstOf = new Set<string>();
  const regionAttrs = (u: Unit) => {
    const label = muscleName(u.muscle) + (u.tier === 'approximate' ? ` (${t('body.approx')})` : '');
    const words = stateWords(u.muscle, cls.get(u.id) ?? '', props);
    return { label: words.length ? `${label}, ${words.join(', ')}` : label, name: label };
  };

  return (
    <div class={cx('sf-body', `sf-body--${size}`, zoom && 'sf-body--zoom', showScan && 'sf-body--scan', props.class)} data-mode={mode}>
      {!mini && (
        <div class="sf-body__bar">
          {props.onSexChange && (
            <Button variant="secondary" onPress={() => props.onSexChange?.(sex === 'male' ? 'female' : 'male')}>{t('body.switch')}</Button>
          )}
          <Segmented<View> label={t('body.view.label')} value={view} onChange={(v) => props.onViewChange?.(v)} options={[{ value: 'front', label: t('body.view.front') }, { value: 'back', label: t('body.view.back') }]} />
        </div>
      )}
      <div class="sf-body__frame" ref={frameRef}>
        <div class="sf-body__stage">
          {!fig && <div class="sf-body__loading" role="status">{t('body.loading')}</div>}
          {fig && (
            <svg
              ref={svgRef}
              class="sf-body__svg"
              viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
              role={mini ? 'img' : 'group'}
              aria-label={figLabel}
              data-sex={sex}
              data-view={view}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                clearPress();
                gesture.current = null;
              }}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(undefined)}
              onKeyDown={onKeyDown}
            >
              <defs>
                <pattern id="sf-body-hatch-avoid" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="14" height="14" class="sf-body__pat-bg" />
                  <rect width="6" height="14" class="sf-body__pat-avoid" />
                </pattern>
                <pattern id="sf-body-hatch-sore" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <rect width="14" height="14" class="sf-body__pat-bg" />
                  <rect width="6" height="14" class="sf-body__pat-sore" />
                </pattern>
                {units.map((u, i) => u.clip && <clipPath id={`sf-body-${sex}-${view}-${i}`} key={u.id}><polygon points={u.clip.map((p) => p.join(',')).join(' ')} /></clipPath>)}
              </defs>
              <path class="sf-body__glow" d={fig.outline} />
              <path class="sf-body__outline" d={fig.outline} />
              {!mini && hitUnits.map((u) => <path key={`h-${u.id}`} class="sf-body__hit" d={u.d} data-unit={u.id} aria-hidden="true" />)}
              {units.map((u, i) => {
                const a = regionAttrs(u);
                const first = !firstOf.has(u.muscle);
                firstOf.add(u.muscle);
                const c = cls.get(u.id) ?? '';
                return (
                  <path
                    key={u.id}
                    id={u.id.replace(/:/g, '-')}
                    class={cx('sf-body__u', u.tier === 'approximate' && 'sf-body__u--ap', c)}
                    d={u.d}
                    data-unit={u.id}
                    data-m={u.muscle}
                    data-name={a.name}
                    clip-path={u.clip ? `url(#sf-body-${sex}-${view}-${i})` : undefined}
                    {...(mini ? {} : { role: 'button', 'aria-label': a.label, tabIndex: first ? 0 : -1, 'aria-pressed': picking ? selected.has(u.muscle) : undefined })}
                  />
                );
              })}
            </svg>
          )}
        </div>
        {hover && <div class="sf-body__tip" style={{ left: `${hover.x}px`, top: `${hover.y}px` }}>{hover.name}</div>}
      </div>
      {!mini && (
        <div class="sf-body__foot">
          <p class="sf-body__caption" aria-live="polite">{caption || t('body.caption.none')}</p>
          <Button variant="secondary" aria-pressed={zoom} onPress={() => setZoom(!zoom)}>{zoom ? t('body.zoom.out') : t('body.zoom.in')}</Button>
        </div>
      )}
    </div>
  );
}


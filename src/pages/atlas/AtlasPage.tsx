import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Chip, EmptyState, Input, Segmented, Sheet, SkeletonText, SubPageHeader, Toggle } from '../../ui/components';
import { BodyPicker, type Sex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { useFeature } from '../../app/flags';
import { ATLAS, FIRST_FRAME_MS, REGIONS, chooseRenderer, drawnIds, filterUnits, groupByRegion, isLowPower, lowPowerReasons, regionOf, rowById, sceneSettings, shouldAskBeforeDownload, unitsForRegion, type AtlasRow, type PowerEnv, type Region } from '../../atlas/logic';
import { modelUrl, readPowerEnv, readPowerEnvSync, reducedMotion, rendererEnv } from '../../atlas/env';
import { ATLAS_CREDITS } from '../../atlas/credits';
import type { AtlasScene } from '../../atlas/scene';
import { goBack } from '../../app/navBack';

type FallbackReason = 'no-webgl' | 'no-decompression' | 'chosen' | 'failed' | 'slow' | 'lost';
type Phase = { kind: 'boot' } | { kind: 'ask' } | { kind: 'loading' } | { kind: 'ready' } | { kind: 'fallback'; reason: FallbackReason };
type ViewChoice = 'front' | 'back' | 'side' | 'reset';

const regionLabel = (r: Region | 'all'): string => t(`atlas.region.${r}` as StringKey);

/** `/atlas`: what each muscle does in everyday life. 3D hologram (lazy), or the 2D figure when 3D is not possible. Same list and panel either way. */
export default function AtlasPage() {
  const [, navigate] = useLocation();
  const on = useFeature('holo_atlas');
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<AtlasScene | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'boot' });
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [same, setSame] = useState<AtlasRow[]>([]);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region | 'all'>('all');
  const [credits, setCredits] = useState(false);
  const [lowSetting, setLowSetting] = useState(false);
  const [power, setPower] = useState<PowerEnv>(() => readPowerEnvSync());
  const [sex] = useFigureSex();
  const [view2d, setView2d] = useState<View>('front');
  const [view3, setView3] = useState<ViewChoice>('front');

  const reduced = reducedMotion();
  const autoReasons = lowPowerReasons({ ...power, userSetting: false });
  const lowPower = isLowPower({ ...power, userSetting: lowSetting });
  const settings = useMemo(() => sceneSettings({ lowPower, reducedMotion: reduced, devicePixelRatio: window.devicePixelRatio }), [lowPower, reduced]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let live = true;
    readPowerEnv().then((p) => live && setPower(p));
    return () => { live = false; };
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    sceneRef.current?.dispose();
    sceneRef.current = null;
  };
  const toFallback = (reason: FallbackReason) => {
    stop();
    setPhase({ kind: 'fallback', reason });
  };

  const start3d = () => {
    stop();
    setPhase({ kind: 'loading' });
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = window.setTimeout(() => { if (abortRef.current === ac) toFallback('slow'); }, FIRST_FRAME_MS);
    const fetchBuffer = async (file: 'body.bin' | 'fit.bin') => {
      const r = await fetch(modelUrl(file), { signal: ac.signal });
      if (!r.ok) throw new Error(`atlas ${file} ${r.status}`);
      return r.arrayBuffer();
    };
    (async () => {
      const [mod, metaRes] = await Promise.all([import('../../atlas/scene'), fetch(modelUrl('meta.json'), { signal: ac.signal })]);
      if (!metaRes.ok) throw new Error(`atlas meta ${metaRes.status}`);
      const meta = await metaRes.json();
      if (ac.signal.aborted || !host.current) throw new DOMException('aborted', 'AbortError');
      const sc = await mod.createScene({
        host: host.current,
        fetchBuffer,
        meta,
        settings: settingsRef.current,
        units: ATLAS.map((r) => ({ muscleId: r.muscleId, meshKeys: r.meshKeys })),
        onPick: (id) => { if (id) { setSelected(id); setSheet(true); setSame([]); } else { setSelected(null); setSheet(false); } },
        onContextLost: () => toFallback('lost'),
        signal: ac.signal,
      });
      if (ac.signal.aborted) { sc.dispose(); return; }
      window.clearTimeout(timer);
      sceneRef.current = sc;
      setPhase({ kind: 'ready' });
    })().catch((e: unknown) => {
      window.clearTimeout(timer);
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (abortRef.current === ac) toFallback('failed');
    });
  };

  useEffect(() => {
    if (!on) return;
    const choice = chooseRenderer(rendererEnv());
    if (choice.kind === '2d') setPhase({ kind: 'fallback', reason: choice.reason });
    else if (shouldAskBeforeDownload(readPowerEnvSync())) setPhase({ kind: 'ask' });
    else start3d();
    return stop;
  }, [on]);

  useEffect(() => { sceneRef.current?.setSettings(settings); }, [settings]);
  useEffect(() => { sceneRef.current?.select(selected); }, [selected, phase.kind]);

  const pickUnit = (id: string) => {
    setSelected(id);
    setSheet(true);
    setSame([]);
  };
  const head = <SubPageHeader title={t('atlas.title')} onBack={() => goBack(navigate, '/body')} backLabel={t('atlas.back')} />;
  if (!on) return <div class="sf-atlas">{head}<EmptyState icon="info" title={t('atlas.off.title')} hint={t('atlas.off.hint')} /></div>;

  const row = selected ? rowById(selected) : undefined;
  const shown = filterUnits(ATLAS, query, region);
  const groups = groupByRegion(shown);
  const fallback = phase.kind === 'fallback';
  const stageOn = phase.kind === 'loading' || phase.kind === 'ready';
  const view3d = (v: ViewChoice) => { setView3(v === 'reset' ? 'front' : v); sceneRef.current?.view(v); };
  const onRegionTap = (id: string) => {
    const units = unitsForRegion(id);
    const first = units[0];
    if (!first) return;
    setSelected(first.muscleId);
    setSheet(true);
    setSame(units.slice(1));
  };

  return (
    <div class="sf-atlas">
      {head}
      <p class="sf-atlas__note">{t('atlas.intro')}</p>

      {phase.kind === 'ask' && (
        <div class="sf-atlas__ask">
          <h2 class="sf-atlas__h">{t('atlas.ask.title')}</h2>
          <p class="sf-atlas__note">{t('atlas.ask.hint')}</p>
          <div class="sf-atlas__row">
            <Button onPress={start3d}>{t('atlas.ask.go')}</Button>
            <Button variant="secondary" onPress={() => setPhase({ kind: 'fallback', reason: 'chosen' })}>{t('atlas.cancel')}</Button>
          </div>
        </div>
      )}

      <div class={stageOn ? 'sf-atlas__stage' : 'sf-atlas__stage sf-atlas__stage--off'} aria-label={t('atlas.stage')}>
        <div ref={host} class="sf-atlas__host" data-ready={phase.kind === 'ready' ? '1' : '0'} />
        {phase.kind === 'loading' && (
          <div class="sf-atlas__loading" role="status">
            <SkeletonText lines={3} />
            <p class="sf-atlas__note">{t('atlas.loading')}</p>
            <Button variant="secondary" onPress={() => toFallback('chosen')}>{t('atlas.cancel')}</Button>
          </div>
        )}
      </div>

      {phase.kind === 'ready' && (
        <Segmented<ViewChoice>
          label={t('atlas.views')}
          value={view3}
          options={(['front', 'back', 'side', 'reset'] as const).map((v) => ({ value: v, label: t(`atlas.view.${v}` as StringKey) }))}
          onChange={(v) => view3d(v)}
        />
      )}

      {fallback && phase.kind === 'fallback' && (
        <div class="sf-atlas__fb">
          <p class="sf-atlas__note" role="status">{t(`atlas.fb.${phase.reason}` as StringKey)}</p>
          <BodyPicker
            mode="pick-one"
            sex={sex}
            view={view2d}
            onViewChange={setView2d}
            value={row ? drawnIds(row) : []}
            onChange={(ids) => { const id = ids[0]; if (id) onRegionTap(id); else { setSelected(null); setSheet(false); } }}
            size="compact"
          />
          {row && drawnIds(row).length === 0 && <p class="sf-atlas__note">{t('atlas.textOnly')}</p>}
          {phase.reason !== 'no-webgl' && phase.reason !== 'no-decompression' && <Button variant="secondary" onPress={start3d}>{t('atlas.try3d')}</Button>}
        </div>
      )}

      <Toggle
        checked={lowSetting || autoReasons.length > 0}
        disabled={autoReasons.length > 0}
        onChange={setLowSetting}
        label={t('atlas.low')}
        hint={autoReasons.length > 0 ? t('atlas.low.auto') : t('atlas.low.hint')}
      />

      <section class="sf-atlas__list" aria-label={t('atlas.listTitle')}>
        <Input label={t('atlas.search')} hint={t('atlas.search.ph')} {...{ type: 'search', value: query, autoComplete: 'off' }} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
        <div class="sf-atlas__chips" role="group" aria-label={t('atlas.regions')}>
          {(['all', ...REGIONS] as const).map((r) => (
            <Chip key={r} selected={region === r} onPress={() => setRegion(r)}>{regionLabel(r)}</Chip>
          ))}
        </div>
        {groups.length === 0 && <p class="sf-atlas__note">{t('atlas.none')}</p>}
        {groups.map((g) => (
          <div key={g.region} class="sf-atlas__group">
            <h2 class="sf-atlas__h">{regionLabel(g.region)}</h2>
            <ul class="sf-atlas__units">
              {g.rows.map((r) => (
                <li key={r.muscleId}>
                  <button type="button" class={r.muscleId === selected ? 'sf-atlas__unit sf-atlas__unit--on' : 'sf-atlas__unit'} aria-pressed={r.muscleId === selected} onClick={() => pickUnit(r.muscleId)}>
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <p class="sf-atlas__note">{t('atlas.notAll')}</p>
      <p class="sf-atlas__note">{t('atlas.maleOnly')}</p>
      <p class="sf-atlas__note">{t('atlas.fittedNote')}</p>
      <Button variant="secondary" onPress={() => setCredits(true)}>{t('atlas.credits')}</Button>

      <Sheet open={sheet && !!row} onClose={() => setSheet(false)} title={row?.name ?? ''}>
        {row && (
          <div class="sf-atlas__panel">
            <p class="sf-atlas__note">{regionLabel(regionOf(row))} · {row.group}</p>
            {row.shape === 'fitted' && <p class="sf-atlas__fitted">{t('atlas.fitted')}</p>}
            <h3 class="sf-atlas__h">{t('atlas.daily')}</h3>
            <ul class="sf-atlas__bul">{row.inDailyLife.map((x) => <li key={x}>{x}</li>)}</ul>
            <h3 class="sf-atlas__h">{t('atlas.weak')}</h3>
            <ul class="sf-atlas__bul">{row.whenWeak.map((x) => <li key={x}>{x}</li>)}</ul>
            <h3 class="sf-atlas__h">{t('atlas.facts')}</h3>
            <ul class="sf-atlas__bul">{row.quickFacts.map((x) => <li key={x}>{x}</li>)}</ul>
            {same.length > 0 && (
              <>
                <h3 class="sf-atlas__h">{t('atlas.sameArea')}</h3>
                <div class="sf-atlas__chips">{same.map((r) => <Chip key={r.muscleId} onPress={() => pickUnit(r.muscleId)}>{r.name}</Chip>)}</div>
              </>
            )}
            {row.seeAlso.length > 0 && (
              <>
                <h3 class="sf-atlas__h">{t('atlas.see')}</h3>
                <div class="sf-atlas__chips">
                  {row.seeAlso.map((id) => { const o = rowById(id); return o ? <Chip key={id} onPress={() => pickUnit(id)}>{o.name}</Chip> : null; })}
                </div>
              </>
            )}
            <p class="sf-atlas__note">{t('atlas.edu')}</p>
          </div>
        )}
      </Sheet>

      <Sheet open={credits} onClose={() => setCredits(false)} title={t('atlas.credits.title')}>
        <div class="sf-atlas__panel">{ATLAS_CREDITS.map((c) => <p key={c} class="sf-atlas__note">{c}</p>)}</div>
      </Sheet>
    </div>
  );
}

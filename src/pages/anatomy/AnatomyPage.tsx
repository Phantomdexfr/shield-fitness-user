import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Chip, ChoiceRow, EmptyState, Input, ProgressBar, Row, Segmented, SubPageHeader, Switch, Tabs, showToast } from '../../ui/components';
import { useFeature } from '../../app/flags';
import { goBack } from '../../app/navBack';
import { isLowPower, shouldAskBeforeDownload } from '../../atlas/logic';
import { readPowerEnvSync, reducedMotion, rendererEnv } from '../../atlas/env';
import type { AnatomyScene } from '../../anatomy/scene';
import {
  ANATOMY_FILES, FIND_LIMIT, PRESET_IDS, QUALITIES, QUALITY_KEY, SYSTEMS, THEMES, THEME_KEYS, anatomyUrl, groupsOfPart, loadSettings, partSizeCm,
  presetVisible, saveSetting, searchParts, systemCounts, type Info, type Meta, type PresetId, type Quality, type ThemeKey,
} from '../../anatomy/logic';

type Fail = 'no-webgl' | 'no-decompression' | 'failed' | 'lost' | 'chosen';
type Phase = { kind: 'boot' } | { kind: 'ask' } | { kind: 'loading' } | { kind: 'ready' } | { kind: 'fail'; reason: Fail };
type Tab = 'layers' | 'find' | 'info' | 'view';

const MESH_BYTES = 8740194;

async function fetchBuffer(url: string, signal: AbortSignal, onFrac: (f: number) => void): Promise<ArrayBuffer> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`anatomy ${r.status}`);
  if (!r.body) return r.arrayBuffer();
  const total = Number(r.headers.get('content-length')) || MESH_BYTES;
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onFrac(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out.buffer;
}

const themeLabel = (k: ThemeKey): string => t(`an.theme.${k}` as StringKey);

/** `/anatomy`: the whole body in 3D, 15 body systems as layers, search, details, and the view settings. Lazy three.js scene. */
export default function AnatomyPage() {
  const [, navigate] = useLocation();
  const on = useFeature('holo_atlas');
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<AnatomyScene | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lowPower = useMemo(() => isLowPower({ ...readPowerEnvSync(), userSetting: false }), []);
  const initial = useMemo(() => loadSettings(lowPower), [lowPower]);

  const [phase, setPhase] = useState<Phase>({ kind: 'boot' });
  const [progress, setProgress] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [tab, setTab] = useState<Tab>('layers');
  const [visible, setVisible] = useState<boolean[]>(initial.visible);
  const [theme, setTheme] = useState<ThemeKey>(initial.theme);
  const [dim, setDim] = useState(initial.dim);
  const [beam, setBeam] = useState(initial.beam);
  const [quality, setQuality] = useState<Quality>(initial.quality);
  const [spin, setSpin] = useState(() => !reducedMotion() && !lowPower);
  const [explode, setExplode] = useState(0);
  const [part, setPart] = useState(-1);
  const [group, setGroup] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [iso, setIso] = useState(false);
  const [query, setQuery] = useState('');

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    sceneRef.current?.dispose();
    sceneRef.current = null;
  };
  const fail = (reason: Fail) => { stop(); setPhase({ kind: 'fail', reason }); };

  // Latest values for the scene callbacks (they are created once).
  const live = useRef({ visible, theme, dim, beam, quality, spin });
  live.current = { visible, theme, dim, beam, quality, spin };

  const clearSelection = () => { setPart(-1); setGroup(-1); setFocused(false); setIso(false); };
  const pickPart = (i: number) => {
    if (i < 0) { clearSelection(); return; }
    setPart(i); setGroup(-1); setTab('info');
  };

  const start = () => {
    stop();
    setPhase({ kind: 'loading' });
    setProgress(0);
    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      const [mod, metaRes, infoRes] = await Promise.all([
        import('../../anatomy/scene'),
        fetch(anatomyUrl(ANATOMY_FILES[1]), { signal: ac.signal }),
        fetch(anatomyUrl(ANATOMY_FILES[2]), { signal: ac.signal }),
      ]);
      if (!metaRes.ok || !infoRes.ok) throw new Error('anatomy data');
      const m = (await metaRes.json()) as Meta;
      const inf = (await infoRes.json()) as Info;
      const mesh = await fetchBuffer(anatomyUrl(ANATOMY_FILES[0]), ac.signal, (f) => setProgress(f * 0.6));
      if (ac.signal.aborted || !host.current) throw new DOMException('aborted', 'AbortError');
      setMeta(m);
      setInfo(inf);
      const l = live.current;
      const sc = await mod.createAnatomyScene({
        host: host.current,
        meta: m,
        mesh,
        theme: l.theme,
        dim: l.dim,
        beam: l.beam,
        quality: l.quality,
        spin: l.spin,
        visible: l.visible,
        onPick: pickPart,
        onProgress: (d, total) => setProgress(0.6 + (0.4 * d) / total),
        onContextLost: () => fail('lost'),
        signal: ac.signal,
      });
      if (ac.signal.aborted) { sc.dispose(); return; }
      sceneRef.current = sc;
      setPhase({ kind: 'ready' });
    })().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (abortRef.current === ac) fail('failed');
    });
  };

  useEffect(() => {
    if (!on) return;
    const env = rendererEnv();
    if (!env.hasWebGL) setPhase({ kind: 'fail', reason: 'no-webgl' });
    else if (!env.hasDecompression) setPhase({ kind: 'fail', reason: 'no-decompression' });
    else if (shouldAskBeforeDownload(readPowerEnvSync())) setPhase({ kind: 'ask' });
    else start();
    return stop;
  }, [on]);

  // Scene follows the page state.
  const ready = phase.kind === 'ready';
  const ids = useMemo(() => (group >= 0 && info ? info.g[group]![1] : part >= 0 ? [part] : []), [group, part, info]);
  useEffect(() => { if (ready) sceneRef.current?.setVisible(visible); }, [visible, ready]);
  useEffect(() => { if (ready) sceneRef.current?.highlight(ids); }, [ids, ready]);
  useEffect(() => { if (ready) sceneRef.current?.focus(focused); }, [focused, ids, ready]);
  useEffect(() => { if (ready) sceneRef.current?.isolate(iso); }, [iso, ids, ready]);
  useEffect(() => { if (ready) sceneRef.current?.setSpin(spin); }, [spin, ready]);
  useEffect(() => { if (ready) sceneRef.current?.setExplode(explode / 100); }, [explode, ready]);
  useEffect(() => { if (ready) sceneRef.current?.setBrightness(dim); }, [dim, ready]);
  useEffect(() => { if (ready) sceneRef.current?.setBeam(beam); }, [beam, ready]);
  useEffect(() => { if (ready) sceneRef.current?.setQuality(quality); }, [quality, ready]);
  useEffect(() => { if (ready) sceneRef.current?.setTheme(theme); }, [theme, ready]);

  const head = <SubPageHeader title={t('an.title')} onBack={() => goBack(navigate, '/body')} backLabel={t('an.back')} />;
  if (!on) return <div class="sf-anat">{head}<EmptyState icon="info" title={t('atlas.off.title')} hint={t('atlas.off.hint')} /></div>;

  const counts = meta ? systemCounts(meta) : SYSTEMS.map(() => 0);
  const setVis = (next: boolean[]) => { setVisible(next); saveSetting('visible', next); };
  const toggleSystem = (i: number) => setVis(visible.map((v, k) => (k === i ? !v : v)));
  const found = meta ? searchParts(meta, visible, query) : [];
  const stageOn = phase.kind === 'loading' || phase.kind === 'ready';
  const th = THEMES[theme];
  const stageStyle = { background: `radial-gradient(ellipse at 50% 42%, ${th.g1} 0%, ${th.g2} 72%)` };

  const selPart = meta && part >= 0 ? meta.parts[part] : undefined;
  const selGroup = info && group >= 0 ? info.g[group] : undefined;
  const chipName = selGroup ? selGroup[0] : selPart?.[0];
  const chipSub = selGroup
    ? t('an.info.group', { n: selGroup[1].length })
    : selPart
      ? `${SYSTEMS[selPart[1]]!.name} · ${t('an.info.size', { w: partSizeCm(selPart)[0], h: partSizeCm(selPart)[1], d: partSizeCm(selPart)[2] })}`
      : '';

  const infoPanel = () => {
    if (!meta || !info || (!selPart && !selGroup)) return <p class="sf-anat__note">{t('an.info.empty')}</p>;
    if (selGroup) {
      return (
        <div class="sf-anat__info">
          <h3 class="sf-anat__h">{selGroup[0]}</h3>
          <p class="sf-anat__meta">{t('an.info.group', { n: selGroup[1].length })}</p>
          <p class="sf-anat__text">{selGroup[2]}</p>
          {selGroup[3] && selGroup[3].length > 0 && <p class="sf-anat__meta">{t('an.info.also')}: {selGroup[3].join(', ')}</p>}
          <p class="sf-anat__meta">{t('an.info.members')}</p>
          <ul class="sf-anat__list">
            {selGroup[1].slice(0, 150).map((k) => (
              <li key={k}>
                <button type="button" class="sf-anat__item" onClick={() => { setPart(k); setGroup(-1); setFocused(true); }}>
                  <span class="sf-anat__dot" style={{ color: SYSTEMS[meta.parts[k]![1]]!.color }} />
                  {meta.parts[k]![0]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    const p = selPart!;
    const d = info.p[part]!;
    const gs = groupsOfPart(info, part);
    return (
      <div class="sf-anat__info">
        <h3 class="sf-anat__h">{p[0]}</h3>
        <p class="sf-anat__meta" style={{ color: SYSTEMS[p[1]]!.color }}>{t('an.info.system', { system: SYSTEMS[p[1]]!.name })}</p>
        <p class="sf-anat__text">{d[0]}</p>
        {d[1].length > 0 && <p class="sf-anat__meta">{t('an.info.also')}: {d[1].join(', ')}</p>}
        {d[2].length > 0 && <p class="sf-anat__meta">{t('an.info.partof')}: {d[2].join(', ')}</p>}
        {gs.length > 0 && (
          <>
            <p class="sf-anat__meta">{t('an.info.groups')}</p>
            <div class="sf-anat__chips">
              {gs.map((g) => (
                <Chip key={g.gi} onPress={() => { setGroup(g.gi); setPart(-1); setFocused(true); }}>{info.g[g.gi]![0]} · {g.count}</Chip>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div class="sf-anat">
      {head}
      <p class="sf-anat__note">{t('an.intro')}</p>

      {phase.kind === 'ask' && (
        <div class="sf-anat__ask">
          <h2 class="sf-anat__h">{t('an.ask.title')}</h2>
          <p class="sf-anat__note">{t('an.ask.hint')}</p>
          <div class="sf-anat__row">
            <Button onPress={start}>{t('an.ask.go')}</Button>
            <Button variant="secondary" onPress={() => setPhase({ kind: 'fail', reason: 'chosen' })}>{t('an.cancel')}</Button>
          </div>
        </div>
      )}

      {phase.kind === 'fail' && (
        <div class="sf-anat__ask">
          <p class="sf-anat__note" role="status">{t(`an.fb.${phase.reason}` as StringKey)}</p>
          {(phase.reason === 'failed' || phase.reason === 'lost' || phase.reason === 'chosen') && <Button variant="secondary" onPress={start}>{t('an.retry')}</Button>}
        </div>
      )}

      <div class={stageOn ? 'sf-anat__stage' : 'sf-anat__stage sf-anat__stage--off'} style={stageStyle} aria-label={t('an.stage')}>
        <div ref={host} class="sf-anat__host" data-ready={ready ? '1' : '0'} />
        {phase.kind === 'loading' && (
          <div class="sf-anat__loading" role="status">
            <p class="sf-anat__note">{t('an.loading')}</p>
            <ProgressBar value={progress} label={t('an.loading.label')} />
            <Button variant="secondary" onPress={() => { stop(); setPhase({ kind: 'fail', reason: 'chosen' }); }}>{t('an.cancel')}</Button>
          </div>
        )}
        {ready && meta && <span class="sf-anat__count">{t('an.meshes', { n: meta.parts.length })}</span>}
        {ready && chipName && (
          <div class="sf-anat__sel">
            <div class="sf-anat__selname">
              <b>{chipName}</b>
              <span>{chipSub}</span>
            </div>
            <Chip selected={focused} onPress={() => setFocused(!focused)}>{t('an.focus')}</Chip>
            <Button variant="secondary" onPress={clearSelection}>{t('an.clear')}</Button>
          </div>
        )}
      </div>

      {ready && (
        <div class="sf-anat__row" role="group" aria-label={t('an.title')}>
          <Chip selected={spin} onPress={() => setSpin(!spin)}>{t('an.spin')}</Chip>
          <Chip
            selected={iso}
            onPress={() => {
              if (!iso && ids.length === 0) { showToast(t('an.tapFirst')); return; }
              setIso(!iso);
            }}
          >
            {t('an.isolate')}
          </Chip>
          <Button
            variant="secondary"
            onPress={() => {
              sceneRef.current?.reset();
              setExplode(0); clearSelection();
            }}
          >
            {t('an.reset')}
          </Button>
        </div>
      )}

      {ready && (
        <>
          <Tabs<Tab>
            label={t('an.tabs')}
            active={tab}
            onChange={setTab}
            items={(['layers', 'find', 'info', 'view'] as const).map((v) => ({ value: v, label: t(`an.tab.${v}` as StringKey) }))}
          />
          <div class="sf-anat__panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'layers' && (
              <>
                <h3 class="sf-anat__h">{t('an.layers.presets')}</h3>
                <div class="sf-anat__chips">
                  {PRESET_IDS.map((id: PresetId) => (
                    <Button key={id} variant="secondary" onPress={() => setVis(presetVisible(id))}>{t(`an.preset.${id}` as StringKey)}</Button>
                  ))}
                </div>
                <h3 class="sf-anat__h">{t('an.layers.systems')}</h3>
                <div class="sf-anat__chips">
                  {SYSTEMS.map((s, i) =>
                    counts[i] ? (
                      <Chip key={s.id} selected={!!visible[i]} onPress={() => toggleSystem(i)}>
                        <span class="sf-anat__dot" style={{ color: s.color }} />
                        {s.name} · {counts[i]}
                      </Chip>
                    ) : null,
                  )}
                </div>
              </>
            )}
            {tab === 'find' && (
              <>
                <Input label={t('an.find.label')} hint={t('an.find.ph')} {...{ type: 'search', value: query, autoComplete: 'off' }} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
                {found.length === 0 && <p class="sf-anat__note">{t('an.find.none')}</p>}
                <ul class="sf-anat__list">
                  {found.map((i) => (
                    <li key={i}>
                      <button type="button" class="sf-anat__item" onClick={() => { setPart(i); setGroup(-1); setFocused(true); setTab('info'); }}>
                        <span class="sf-anat__dot" style={{ color: SYSTEMS[meta!.parts[i]![1]]!.color }} />
                        {meta!.parts[i]![0]}
                      </button>
                    </li>
                  ))}
                </ul>
                {found.length >= FIND_LIMIT && <p class="sf-anat__note">{t('an.find.cap', { n: FIND_LIMIT })}</p>}
              </>
            )}
            {tab === 'info' && infoPanel()}
            {tab === 'view' && (
              <>
                <ChoiceRow<ThemeKey>
                  label={t('an.view.bg')}
                  value={theme}
                  options={THEME_KEYS.map((k) => ({ value: k, label: themeLabel(k) }))}
                  onChange={(k) => { setTheme(k); saveSetting('theme', k); }}
                />
                <div class="sf-anat__range">
                  <label for="an-explode">{t('an.view.explode')}</label>
                  <input id="an-explode" type="range" min={0} max={100} value={explode} onInput={(e) => setExplode(Number((e.currentTarget as HTMLInputElement).value))} />
                </div>
                <div class="sf-anat__range">
                  <label for="an-bright">{t('an.view.bright')}</label>
                  <input id="an-bright" type="range" min={40} max={140} value={Math.round(dim * 100)} onInput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value) / 100; setDim(v); saveSetting('dim', v); }} />
                </div>
                <Row label={t('an.view.beam')} trailing={<Switch checked={beam} label={t('an.view.beam')} onChange={(v) => { setBeam(v); saveSetting('beam', v); }} />} />
                <Segmented<`${Quality}`>
                  label={t('an.view.quality')}
                  value={`${quality}`}
                  options={QUALITIES.map((q) => ({ value: `${q}` as `${Quality}`, label: t(`an.q.${QUALITY_KEY[q]}` as StringKey) }))}
                  onChange={(v) => { const q = Number(v) as Quality; setQuality(q); saveSetting('quality', q); }}
                />
                <Button
                  variant="secondary"
                  onPress={() => { sceneRef.current?.reset(); setExplode(0); clearSelection(); }}
                >
                  {t('an.view.reset')}
                </Button>
              </>
            )}
          </div>
        </>
      )}

      <p class="sf-anat__note">{t('an.note')}</p>
    </div>
  );
}

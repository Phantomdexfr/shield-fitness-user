import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useLocation, useRoute, useSearch } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Badge, Button, Card, Chip, Dialog, EmptyState, PhotoFrame, Sheet, SubPageHeader, showToast } from '../../ui/components';
import { MuscleChips } from '../../ui/body';
import { loadAlternatives, machineOf } from '../../data/repos/alternatives';
import type { Alternative } from '../../shared/alternatives';
import { SearchBox } from '../../ui/search/SearchBox';
import { goodFor, loadExInfo, machineThumb, refFor, searchPicks, type ExInfo, type Pick } from '../../data/repos/routineEdit';
import { getRoutine } from '../../data/repos/routines';
import { beginDay, beginFree, beginRepeat, currentOpen, deleteSession, endAsIs, finishSession, getSession, putSession } from '../../data/repos/sessions';
import {
  addItem, allSet, bringAllBack, clearMachineBusy, counts, elapsedSec, insertItem, isStale, markMachineBusy, moveItem, refId, removeItem, reopen, setStatus, setsLogged, suggestedNext, swapItem,
  type Session, type SessionItem, type SessionStatus, type SkipReason,
} from '../../shared/session';
import { muscleLabel } from '../exercise/muscleLabel';
import { useFeature } from '../../app/flags';
import { getLoggerPrefs, loadHistory, loadLoggerInfo, putLoggerPrefs, type ItemHistory, type LoggerInfo } from '../../data/repos/logger';
import { DEFAULT_LOGGER_PREFS, type LoggerPrefs } from '../../shared/logger';
import { SetLogger } from './SetLogger';
import { keepAwake, letSleep } from './device';
import { goBack } from '../../app/navBack';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'prompt'; open: Session }
  | { status: 'ready'; s: Session };

type Undo = { text: string; restore: (cur: Session) => Session };
const UNDO_MS = 6000;
const REASONS: readonly SkipReason[] = ['busy', 'pain', 'no_time', 'too_hard', 'other'];
const FALLBACK_INFO: LoggerInfo = { cls: 'isolation', cardio: false, repMin: 8, repMax: 12, stepKg: null, outOfOrder: false };
type Alts = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; list: Alternative[] };

function Thumb({ machine, name }: { machine: string; name: string }) {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    if (machine) void machineThumb(machine).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [machine]);
  return machine ? <PhotoFrame src={src} alt={t('lib.machine.photo', { name })} class="sf-rt__thumb" /> : null;
}

/** `/session/<id>`: every item as a compact card on one screen, in any order. `/session/new?routine=&day=` (or `free=1`, `repeat=1`) starts one. */
export default function SessionPage() {
  const [, params] = useRoute('/session/:id');
  const id = params?.id ?? '';
  const search = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [info, setInfo] = useState<ReadonlyMap<string, ExInfo>>(new Map());
  const [targets, setTargets] = useState<string[]>([]);
  const [saveErr, setSaveErr] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finishOpen, setFinishOpen] = useState(false);
  const [keep, setKeep] = useState<'drop' | 'keep'>('drop');
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [staleGone, setStaleGone] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Pick[]>([]);
  const [good, setGood] = useState<Array<{ muscle: string; picks: Pick[] }>>([]);
  const [pickMuscle, setPickMuscle] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Skip sheet (Phase 35): the item's index in the sorted list, the chosen reason, the pain area and the alternatives.
  const [skipIdx, setSkipIdx] = useState<number | null>(null);
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [area, setArea] = useState<string[]>([]);
  const [alts, setAlts] = useState<Alts>({ status: 'idle' });
  const [skipMachine, setSkipMachine] = useState('');
  const live = useRef(true);
  // Set logger (Phase 38): what each exercise needs, its history and the saved logger options.
  const bigOn = useFeature('big_number_mode');
  const [linfo, setLinfo] = useState<ReadonlyMap<string, LoggerInfo>>(new Map());
  const [lhist, setLhist] = useState<ReadonlyMap<string, ItemHistory>>(new Map());
  const [lprefs, setLprefs] = useState<LoggerPrefs>(DEFAULT_LOGGER_PREFS);

  const startNew = async () => {
    const r = search.get('routine');
    const d = search.get('day');
    const s = r && d ? await beginDay(r, d) : search.get('repeat') ? await beginRepeat() : search.get('free') ? await beginFree() : undefined;
    if (!live.current) return;
    if (!s) return setState({ status: 'missing' });
    navigate(`/session/${s.id}`, { replace: true });
  };

  /** `/session/new`: one open session at a time (A-P28.5), so an open one is offered first. */
  const create = async () => {
    try {
      const open = await currentOpen();
      if (open) return live.current && setState({ status: 'prompt', open });
      await startNew();
    } catch {
      if (live.current) setState({ status: 'error' });
    }
  };

  const load = () => {
    setState({ status: 'loading' });
    if (id === 'new') return void create();
    getSession(id).then(
      (s) => {
        if (!live.current) return;
        if (!s) return setState({ status: 'missing' });
        setState({ status: 'ready', s });
        if (s.routineId && s.dayId) void getRoutine(s.routineId).then((r) => live.current && setTargets(r?.days.find((d) => d.id === s.dayId)?.targetMuscles ?? []), () => undefined);
      },
      () => live.current && setState({ status: 'error' }),
    );
  };

  useEffect(() => {
    live.current = true;
    load();
    return () => {
      live.current = false;
    };
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loaded = state.status === 'ready' ? state.s : null;
  const refsKey = loaded?.items.map((i) => refId(i.ref)).join('|') ?? '';
  useEffect(() => {
    if (!loaded) return;
    const missing = loaded.items.map((i) => i.ref).filter((r) => !info.has(refId(r)));
    if (missing.length === 0) return;
    let on = true;
    void loadExInfo(missing).then((got) => on && setInfo((old) => new Map([...old, ...got])), () => undefined);
    return () => {
      on = false;
    };
  }, [refsKey]);

  useEffect(() => {
    void getLoggerPrefs().then((p) => live.current && setLprefs(p), () => undefined);
  }, []);
  const savePrefs = (p: LoggerPrefs) => {
    setLprefs(p);
    putLoggerPrefs(p).catch(() => live.current && setSaveErr(true));
  };
  const loggerKey = loaded && !loaded.endedAt ? `${loaded.id}:${refsKey}` : '';
  useEffect(() => {
    if (!loaded || loaded.endedAt) return;
    let on = true;
    void loadLoggerInfo(loaded.items.map((i) => i.ref))
      .then(async (infos) => {
        const hist = await loadHistory(loaded, infos);
        if (on) {
          setLinfo(infos);
          setLhist(hist);
        }
      })
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [loggerKey]);
  // Big-number mode keeps the screen awake (where the browser allows it) and asks again when the page comes back.
  useEffect(() => {
    if (!(lprefs.big && bigOn)) return;
    void keepAwake();
    const back = () => document.visibilityState === 'visible' && void keepAwake();
    document.addEventListener('visibilitychange', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      void letSleep();
    };
  }, [lprefs.big, bigOn]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!addOpen) return;
    let on = true;
    const list = pickMuscle.length > 0 ? [pickMuscle[pickMuscle.length - 1]!] : targets;
    void goodFor(list, 8, 3).then((g) => on && setGood(g), () => undefined);
    return () => {
      on = false;
    };
  }, [addOpen, pickMuscle.join(','), targets.join(',')]);
  useEffect(() => {
    let on = true;
    void searchPicks(q).then((p) => on && setFound(p), () => on && setFound([]));
    return () => {
      on = false;
    };
  }, [q]);

  // Alternatives for the skip sheet: recomputed when the reason, the pain area or the busy machines change.
  const busyKey = loaded?.busyMachines?.join(',') ?? '';
  useEffect(() => {
    if (skipIdx === null || reason === null || !loaded) return setAlts({ status: 'idle' });
    const item = [...loaded.items].sort((x, y) => x.order - y.order)[skipIdx];
    if (!item) return setAlts({ status: 'idle' });
    let on = true;
    setAlts({ status: 'loading' });
    void loadAlternatives({ session: loaded, item, reason, area })
      .then((r) => on && setAlts({ status: 'ready', list: r.alternatives }), () => on && setAlts({ status: 'error' }));
    return () => {
      on = false;
    };
  }, [skipIdx, reason, area.join(','), busyKey]);

  const header = (title: string) => <SubPageHeader title={title} onBack={() => goBack(navigate, '/train')} />;
  const shell = (title: string, body: ComponentChildren) => <section class="sf-page-body sf-rt">{header(title)}{body}</section>;

  if (state.status === 'loading') return shell(t('fs.free'), <p class="sf-lib__note" role="status">{t('fs.starting')}</p>);
  if (state.status === 'error') return shell(t('fs.free'), <EmptyState icon="warning" title={t('fs.err.open')} actionLabel={t('rb.error.retry')} onAction={load} />);
  if (state.status === 'missing') return shell(t('fs.free'), <EmptyState icon="warning" title={t('fs.notfound')} actionLabel={t('fs.home')} onAction={() => navigate('/')} />);
  if (state.status === 'prompt') {
    const open = state.open;
    return shell(t('fs.progress.title'), (
      <div class="sf-rt__menu">
        <p class="sf-rt__meta">{open.dayName ?? t('fs.free')}</p>
        <Button onPress={() => navigate(`/session/${open.id}`, { replace: true })}>{t('fs.resume')}</Button>
        <Button variant="secondary" disabled={busy} onPress={() => { setBusy(true); void endAsIs(open).then(startNew).catch(() => setState({ status: 'error' })).finally(() => setBusy(false)); }}>{t('fs.startnew')}</Button>
        <Button variant="ghost" onPress={() => navigate('/train')}>{t('rb.cancel')}</Button>
      </div>
    ));
  }

  const sess = state.s;
  const ended = sess.endedAt !== undefined;
  const sorted = [...sess.items].sort((a, b) => a.order - b.order);
  const c = counts(sess);
  const nameOf = (it: SessionItem) => info.get(refId(it.ref))?.name ?? (it.ref.kind === 'lib' ? it.ref.slug : '...');

  /** Shows the change now and writes it; a failed write shows a notice and keeps the screen. */
  const commit = (next: Session, u?: Undo) => {
    setState({ status: 'ready', s: next });
    setSaveErr(false);
    setUndo(u ?? null);
    putSession(next).catch(() => live.current && setSaveErr(true));
  };
  const change = (index: number, status: SessionStatus) => {
    const it = sorted[index]!;
    const text = status === 'later' ? t('fs.parked', { name: nameOf(it) }) : status === 'skipped' ? t('fs.skipped', { name: nameOf(it) }) : undefined;
    commit(setStatus(sess, index, status), text ? { text, restore: (cur) => setStatus(cur, index, it.status, it.skipReason) } : undefined);
  };
  const remove = (index: number) => {
    const res = removeItem(sess, index);
    if (!res.removed) return;
    commit(res.session, { text: t('fs.removed', { name: nameOf(res.removed) }), restore: (cur) => insertItem(cur, index, res.removed!) });
  };
  const askRemove = (index: number) => (sorted[index]!.sets.length > 0 ? setConfirmRemove(index) : remove(index));

  /** Skip opens the "Why?" sheet; Swap opens it straight at the alternatives (reason Other). */
  const openSkip = (index: number, direct = false) => {
    setReason(direct ? 'other' : null);
    setArea([]);
    setAlts({ status: 'idle' });
    setSkipMachine('');
    setSkipIdx(index);
    void machineOf(sorted[index]!).then((m) => live.current && setSkipMachine(m), () => undefined);
  };
  const closeSkip = () => {
    setSkipIdx(null);
    setReason(null);
  };
  const justSkip = () => {
    const i = skipIdx;
    closeSkip();
    if (i === null) return;
    const it = sorted[i]!;
    commit(setStatus(sess, i, 'skipped', reason ?? undefined), { text: t('fs.skipped', { name: nameOf(it) }), restore: (cur) => setStatus(cur, i, it.status, it.skipReason) });
  };
  const doSwap = async (alt: Alternative) => {
    const i = skipIdx;
    if (i === null || busy) return;
    setBusy(true);
    try {
      const it = sorted[i]!;
      const ref = alt.kind === 'exercise' ? await refFor({ slug: alt.slug, name: alt.name, custom: alt.custom === true }) : it.ref;
      const before = sess;
      closeSkip();
      commit(swapItem(sess, i, { ref, ...(alt.kind === 'variation' ? { variation: alt.variation } : {}) }, reason ?? undefined), {
        text: t('fs.swapped', { name: nameOf(it), other: alt.kind === 'variation' ? t('fs.alt.var', { name: alt.name, variation: alt.variation }) : alt.name }),
        restore: () => before,
      });
    } catch {
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };
  const markBusy = () => {
    if (!skipMachine) return;
    const m = skipMachine;
    commit(markMachineBusy(sess, m), { text: t('fs.busy.done'), restore: (cur) => clearMachineBusy(cur, m) });
  };

  // Open items first, then skipped, then done; Later items sit on the shelf. Reorder buttons move between visible neighbours.
  const rank = (st: SessionStatus) => (st === 'done' ? 2 : st === 'skipped' ? 1 : 0);
  const main = sorted.map((it, idx) => ({ it, idx })).filter((x) => x.it.status !== 'later').sort((a, b) => rank(a.it.status) - rank(b.it.status) || a.idx - b.idx);
  const shelf = sorted.map((it, idx) => ({ it, idx })).filter((x) => x.it.status === 'later');
  const next = suggestedNext(sess);

  const seen = new Map<string, number>();
  const dupOf = new Map<number, number>();
  sorted.forEach((it, idx) => {
    const k = refId(it.ref);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) dupOf.set(idx, n);
  });

  const parts = (['skipped', 'later', 'todo', 'doing'] as const).filter((k) => c[k] > 0).map((k) => t(`fs.part.${k}` as StringKey, { n: c[k] }));
  const notDone = c.skipped + c.later + c.todo + c.doing;

  const doFinish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await finishSession(sess, keep);
      showToast(t('fs.saved'));
      navigate(`/session/${sess.id}/summary`);
    } catch {
      setSaveErr(true);
    } finally {
      setBusy(false);
    }
  };
  const doDiscard = async () => {
    setConfirmDiscard(false);
    try {
      await deleteSession(sess.id);
      navigate('/train');
    } catch {
      setSaveErr(true);
    }
  };

  const inSession = new Set(sess.items.map((i) => refId(i.ref)));
  const addPick = async (p: Pick) => commit(addItem(sess, await refFor(p)));
  const pickRow = (p: Pick) => (
    <li key={p.slug} class="sf-rt__item">
      <span class="sf-rt__name sf-rt__grow">{p.name}</span>
      {inSession.has(p.custom ? `custom:${p.slug}` : p.slug) && <Badge tone="neutral">{t('rb.d.in')}</Badge>}
      <Button variant="secondary" icon="plus" aria-label={`${t('fs.add')}: ${p.name}`} onPress={() => void addPick(p)}>{t('rb.d.add')}</Button>
    </li>
  );

  const card = (it: SessionItem, idx: number, vis: number) => {
    const name = nameOf(it);
    const n = dupOf.get(idx);
    const lines = it.plan ? t('fs.sets', { done: it.sets.length, planned: it.plan.sets }) : t('fs.sets.free', { done: it.sets.length });
    const prev = main[vis - 1];
    const nxt = main[vis + 1];
    const open = it.status === 'todo' || it.status === 'doing';
    const slug = it.ref.kind === 'lib' ? it.ref.slug : '';
    return (
      <li key={`${refId(it.ref)}-${idx}`} class={`sf-rt__ex${it.status === 'done' || it.status === 'skipped' ? ' sf-fs__dim' : ''}`}>
        <Card class="sf-rt__excard" onPress={slug ? () => navigate(`/exercise/${slug}`) : undefined}>
          <Thumb machine={info.get(refId(it.ref))?.machine ?? ''} name={name} />
          <span class="sf-rt__name">{name}{n ? <Badge tone="neutral" aria-label={t('fs.dup', { n })}>{n}</Badge> : null}</span>
          <span class="sf-rt__meta">{lines}</span>
          <span class="sf-fs__status"><span class={`sf-fs__dot sf-fs__dot--${it.status}`} aria-hidden="true" /><span class="sf-rt__meta">{t(`fs.status.${it.status}` as StringKey)}</span></span>
        </Card>
        {open && !ended && <SetLogger key={`${refId(it.ref)}-${idx}`} sess={sess} idx={idx} item={it} info={linfo.get(refId(it.ref)) ?? FALLBACK_INFO} hist={lhist.get(refId(it.ref))} prefs={lprefs} onPrefs={savePrefs} commit={commit} />}
        <div class="sf-rt__ctl">
          {open && prev && <Button variant="ghost" aria-label={t('fs.up', { name })} onPress={() => commit(moveItem(sess, idx, prev.idx))}>{t('fs.move.up')}</Button>}
          {open && nxt && <Button variant="ghost" aria-label={t('fs.down', { name })} onPress={() => commit(moveItem(sess, idx, nxt.idx))}>{t('fs.move.down')}</Button>}
          {open && <Button variant="secondary" aria-label={`${t('fs.markdone')}: ${name}`} onPress={() => change(idx, 'done')}>{t('fs.markdone')}</Button>}
          {open && <Button variant="ghost" aria-label={`${t('fs.later')}: ${name}`} onPress={() => change(idx, 'later')}>{t('fs.later')}</Button>}
          {open && <Button variant="ghost" aria-label={`${t('fs.swap')}: ${name}`} onPress={() => openSkip(idx, true)}>{t('fs.swap')}</Button>}
          {open && <Button variant="ghost" aria-label={`${t('fs.skip')}: ${name}`} onPress={() => openSkip(idx)}>{t('fs.skip')}</Button>}
          {it.status === 'done' && <Button variant="secondary" aria-label={`${t('fs.reopen')}: ${name}`} onPress={() => commit(reopen(sess, idx))}>{t('fs.reopen')}</Button>}
          {it.status === 'skipped' && <Button variant="secondary" aria-label={`${t('fs.unskip')}: ${name}`} onPress={() => commit(reopen(sess, idx))}>{t('fs.unskip')}</Button>}
          <Button variant="danger" aria-label={`${t('fs.remove')}: ${name}`} onPress={() => askRemove(idx)}>{t('fs.remove')}</Button>
        </div>
      </li>
    );
  };

  const openFinish = () => {
    setKeep('drop');
    setFinishOpen(true);
  };
  const removeIdx = confirmRemove;
  const removing = removeIdx !== null ? sorted[removeIdx] : undefined;

  return (
    <section class={`sf-page-body sf-rt${lprefs.big && bigOn ? ' sf-lg--big' : ''}`}>
      {header(sess.dayName ?? t('fs.free'))}
      <div class="sf-rt__row">
        <span class="sf-rt__meta" role="status">{t('fs.elapsed', { n: Math.floor(elapsedSec(sess, now) / 60) })}</span>
        {!ended && <Button onPress={openFinish}>{t('fs.finish')}</Button>}
      </div>
      {!ended && (
        <div class="sf-rt__chips">
          <Chip selected={lprefs.mode === 'advanced'} onPress={() => savePrefs({ ...lprefs, mode: lprefs.mode === 'advanced' ? 'simple' : 'advanced' })}>{t('lg.mode.advanced')}</Chip>
          {bigOn && <Chip selected={lprefs.big} onPress={() => savePrefs({ ...lprefs, big: !lprefs.big })}>{t('lg.big')}</Chip>}
        </div>
      )}
      {saveErr && <p class="sf-rt__err" role="alert">{t('fs.err.save')}</p>}

      {!staleGone && isStale(sess, now) && (
        <Card tone="gold" class="sf-rt__hint">
          <p class="sf-rt__hint-text">{t('fs.stale.title')} {t('fs.stale.msg')}</p>
          <div class="sf-rt__row">
            <Button onPress={openFinish}>{t('fs.finish')}</Button>
            <Button variant="secondary" onPress={() => setStaleGone(true)}>{t('fs.keepgoing')}</Button>
          </div>
        </Card>
      )}

      {!ended && next !== undefined && (
        <div class="sf-rt__block">
          <span class="sf-rt__meta">{t('fs.next')}</span>
          <div class="sf-rt__chips"><Badge tone="gold">{nameOf(sorted[next]!)}</Badge></div>
        </div>
      )}

      {!ended && <Button icon="plus" onPress={() => { setQ(''); setPickMuscle([]); setAddOpen(true); }}>{t('fs.add')}</Button>}

      {undo && (
        <div class="sf-rt__undo" role="status">
          <span class="sf-rt__undo-text">{undo.text}</span>
          <Button variant="ghost" onPress={() => commit(undo.restore(sess))}>{t('fs.undo')}</Button>
        </div>
      )}

      {sess.items.length === 0 ? (
        <EmptyState icon="barbell" title={t('fs.empty')} actionLabel={t('fs.add')} onAction={() => setAddOpen(true)} />
      ) : (
        <>
          {allSet(sess) && !ended && <p class="sf-rt__meta" role="status">{t('fs.allset')}</p>}
          <ul class="sf-rt__list">{main.map((x, vis) => card(x.it, x.idx, vis))}</ul>
        </>
      )}

      {shelf.length > 0 && (
        <div class="sf-rt__block">
          <h2 class="sf-rt__h">{t('fs.later.title', { n: shelf.length })}</h2>
          <ul class="sf-rt__list">
            {shelf.map(({ it, idx }) => (
              <li key={`${refId(it.ref)}-${idx}`} class="sf-rt__ex">
                <span class="sf-rt__name">{nameOf(it)}</span>
                <div class="sf-rt__ctl">
                  <Button variant="secondary" aria-label={`${t('fs.bring')}: ${nameOf(it)}`} onPress={() => change(idx, 'todo')}>{t('fs.bring')}</Button>
                  <Button variant="ghost" aria-label={`${t('fs.skip')}: ${nameOf(it)}`} onPress={() => openSkip(idx)}>{t('fs.skip')}</Button>
                  <Button variant="danger" aria-label={`${t('fs.remove')}: ${nameOf(it)}`} onPress={() => askRemove(idx)}>{t('fs.remove')}</Button>
                </div>
              </li>
            ))}
          </ul>
          {shelf.length >= 2 && <Button variant="secondary" onPress={() => commit(bringAllBack(sess))}>{t('fs.bringall')}</Button>}
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t('fs.add')}>
        <div class="sf-rt__menu">
          <SearchBox value={q} placeholder={t('fs.add.search')} onInput={setQ} />
          {q.trim() !== '' ? (
            found.length === 0 ? <p class="sf-rt__meta">{t('fs.add.none')}</p> : <ul class="sf-rt__list">{found.map(pickRow)}</ul>
          ) : (
            <>
              {good.map((g) => (
                <div key={g.muscle} class="sf-rt__block">
                  <h3 class="sf-rt__h">{t('fs.add.good', { muscle: muscleLabel(g.muscle) })}</h3>
                  <ul class="sf-rt__list">{g.picks.map(pickRow)}</ul>
                </div>
              ))}
              <div class="sf-rt__block">
                <h3 class="sf-rt__h">{t('fs.add.muscle')}</h3>
                <MuscleChips mode="pick-one" value={pickMuscle} onChange={setPickMuscle} />
              </div>
            </>
          )}
          <Button onPress={() => setAddOpen(false)}>{t('rb.w.done')}</Button>
        </div>
      </Sheet>

      <Sheet open={skipIdx !== null} onClose={closeSkip} title={skipIdx !== null && sorted[skipIdx] ? t('fs.why.title', { name: nameOf(sorted[skipIdx]!) }) : ''}>
        <div class="sf-rt__menu">
          <div class="sf-rt__chips" role="group" aria-label={t('fs.skip')}>
            {REASONS.map((r) => <Chip key={r} selected={reason === r} onPress={() => setReason(r)}>{t(`fs.reason.${r}` as StringKey)}</Chip>)}
          </div>
          {reason === 'pain' && (
            <div class="sf-rt__block">
              <h3 class="sf-rt__h">{t('fs.pain.where')}</h3>
              <p class="sf-rt__meta">{t('fs.pain.hint')}</p>
              <MuscleChips mode="pick-one" value={area} onChange={setArea} />
            </div>
          )}
          {reason === 'busy' && skipMachine !== '' && !(sess.busyMachines ?? []).includes(skipMachine) && (
            <Button variant="secondary" onPress={markBusy}>{t('fs.busy.mark')}</Button>
          )}
          {reason !== null && (
            <div class="sf-rt__block">
              <h3 class="sf-rt__h">{t('fs.alt.heading')}</h3>
              {alts.status === 'loading' || alts.status === 'idle' ? (
                <p class="sf-rt__meta" role="status">{t('fs.alt.loading')}</p>
              ) : alts.status === 'error' || alts.list.length === 0 ? (
                <p class="sf-rt__meta" role="status">{t('fs.alt.none')}</p>
              ) : (
                <ul class="sf-rt__list">
                  {alts.list.map((a) => {
                    const label = a.kind === 'variation' ? t('fs.alt.var', { name: a.name, variation: a.variation }) : a.name;
                    return (
                      <li key={`${a.slug}-${a.kind === 'variation' ? a.variation : ''}`} class="sf-rt__item">
                        <Thumb machine={a.machine} name={a.name} />
                        <span class="sf-rt__name sf-rt__grow">{label}</span>
                        <Badge tone="neutral">{t(`fs.chip.${a.chip}` as StringKey)}</Badge>
                        <Button variant="secondary" disabled={busy} aria-label={t('fs.alt.use', { name: label })} onPress={() => void doSwap(a)}>{t('fs.alt.pick')}</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <Button variant="secondary" onPress={justSkip}>{t('fs.justskip')}</Button>
          <Button variant="ghost" onPress={() => { closeSkip(); setQ(''); setPickMuscle([]); setAddOpen(true); }}>{t('fs.alt.search')}</Button>
          <Button variant="ghost" onPress={closeSkip}>{t('rb.cancel')}</Button>
        </div>
      </Sheet>

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title={t('fs.finish.title')}>
        <div class="sf-rt__menu">
          {setsLogged(sess) === 0 ? (
            <>
              <p class="sf-rt__meta">{t('fs.nolog')}</p>
              <Button variant="danger" onPress={() => { setFinishOpen(false); setConfirmDiscard(true); }}>{t('fs.discard')}</Button>
              <Button disabled={busy} onPress={() => void doFinish()}>{t('fs.keepit')}</Button>
            </>
          ) : (
            <>
              {notDone > 0 && (
                <>
                  <p class="sf-rt__meta">{t('fs.notdone', { n: notDone, parts: parts.join(', ') })}</p>
                  <div class="sf-rt__chips">
                    <Chip selected={keep === 'drop'} onPress={() => setKeep('drop')}>{t('fs.drop')}</Chip>
                    <Chip selected={keep === 'keep'} onPress={() => setKeep('keep')}>{t('fs.keep')}</Chip>
                  </div>
                </>
              )}
              <Button disabled={busy} onPress={() => void doFinish()}>{t('fs.finish.go')}</Button>
            </>
          )}
          <Button variant="ghost" onPress={() => setFinishOpen(false)}>{t('rb.cancel')}</Button>
        </div>
      </Sheet>

      <Dialog open={removing !== undefined} title={removing ? t('fs.confirm.remove', { name: nameOf(removing), n: removing.sets.length }) : ''} confirmLabel={t('fs.remove')} danger onConfirm={() => { const i = removeIdx; setConfirmRemove(null); if (i !== null) remove(i); }} onCancel={() => setConfirmRemove(null)} />
      <Dialog open={confirmDiscard} title={t('fs.discard.title')} message={t('fs.discard.msg')} confirmLabel={t('fs.discard')} danger onConfirm={() => void doDiscard()} onCancel={() => setConfirmDiscard(false)} />
    </section>
  );
}

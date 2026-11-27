import { useEffect, useState } from 'preact/hooks';
import { t, type StringKey } from '../../i18n';
import { useUx } from '../../ui/useUx';
import { Badge, Button, Chip, Collapsible, DatePicker, Pressable, Sheet, Stepper } from '../../ui/components';
import { SearchBox } from '../../ui/search/SearchBox';
import { refFor, searchPicks, type Pick } from '../../data/repos/routineEdit';
import { addItem, refId, type Session } from '../../shared/session';
import { setLine } from '../session/SetLogger';
import { clockSeconds } from '../../shared/timed';
import { addSetTo, duplicateSet, editSet, removeExercise, removeSetAt, timesOf, withTimes, MAX_KG, MAX_REPS } from '../../shared/sessionEdit';

export interface SessionEditorProps {
  draft: Session;
  names: Record<string, string>;
  onChange: (s: Session, names?: Record<string, string>) => void;
}

const TAGS = ['normal', 'warmup', 'drop', 'superset'] as const;
const sortedSets = (d: Session, i: number, j: number) => [...d.items].sort((a, b) => a.order - b.order)[i]?.sets[j];
const pad = (n: number): string => String(n).padStart(2, '0');

/** Edit a finished workout in a draft: nothing is saved until the page's Save. */
export function SessionEditor({ draft, names, onChange }: SessionEditorProps) {
  const [adding, setAdding] = useState(false);
  const tidy = useUx('tidy') === 'premium';
  const [pick, setPick] = useState<{ i: number; j: number } | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Pick[]>([]);
  const tm = timesOf(draft);
  const editing = pick ? sortedSets(draft, pick.i, pick.j) : undefined;
  const items = [...draft.items].sort((a, b) => a.order - b.order);

  useEffect(() => {
    let on = true;
    void searchPicks(q).then((p) => on && setFound(p), () => on && setFound([]));
    return () => {
      on = false;
    };
  }, [q]);

  const setTime = (p: Partial<typeof tm>) => {
    const n = { ...tm, ...p };
    onChange(withTimes(draft, n.day, n.hour, n.minute, n.durationMin));
  };
  const addPick = async (p: Pick) => {
    const ref = await refFor(p);
    onChange(addItem(draft, ref), { ...names, [refId(ref)]: p.name });
    setAdding(false);
    setQ('');
  };

  const whenText = `${tm.day.slice(8)}/${tm.day.slice(5, 7)} ${pad(tm.hour)}:${pad(tm.minute)} · ${t('sm.min', { n: tm.durationMin })}`;

  return (
    <div class="sf-sm__edit" data-hook="session-editor">
      <Collapsible id="ed-when" title={t('ed.when')} summary={whenText} remember={false} defaultOpen={tidy}>
        <DatePicker label={t('ed.date')} value={tm.day} onChange={(v) => v && setTime({ day: v })} />
        <div class="sf-sm__row"><span class="sf-rt__meta sf-sm__lab">{t('ed.start')}</span>
          <Stepper label={t('ed.hour')} value={tm.hour} min={0} max={23} format={pad} onChange={(v) => setTime({ hour: v })} />
          <Stepper label={t('ed.minute')} value={tm.minute} min={0} max={59} step={5} format={pad} onChange={(v) => setTime({ minute: v })} />
        </div>
        <div class="sf-sm__row"><span class="sf-rt__meta sf-sm__lab">{t('ed.duration')}</span>
          <Stepper label={t('ed.duration')} value={tm.durationMin} min={0} max={600} step={5} format={(v) => t('sm.min', { n: v })} onChange={(v) => setTime({ durationMin: v })} />
        </div>
      </Collapsible>

      {items.map((it, i) => (
        <Collapsible key={`${refId(it.ref)}-${i}`} id={`ed-ex-${i}`} title={names[refId(it.ref)] ?? refId(it.ref)} summary={it.sets.length === 1 ? t('ed.nset1') : t('ed.nsets', { n: it.sets.length })} defaultOpen remember={false}>
          <div data-hook="edit-item" class="sf-sm__sets-edit">
            {it.sets.length === 0 && <p class="sf-rt__meta">{t('sm.nosets')}</p>}
            <ol class="sf-lg__sets">
              {it.sets.map((s, j) => (
                <li key={j}>
                  <Pressable class="sf-lg__set" data-hook="edit-set" aria-label={t('lg.edit.aria', { n: j + 1, line: setLine(s) })} onPress={() => setPick({ i, j })}>
                    <span class="sf-lg__n">{j + 1}</span>
                    <span class="sf-lg__line">{setLine(s)}</span>
                    {s.tag !== 'normal' && <Badge tone="neutral">{t(`lg.tag.${s.tag}` as StringKey)}</Badge>}
                  </Pressable>
                </li>
              ))}
            </ol>
            <div class="sf-qgrid">
              <Button variant="secondary" icon="plus" onPress={() => { const n = addSetTo(draft, i, draft.endedAt ?? draft.startedAt); onChange(n); setPick({ i, j: n.items[i]!.sets.length - 1 }); }}>{t('ed.addSet')}</Button>
              <Button variant="secondary" onPress={() => onChange(removeExercise(draft, i))}>{t('ed.delEx')}</Button>
            </div>
          </div>
        </Collapsible>
      ))}

      <Button variant="secondary" onPress={() => setAdding(true)}>{t('fs.add')}</Button>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t('fs.add')}>
        <SearchBox value={q} placeholder={t('fs.add.search')} onInput={setQ} />
        {q.trim() !== '' && found.length === 0 && <p class="sf-rt__meta">{t('fs.add.none')}</p>}
        <ul class="sf-rt__list">
          {found.map((p) => (
            <li key={`${p.custom}-${p.slug}`} class="sf-rt__row">
              <span class="sf-rt__grow sf-rt__name">{p.name}</span>
              <Button variant="secondary" onPress={() => void addPick(p)}>{t('ed.addPick')}</Button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={editing !== undefined} onClose={() => setPick(null)} title={t('lg.edit.title', { n: (pick?.j ?? 0) + 1 })}>
        {editing && pick && (
          <div class="sf-lg__sheet sf-sm__big" data-hook="edit-sheet">
            <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.weight')}</span><Stepper label={t('lg.weight')} value={editing.weightKg ?? 0} step={2.5} min={0} max={MAX_KG} onChange={(v) => onChange(editSet(draft, pick.i, pick.j, { weightKg: v }))} /></div>
            {editing.reps == null && editing.seconds != null ? (
              <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.hold.sec')}</span><Stepper label={t('lg.hold.sec')} value={editing.seconds} step={5} min={0} max={3600} format={clockSeconds} onChange={(v) => onChange(editSet(draft, pick.i, pick.j, { seconds: v }))} /></div>
            ) : (
              <div class="sf-lg__field"><span class="sf-rt__meta">{t('lg.reps')}</span><Stepper label={t('lg.reps')} value={editing.reps ?? 0} step={1} min={0} max={MAX_REPS} onChange={(v) => onChange(editSet(draft, pick.i, pick.j, { reps: v }))} /></div>
            )}
            <div class="sf-rt__chips" role="group" aria-label={t('lg.tag')}>
              {TAGS.map((g) => <Chip key={g} selected={editing.tag === g} onPress={() => onChange(editSet(draft, pick.i, pick.j, { tag: g }))}>{t(`lg.tag.${g}` as StringKey)}</Chip>)}
            </div>
            <div class="sf-rt__row">
              <Button variant="secondary" onPress={() => { onChange(duplicateSet(draft, pick.i, pick.j)); setPick(null); }}>{t('lg.dup')}</Button>
              <Button variant="danger" onPress={() => { onChange(removeSetAt(draft, pick.i, pick.j)); setPick(null); }}>{t('lg.del')}</Button>
              <Button onPress={() => setPick(null)}>{t('lg.done')}</Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

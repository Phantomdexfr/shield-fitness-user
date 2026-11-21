import { useEffect, useRef, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Card, EmptyState, Input, Select, Sheet, SubPageHeader } from '../../ui/components';
import { Ring } from '../../ui/charts';
import { GOAL_KINDS, RANGE, goalProblem, milestones, parseNumber, toCelebrate, type Goal, type GoalKind, type GoalProblem } from '../../shared/goals';
import { createGoal, deleteGoal, loadGoals, markAchieved, type GoalRow, type GoalsData } from '../../data/repos/body';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: GoalsData };
const KIND_KEY: Record<GoalKind, StringKey> = { weight: 'goal.kind.weight', body_fat: 'goal.kind.body_fat', lift: 'goal.kind.lift', attendance: 'goal.kind.attendance', event: 'goal.kind.event' };
const STATUS_KEY = { reached: 'goal.s.reached', ahead: 'goal.s.ahead', on_track: 'goal.s.on_track', behind: 'goal.s.behind', overdue: 'goal.s.overdue', open: 'goal.s.open' } as const;
const PROBLEM_KEY: Record<GoalProblem, StringKey> = { target: 'goal.err.target', same_as_start: 'goal.err.same', deadline_past: 'goal.err.past', deadline_order: 'goal.err.order', slug: 'goal.err.slug', event_date: 'goal.err.event_date', title: 'goal.err.title' };

const unitOf = (k: GoalKind): string => (k === 'weight' || k === 'lift' ? 'kg' : k === 'body_fat' ? '%' : '');
const valueText = (k: GoalKind, v: number): string => (k === 'attendance' ? t(v === 1 ? 'goal.sessions.one' : 'goal.sessions.many', { n: v }) : `${v} ${unitOf(k)}`.trim());

export function goalTitle(r: GoalRow): string {
  const g = r.goal;
  switch (g.kind) {
    case 'weight': return t('goal.t.weight', { v: valueText('weight', g.target) });
    case 'body_fat': return t('goal.t.body_fat', { v: valueText('body_fat', g.target) });
    case 'lift': return t('goal.t.lift', { name: r.liftName ?? g.slug ?? '', v: valueText('lift', g.target) });
    case 'attendance': return t('goal.t.attendance', { v: valueText('attendance', g.target) });
    case 'event': return g.title ?? t('goal.kind.event');
  }
}

function GoalCard({ row, onDelete }: { row: GoalRow; onDelete: (id: string) => void }) {
  const { goal: g, progress: p } = row;
  const marks = milestones(g, p.current);
  return (
    <Card as="article" class="sf-pg__card">
      <h2 class="sf-pg__h">{goalTitle(row)}</h2>
      <div class="sf-pg__week">
        <Ring title={t('goal.progress')} value={p.pct} max={100} size={72} format={(v) => `${Math.round(v)}`} summary={t('goal.ring', { title: goalTitle(row), pct: p.pct })} />
        <div class="sf-pg__goalmeta">
          <p class="sf-rt__meta">{t(STATUS_KEY[p.status])}</p>
          {p.remaining !== null && !p.reached && g.kind !== 'event' && <p class="sf-rt__meta">{t('goal.remaining', { v: valueText(g.kind, p.remaining) })}</p>}
          {p.current !== null && g.kind !== 'event' && <p class="sf-rt__meta">{t('goal.now', { v: valueText(g.kind, p.current) })}</p>}
          {p.daysLeft !== null && <p class="sf-rt__meta">{p.daysLeft >= 0 ? t('goal.days.left', { n: p.daysLeft }) : t('goal.days.over', { n: -p.daysLeft })}{g.deadline ? ` (${g.deadline})` : ''}</p>}
        </div>
      </div>
      {marks.length > 0 && (
        <ul class="sf-pg__marks" aria-label={t('goal.marks')}>
          {marks.map((m) => (
            <li key={m.pct} class={m.reached ? 'sf-pg__mark sf-pg__mark--on' : 'sf-pg__mark'}>{`${m.pct} %: ${valueText(g.kind, m.value)}${m.reached ? ' ✓' : ''}`}</li>
          ))}
        </ul>
      )}
      <Button variant="ghost" onPress={() => onDelete(g.id)}>{t('goal.delete')}</Button>
    </Card>
  );
}

/** `/goals`: weight, body fat, lift, attendance and event goals with a deadline, quarter-way milestones and a one-time achievement moment. */
export default function GoalsPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GoalKind>('weight');
  const [target, setTarget] = useState('');
  const [lift, setLift] = useState('');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [won, setWon] = useState<string[]>([]);
  const marked = useRef(new Set<string>());
  const read = () => {
    loadGoals().then(
      (data) => {
        setLoad({ status: 'ready', data });
        const map = new Map(data.rows.map((r) => [r.goal.id, r.progress]));
        const fresh = toCelebrate(data.rows.map((r) => r.goal), map).filter((g) => !marked.current.has(g.id));
        if (fresh.length) {
          fresh.forEach((g) => marked.current.add(g.id));
          setWon((w) => [...w, ...fresh.map((g) => goalTitle(data.rows.find((r) => r.goal.id === g.id) as GoalRow))]);
          Promise.all(fresh.map((g) => markAchieved(g.id, data.today))).catch(() => undefined);
        }
      },
      () => setLoad({ status: 'error' }),
    );
  };
  useEffect(read, []);
  const back = () => goBack(navigate, '/progress');
  const head = <SubPageHeader title={t('page.goals.title')} onBack={back} backLabel={t('prog.back')} />;
  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('prog.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('prog.error')} actionLabel={t('rb.error.retry')} onAction={() => { setLoad({ status: 'loading' }); read(); }} /></section>;
  const d = load.data;

  const startValue = (): number | null => (kind === 'weight' ? d.latestKg : kind === 'body_fat' ? d.latestFat : kind === 'lift' ? (d.lifts.find((l) => l.slug === lift)?.bestE1rm ?? null) : 0);
  const needReading = (kind === 'weight' && d.latestKg === null) || (kind === 'body_fat' && d.latestFat === null);
  const submit = async () => {
    const start = startValue();
    if (start === null) return setError(t('goal.err.start'));
    const range = kind === 'weight' ? RANGE.kg : kind === 'body_fat' ? RANGE.fat : ([1, 1000] as const);
    const tg = kind === 'event' ? 0 : parseNumber(target, range[0], range[1]);
    if (tg === null) return setError(t('goal.err.target'));
    const g: Omit<Goal, 'id'> = { kind, target: tg, start, startDay: d.today };
    if (deadline) g.deadline = deadline;
    if (kind === 'lift') g.slug = lift;
    if (kind === 'event') g.title = title.trim();
    const problem = goalProblem(g, d.today);
    if (problem) return setError(t(PROBLEM_KEY[problem]));
    try {
      await createGoal(g);
      setOpen(false); setTarget(''); setTitle(''); setDeadline(''); setError('');
      read();
    } catch {
      setError(t('body.err.save'));
    }
  };
  const active = d.rows.filter((r) => !r.progress.reached);
  const done = d.rows.filter((r) => r.progress.reached);
  const kindOptions = GOAL_KINDS.map((k) => ({ value: k, label: t(KIND_KEY[k]) }));
  return (
    <section class="sf-page-body sf-rt">
      {head}
      {won.map((w) => (
        <div key={w} class="sf-sm__burst" role="status">
          <span class="sf-sm__burst-title">{t('goal.won.title')}</span>
          <p class="sf-sm__burst-line">{w}</p>
        </div>
      ))}
      <Button onPress={() => setOpen(true)} icon="plus">{t('goal.new')}</Button>
      {d.rows.length === 0 && <EmptyState icon="barbell" title={t('goal.empty.title')} hint={t('goal.empty.body')} />}
      <div class="sf-rt__list">{active.map((r) => <GoalCard key={r.goal.id} row={r} onDelete={(id) => { deleteGoal(id).then(read, read); }} />)}</div>
      {done.length > 0 && (
        <>
          <h2 class="sf-pg__h">{t('goal.done.title')}</h2>
          <div class="sf-rt__list">{done.map((r) => <GoalCard key={r.goal.id} row={r} onDelete={(id) => { deleteGoal(id).then(read, read); }} />)}</div>
        </>
      )}
      <div class="sf-pg__links"><Link href="/progress/body" class="sf-pr__link">{t('goal.body.link')}</Link></div>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('goal.new')}>
        <div class="sf-pg__form sf-pg__form--one">
          <Select label={t('goal.kind')} value={kind} options={kindOptions} onChange={(v) => { setKind(v); setError(''); }} />
          {needReading && <p class="sf-lib__note">{t('goal.need.reading')} <Link href="/progress/body" class="sf-pr__link">{t('goal.body.link')}</Link></p>}
          {kind === 'lift' && (
            d.lifts.length === 0 ? <p class="sf-lib__note">{t('goal.need.lift')}</p> : (
              <Select label={t('goal.lift')} value={lift} options={[{ value: '', label: t('goal.lift.pick') }, ...d.lifts.map((l) => ({ value: l.slug, label: l.name }))]} onChange={setLift} />
            )
          )}
          {kind === 'event' ? (
            <Input label={t('goal.event.name')} {...{ value: title, maxLength: 60 }} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
          ) : (
            <Input label={`${t('goal.target')}${unitOf(kind) ? ` (${unitOf(kind)})` : ''}`} {...{ value: target, inputMode: 'decimal' }} onInput={(e) => setTarget((e.target as HTMLInputElement).value)} />
          )}
          <Input label={kind === 'event' ? t('goal.event.date') : t('goal.deadline')} {...{ type: 'date', value: deadline }} onInput={(e) => setDeadline((e.target as HTMLInputElement).value)} />
          {error && <p class="sf-pg__err" role="alert">{error}</p>}
          <Button onPress={submit}>{t('goal.save')}</Button>
        </div>
      </Sheet>
    </section>
  );
}

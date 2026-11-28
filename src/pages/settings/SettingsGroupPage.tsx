import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { ChoiceRow, Collapsible, DatePicker, Input, NumberRow, RowGroup, Row as KitRow, Segmented, Stepper, SubPageHeader, Switch, Toggle, showToast } from '../../ui/components';
import { requestStart } from '../../app/tourStore';
import { setTipsOn, useTipsOn } from '../../app/tipsStore';
import { resolveFeature } from '../../app/flags';
import { usePref } from '../../data/usePref';
import { lockedByGym } from '../../data/repos/prefs';
import { prefDef, groupBySlug, type RowSpec } from '../../shared/settings';
import { useUx } from '../../ui/useUx';
import { goBack } from '../../app/navBack';
import { istDayKey } from '../../shared/dates';
import { yearOfDay } from '../../shared/calendar';
import { InterfaceStyle } from './InterfaceStyle';

const opt = (v: string) => ({ value: v, label: t(`st.v.${v}` as StringKey) });
const opts = (...vs: string[]) => vs.map(opt);

/** The rows of each group, in order. Labels come from `t()`. */
export function rowsFor(slug: string): RowSpec[] {
  switch (slug) {
    case 'account':
      return [
        { kind: 'text', pref: 'account.name', label: t('st.account.name'), hint: t('st.account.name.hint') },
        { kind: 'date', pref: 'account.birthDate', label: t('st.account.birth'), hint: t('st.account.birth.hint'), yearPref: 'account.birthYear' },
        { kind: 'number', pref: 'account.heightCm', label: t('st.account.height'), min: 100, max: 250, start: 170, unit: 'cm' },
        { kind: 'segmented', pref: 'account.heightUnit', label: t('st.account.heightUnit'), options: opts('cm', 'ft') },
        { kind: 'segmented', pref: 'account.level', label: t('st.account.level'), options: opts('unset', 'beginner', 'intermediate', 'advanced') },
        { kind: 'link', label: t('st.account.setup'), to: '/welcome?again=1' },
        { kind: 'link', label: t('st.account.badges'), to: '/profile/muscles', feature: 'muscle_badges' },
        { kind: 'link', label: t('st.account.body'), to: '/progress/body', feature: 'body_stats' },
      ];
    case 'training':
      return [
        { kind: 'segmented', pref: 'training.units', label: t('st.training.units'), options: opts('kg', 'lb') },
        { kind: 'toggle', pref: 'training.smartRest', label: t('st.training.smartRest'), hint: t('st.training.smartRest.hint') },
        { kind: 'stepper', pref: 'training.restSec', label: t('st.training.restSec'), unit: 's' },
        { kind: 'segmented', pref: 'training.overloadMode', label: t('st.training.overload'), options: opts('double', 'linear', 'off') },
        { kind: 'segmented', pref: 'training.intensity', label: t('st.training.intensity'), options: opts('light', 'moderate', 'hard', 'beast') },
        { kind: 'note', text: t('st.later') },
      ];
    case 'workout-flow':
      return [
        { kind: 'toggle', pref: 'flow.suggestions', label: t('st.flow.suggestions') },
        { kind: 'toggle', pref: 'flow.warmups', label: t('st.flow.warmups') },
        { kind: 'toggle', pref: 'flow.askWhySkip', label: t('st.flow.askWhySkip') },
        { kind: 'toggle', pref: 'flow.autoFill', label: t('st.flow.autoFill') },
        { kind: 'toggle', pref: 'flow.keepAwake', label: t('st.flow.keepAwake') },
        { kind: 'note', text: t('st.later') },
      ];
    case 'body':
      return [
        { kind: 'segmented', pref: 'body.heatPeriod', label: t('st.body.heat'), options: opts('week', 'month', 'all') },
        { kind: 'toggle', pref: 'body.recovery', label: t('st.body.recovery') },
        { kind: 'link', label: t('st.body.marks'), to: '/body/marks', feature: 'injury_marks' },
        { kind: 'link', label: t('st.body.stats'), to: '/progress/body', feature: 'body_stats' },
        { kind: 'link', label: t('st.body.goals'), to: '/goals', feature: 'goals' },
        { kind: 'link', label: t('st.body.intake'), to: '/intake', feature: 'intake' },
        { kind: 'note', text: t('st.later') },
      ];
    case 'appearance':
      return [
        { kind: 'ux' },
        { kind: 'note', text: t('st.appearance.theme') },
        { kind: 'segmented', pref: 'appearance.motion', label: t('st.appearance.motion'), options: opts('full', 'reduced') },
        { kind: 'toggle', pref: 'appearance.haptics', label: t('st.appearance.haptics'), hint: t('st.appearance.haptics.hint') },
        { kind: 'segmented', pref: 'appearance.density', label: t('st.appearance.density'), options: opts('comfortable', 'compact') },
        { kind: 'tour' },
        { kind: 'tips' },
      ];
    default:
      return [
        { kind: 'segmented', pref: 'mode.level', label: t('st.mode.label'), options: opts('simple', 'advanced') },
        { kind: 'note', text: t('st.mode.simple') },
        { kind: 'note', text: t('st.mode.advanced') },
      ];
  }
}

function Locked({ label, shown }: { label: string; shown: string }) {
  return (
    <div class="sf-st__row sf-st__row--locked">
      <span class="sf-st__label">{label}</span>
      <span class="sf-st__hint">{shown}</span>
      <span class="sf-st__lock">{t('st.locked')}</span>
    </div>
  );
}

function ToggleRow({ spec }: { spec: Extract<RowSpec, { kind: 'toggle' }> }) {
  const [v, set] = usePref<boolean>(spec.pref);
  if (lockedByGym(spec.pref)) return <Locked label={spec.label} shown={t(v ? 'st.v.on' : 'st.v.off')} />;
  return <Toggle checked={v} onChange={(n) => void set(n)} label={spec.label} hint={spec.hint} />;
}

function SegRow({ spec }: { spec: Extract<RowSpec, { kind: 'segmented' }> }) {
  const [v, set] = usePref<string>(spec.pref);
  if (lockedByGym(spec.pref)) return <Locked label={spec.label} shown={spec.options.find((o) => o.value === v)?.label ?? ''} />;
  if (spec.options.length >= 4) {
    return (
      <RowGroup>
        <ChoiceRow label={spec.label} value={v} options={spec.options} onChange={(n) => void set(n)} />
      </RowGroup>
    );
  }
  return (
    <div class="sf-st__row">
      <span class="sf-st__label">{spec.label}</span>
      <Segmented label={spec.label} value={v} onChange={(n) => void set(n)} options={[...spec.options]} />
    </div>
  );
}

function StepRow({ spec }: { spec: Extract<RowSpec, { kind: 'stepper' }> }) {
  const [v, set] = usePref<number>(spec.pref);
  const k = prefDef(spec.pref)?.kind;
  const wheels = useUx('wheels') === 'premium';
  if (lockedByGym(spec.pref)) return <Locked label={spec.label} shown={`${v} ${spec.unit}`} />;
  if (!k || k.type !== 'int') return null;
  // Phase 101: with wheels on, the stepper becomes a row that opens a wheel (rest seconds); Classic keeps the stepper.
  if (wheels) {
    return (
      <RowGroup>
        <NumberRow label={spec.label} value={v} min={k.min} max={k.max} step={k.step} format={(n) => `${n} ${spec.unit}`} onChange={(n) => void set(n)} />
      </RowGroup>
    );
  }
  return (
    <div class="sf-st__row">
      <span class="sf-st__label">{spec.label}</span>
      <Stepper label={spec.label} value={v} step={k.step} min={k.min} max={k.max} format={(n) => `${n} ${spec.unit}`} onChange={(n) => void set(n)} />
    </div>
  );
}

/** A number chosen in a sheet (never typed). 0 is stored for "not set" and shows as such until a value is chosen. */
function NumberPrefRow({ spec }: { spec: Extract<RowSpec, { kind: 'number' }> }) {
  const [v, set] = usePref<number>(spec.pref);
  return (
    <RowGroup>
      <NumberRow label={spec.label} value={v || spec.start} min={spec.min} max={spec.max} format={(n) => `${n} ${spec.unit}`} empty={v ? undefined : t('ob.about.unset')} onChange={(n) => void set(n)} />
    </RowGroup>
  );
}

function TextRow({ spec }: { spec: Extract<RowSpec, { kind: 'text' }> }) {
  const [stored, set, ready] = usePref<string>(spec.pref);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? stored;
  const save = () => {
    if (draft === null) return;
    void set(draft).then(() => setDraft(null));
  };
  return (
    <div class="sf-st__row">
      <Input
        label={spec.label}
        hint={spec.hint}
        {...{ value: ready ? shown : '', inputMode: 'text', maxLength: 30, autoComplete: 'off' }}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={save}
      />
    </div>
  );
}

/** A date chosen on the calendar (no typing). Also keeps the older birth-year pref equal to its year. */
function DateRow({ spec }: { spec: Extract<RowSpec, { kind: 'date' }> }) {
  const [stored, set, ready] = usePref<string>(spec.pref);
  const [year, setYear] = usePref<string>(spec.yearPref ?? spec.pref);
  const pick = (v: string) => {
    void set(v);
    if (spec.yearPref) void setYear(yearOfDay(v));
  };
  const hint = !stored && spec.yearPref && year ? t('st.account.birth.old', { y: year }) : spec.hint;
  return (
    <div class="sf-st__row">
      <DatePicker label={spec.label} hint={hint} value={ready ? stored : ''} min="1900-01-01" max={istDayKey(Date.now())} yearFrom={1900} yearTo={Number(istDayKey(Date.now()).slice(0, 4))} clearable onChange={pick} />
    </div>
  );
}

/** Phase 116: "Start walkthrough". Starts the guided tour from step 1 (also after it was done or skipped), but never on top of an open workout. */
function TourRow() {
  const press = () => {
    void requestStart().then((r) => {
      if (r === 'busy') showToast(t('tour.row.busy'));
    });
  };
  return (
    <RowGroup>
      <KitRow label={t('tour.row.label')} hint={t('tour.row.hint')} onPress={press} data-tour="tour-row" />
    </RowGroup>
  );
}

/** Phase 117: the app-wide page-tips switch (the "i" button on each main page). */
function TipsRow() {
  const on = useTipsOn() === true;
  return (
    <RowGroup>
      <KitRow label={t('tips.switch')} hint={t('tips.row.hint')} trailing={<Switch checked={on} onChange={(v) => void setTipsOn(v)} label={t('tips.switch')} />} data-tour="tips-row" />
    </RowGroup>
  );
}

function Row({ spec }: { spec: RowSpec }) {
  switch (spec.kind) {
    case 'toggle':
      return <ToggleRow spec={spec} />;
    case 'segmented':
      return <SegRow spec={spec} />;
    case 'stepper':
      return <StepRow spec={spec} />;
    case 'text':
      return <TextRow spec={spec} />;
    case 'number':
      return <NumberPrefRow spec={spec} />;
    case 'date':
      return <DateRow spec={spec} />;
    case 'ux':
      return <InterfaceStyle />;
    case 'tour':
      return <TourRow />;
    case 'tips':
      return <TipsRow />;
    case 'note':
      return <p class="sf-st__hint">{spec.text}</p>;
    case 'link':
      if (spec.feature && !resolveFeature(spec.feature)) return null;
      return (
        <Link href={spec.to} class="sf-st__group">
          <span class="sf-st__text">
            <span class="sf-st__name">{spec.label}</span>
          </span>
        </Link>
      );
  }
}

/** Rows that sit together in one container in the premium layout. Notes, the interface-style block and links break a run. */
const STACKABLE: ReadonlySet<RowSpec['kind']> = new Set(['toggle', 'segmented', 'stepper', 'text', 'number', 'date']);

export function runsOf(rows: readonly RowSpec[]): { stack: boolean; rows: RowSpec[] }[] {
  const out: { stack: boolean; rows: RowSpec[] }[] = [];
  for (const r of rows) {
    const stack = STACKABLE.has(r.kind);
    const last = out[out.length - 1];
    if (stack && last?.stack) last.rows.push(r);
    else out.push({ stack, rows: [r] });
  }
  return out;
}

/** /settings/<group>: its rows, one page, nothing expands in place. The group is the last part of the address. */
export default function SettingsGroupPage() {
  const [path, navigate] = useLocation();
  const premium = useUx('layout') === 'premium';
  const slug = path.split('/').filter(Boolean).pop() ?? '';
  if (!groupBySlug(slug)) return null;
  const rows = rowsFor(slug);
  const links = rows.filter((r) => r.kind === 'link' && (!r.feature || resolveFeature(r.feature)));
  const plain = rows.filter((r) => r.kind !== 'link');
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t(`st.g.${slug}` as StringKey)} onBack={() => goBack(navigate, '/settings')} />
      {premium
        ? runsOf(plain).map((run, i) =>
            run.stack ? (
              <div key={i} class="sf-st__stack">
                {run.rows.map((r, j) => (
                  <Row key={j} spec={r} />
                ))}
              </div>
            ) : (
              run.rows.map((r, j) => <Row key={`${i}-${j}`} spec={r} />)
            ),
          )
        : plain.map((r, i) => <Row key={i} spec={r} />)}
      {links.length > 0 && (
        <Collapsible id="links" title={t('ux.shortcuts')} summary={String(links.length)}>
          {links.map((r, i) => (
            <Row key={i} spec={r} />
          ))}
        </Collapsible>
      )}
    </section>
  );
}

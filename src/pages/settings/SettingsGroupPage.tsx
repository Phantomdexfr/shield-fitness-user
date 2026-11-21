import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Input, Segmented, Stepper, SubPageHeader, Toggle } from '../../ui/components';
import { resolveFeature } from '../../app/flags';
import { usePref } from '../../data/usePref';
import { lockedByGym } from '../../data/repos/prefs';
import { prefDef, parseBirthYear, groupBySlug, type RowSpec } from '../../shared/settings';
import { goBack } from '../../app/navBack';

const opt = (v: string) => ({ value: v, label: t(`st.v.${v}` as StringKey) });
const opts = (...vs: string[]) => vs.map(opt);

/** The rows of each group, in order. Labels come from `t()`. */
export function rowsFor(slug: string): RowSpec[] {
  switch (slug) {
    case 'account':
      return [
        { kind: 'text', pref: 'account.name', label: t('st.account.name'), hint: t('st.account.name.hint') },
        { kind: 'text', pref: 'account.birthYear', label: t('st.account.year'), hint: t('st.account.year.hint'), birthYear: true },
        { kind: 'segmented', pref: 'account.level', label: t('st.account.level'), options: opts('unset', 'beginner', 'intermediate', 'advanced') },
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
        { kind: 'note', text: t('st.appearance.theme') },
        { kind: 'segmented', pref: 'appearance.motion', label: t('st.appearance.motion'), options: opts('full', 'reduced') },
        { kind: 'toggle', pref: 'appearance.haptics', label: t('st.appearance.haptics'), hint: t('st.appearance.haptics.hint') },
        { kind: 'segmented', pref: 'appearance.density', label: t('st.appearance.density'), options: opts('comfortable', 'compact') },
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
  if (lockedByGym(spec.pref)) return <Locked label={spec.label} shown={`${v} ${spec.unit}`} />;
  if (!k || k.type !== 'int') return null;
  return (
    <div class="sf-st__row">
      <span class="sf-st__label">{spec.label}</span>
      <Stepper label={spec.label} value={v} step={k.step} min={k.min} max={k.max} format={(n) => `${n} ${spec.unit}`} onChange={(n) => void set(n)} />
    </div>
  );
}

function TextRow({ spec }: { spec: Extract<RowSpec, { kind: 'text' }> }) {
  const [stored, set, ready] = usePref<string>(spec.pref);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const shown = draft ?? stored;
  const save = () => {
    if (draft === null) return;
    if (spec.birthYear) {
      const r = parseBirthYear(draft);
      if (!r.ok) {
        setError(t('st.account.year.err'));
        return;
      }
    }
    setError('');
    void set(draft).then(() => setDraft(null));
  };
  return (
    <div class="sf-st__row">
      <Input
        label={spec.label}
        hint={spec.hint}
        error={error || undefined}
        {...{ value: ready ? shown : '', inputMode: spec.birthYear ? 'numeric' : 'text', maxLength: spec.birthYear ? 4 : 30, autoComplete: 'off' }}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onBlur={save}
      />
    </div>
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

/** /settings/<group>: its rows, one page, nothing expands in place. The group is the last part of the address. */
export default function SettingsGroupPage() {
  const [path, navigate] = useLocation();
  const slug = path.split('/').filter(Boolean).pop() ?? '';
  if (!groupBySlug(slug)) return null;
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={t(`st.g.${slug}` as StringKey)} onBack={() => goBack(navigate, '/settings')} />
      {rowsFor(slug).map((r, i) => (
        <Row key={i} spec={r} />
      ))}
    </section>
  );
}

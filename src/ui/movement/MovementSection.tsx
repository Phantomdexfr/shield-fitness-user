// Movement map blocks (Phase 25): the section used on the exercise page, the mini figure for the session header and the
// pattern preview for the custom-exercise creator (Phase 27 mounts it; no creator page exists yet).

import { useMemo, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { t } from '../../i18n';
import { Select, Sheet, Stepper } from '../components';
import { MovementFigure } from './MovementFigure';
import { parseParams, paramsToString, type MovementData, type MovementPattern, type MovementSex, type Params } from '../../shared/movement';
import { benchOf } from './movementModel';

export interface MuscleChip {
  id: string;
  label: string;
}

export interface MovementSectionProps {
  pattern: MovementPattern;
  param?: string;
  setupParams?: Params;
  sex?: MovementSex;
  name: string;
  machineCategory?: string;
  chips?: MuscleChip[];
  /** Hide the heading (the machine page has its own). */
  bare?: boolean;
}

/** Title + (i) sheet + figure + muscle chips + text twin. */
export function MovementSection(p: MovementSectionProps) {
  const [info, setInfo] = useState(false);
  return (
    <section aria-label={t('mm.title')} class="sf-ex__block sf-mm__section">
      {!p.bare && (
        <div class="sf-mm__head">
          <h2 class="sf-ex__h">{t('mm.title')}</h2>
          <button type="button" class="sf-mm__info" aria-label={t('mm.info.open')} onClick={() => setInfo(true)}>
            i
          </button>
        </div>
      )}
      <MovementFigure pattern={p.pattern} {...(p.param !== undefined ? { param: p.param } : {})} {...(p.setupParams ? { setupParams: p.setupParams } : {})} {...(p.sex ? { sex: p.sex } : {})} name={p.name} {...(p.machineCategory ? { machineCategory: p.machineCategory } : {})} />
      {p.chips && p.chips.length > 0 && (
        <ul class="sf-mm__chips">
          {p.chips.map((c) => (
            <li key={c.id}>
              <Link href={`/muscle/${c.id}`} class="sf-mm__chip">
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={info} onClose={() => setInfo(false)} title={t('mm.title')} closeLabel={t('mm.close')}>
        <p class="sf-ex__line">{t('mm.info')}</p>
      </Sheet>
    </section>
  );
}

/** Session header: end pose only, 56 px. Tap opens the full figure in a sheet. Off by default in Settings (Phase 34 wires it). */
export function MiniMovement(p: Omit<MovementSectionProps, 'chips' | 'bare'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" class="sf-mm__mini" aria-label={t('mm.mini_open')} onClick={() => setOpen(true)}>
        <MovementFigure pattern={p.pattern} {...(p.param !== undefined ? { param: p.param } : {})} {...(p.sex ? { sex: p.sex } : {})} name={p.name} mini />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={p.name} closeLabel={t('mm.close')}>
        <MovementSection {...p} bare />
      </Sheet>
    </>
  );
}

export interface PatternPreviewValue {
  patternId: string;
  /** `key=value;key=value` (the same string a custom exercise stores). */
  param: string;
}
export interface PatternPreviewProps {
  data: MovementData | null;
  value: PatternPreviewValue;
  onChange: (v: PatternPreviewValue) => void;
  sex?: MovementSex;
  name?: string;
}

/** Creator preview: choose one of the patterns (or None), the figure follows; a bench angle stepper when the pattern uses one. */
export function PatternPreview({ data, value, onChange, sex, name }: PatternPreviewProps) {
  const patterns = useMemo(() => (data ? Object.values(data.patterns).sort((a, b) => a.name.localeCompare(b.name)) : []), [data]);
  const pattern = data?.patterns[value.patternId];
  const params = parseParams(value.param);
  const usesBench = pattern ? parseParams(pattern.defaultParam).bench_deg !== undefined : false;
  const bench = benchOf(pattern, params);
  return (
    <div class="sf-ex__block">
      <Select
        label={t('mm.pattern')}
        value={value.patternId}
        options={[{ value: '', label: t('mm.none') }, ...patterns.map((x) => ({ value: x.id, label: x.name }))]}
        onChange={(id) => onChange({ patternId: id, param: '' })}
        hint={t('mm.pattern.hint')}
      />
      {pattern ? (
        <>
          <MovementFigure pattern={pattern} param={value.param} {...(sex ? { sex } : {})} name={name || pattern.name} />
          {usesBench && (
            <Stepper
              label={t('mm.bench')}
              value={bench}
              min={-15}
              max={90}
              step={5}
              format={(v) => `${v}°`}
              onChange={(v) => onChange({ patternId: value.patternId, param: paramsToString({ ...params, bench_deg: String(v) }) })}
            />
          )}
        </>
      ) : (
        <p class="sf-lib__note">{t('mm.unmapped')}</p>
      )}
    </div>
  );
}

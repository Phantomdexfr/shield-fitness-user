import { useMemo, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import type { LabData } from '../../data/repos/lab';
import { Badge, Segmented, Row } from '../../ui/components';
import { BodyPicker, type Sex, type View } from '../../ui/body';
import { emphasisOf, machineWorkedRows, workedRows, type WorkedRow } from './labData';
import { muscleName } from './LabPanel';

type Kind = 'exercise' | 'machine';
const MAX_HITS = 8;

/** "Muscles worked": pick an exercise or a machine, see primary and secondary muscles on the body. */
export function WorkedPanel({ data, sex, view, onSex, onView }: { data: LabData; sex: Sex; view: View; onSex: (s: Sex) => void; onView: (v: View) => void }) {
  const [kind, setKind] = useState<Kind>('exercise');
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<{ kind: Kind; slug: string; name: string } | undefined>();
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return [];
    const src = kind === 'exercise' ? data.candidates.map((c) => ({ slug: c.slug, name: c.name })) : data.machines.map((m) => ({ slug: m.slug, name: m.name }));
    return src
      .filter((x) => x.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.length - b.name.length || (a.slug < b.slug ? -1 : 1))
      .slice(0, MAX_HITS);
  }, [data, kind, needle]);
  const rows: WorkedRow[] = useMemo(() => {
    if (!chosen) return [];
    return chosen.kind === 'exercise' ? workedRows(data.map[chosen.slug] ?? []) : machineWorkedRows(data.reach, chosen.slug);
  }, [data, chosen]);
  const emphasis = useMemo(() => emphasisOf(rows), [rows]);

  return (
    <div class="sf-lab__worked">
      <Segmented<Kind>
        label={t('lab.worked.kind')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'exercise', label: t('lab.worked.exercise') },
          { value: 'machine', label: t('lab.worked.machine') },
        ]}
      />
      <input class="sf-chips__search" type="search" value={q} placeholder={t('lab.worked.search')} aria-label={t('lab.worked.search')} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {needle && hits.length === 0 && <p class="sf-lab__note">{t('lab.worked.none')}</p>}
      {hits.length > 0 && (
        <ul class="sf-lab__list">
          {hits.map((h) => (
            <li key={h.slug} class="sf-lab__row">
              <button
                type="button"
                class="sf-row sf-lab__pickbtn"
                aria-pressed={chosen?.slug === h.slug && chosen.kind === kind}
                onClick={() => {
                  setChosen({ kind, slug: h.slug, name: h.name });
                  setQ('');
                }}
              >
                <span class="sf-lab__name">{h.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <BodyPicker mode="view" sex={sex} view={view} onSexChange={onSex} onViewChange={onView} emphasis={emphasis} />
      {!chosen && <p class="sf-lab__note">{t('lab.worked.pick')}</p>}
      {chosen && (
        <section class="sf-lab__sec" aria-label={chosen.name}>
          <h3 class="sf-lab__h">{chosen.name}</h3>
          {rows.length === 0 ? (
            <p class="sf-lab__note">{t('lab.worked.nodata')}</p>
          ) : (
            <ul class="sf-lab__list">
              {rows.map((r) => (
                <li key={r.muscle} class="sf-lab__row sf-lab__row--flat">
                  <Row href={`/muscle/${r.muscle}`}>
                    <span class="sf-lab__name">{muscleName(r.muscle)}</span>
                  </Row>
                  <Badge tone={r.role === 'primary' ? 'gold' : 'neutral'}>
                    {t(`lab.worked.${r.role}` as StringKey)}, {t(`lab.worked.band.${r.band}` as StringKey)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {chosen.kind === 'machine' && <p class="sf-lab__note">{t('lab.worked.reach')}</p>}
          <Row href={chosen.kind === 'exercise' ? `/exercise/${chosen.slug}` : `/machine/${chosen.slug}`}>
            {t('lab.worked.open', { name: chosen.name })}
          </Row>
        </section>
      )}
    </div>
  );
}

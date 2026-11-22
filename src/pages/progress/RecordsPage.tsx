import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Card, Chip, EmptyState, SubPageHeader, Row } from '../../ui/components';
import { useFeature } from '../../app/flags';
import { prWall } from '../../shared/history';
import { loadBoard, type BoardData, type BoardRow } from '../../data/repos/records';
import { PR_METRICS, type PRMetric } from '../../shared/pr';
import { recordText } from './prText';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: BoardData };

const LABEL: Record<PRMetric, 'pr.weight' | 'pr.reps' | 'pr.volume' | 'pr.e1rm'> = { weight: 'pr.weight', reps: 'pr.reps', volume: 'pr.volume', e1rm: 'pr.e1rm' };

function RecordCard({ row }: { row: BoardRow }) {
  return (
    <Card as="article" class="sf-pr__card">
      <h2 class="sf-pr__name"><Row href={row.href}>{row.name}</Row></h2>
      <p class="sf-rt__meta">
        {row.grip ? `${t('pr.grip', { grip: row.grip })} · ` : ''}
        {t('pr.sessions', { n: String(row.sessions) })} · {t('pr.last', { date: row.lastDay })}
      </p>
      <dl class="sf-pr__grid">
        {PR_METRICS.map((m) => (
          <div key={m} class="sf-pr__cell">
            <dt class="sf-rt__meta">{t(LABEL[m])}</dt>
            <dd class="sf-pr__val">{row.records[m] == null ? t('pr.none') : recordText(m, row.records[m] as number)}</dd>
            {row.dates[m] && <dd class="sf-pr__date">{row.dates[m]}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** `/progress/records`: one card per exercise with its best weight, reps, single-set volume and e1RM. */
export default function RecordsPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const wallOn = useFeature('pr_celebration');
  const [wall, setWall] = useState(false);
  const read = () => {
    setLoad({ status: 'loading' });
    loadBoard().then((data) => setLoad({ status: 'ready', data }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);
  const back = () => goBack(navigate, '/me');
  const head = <SubPageHeader title={t('page.records.title')} onBack={back} backLabel={t('pr.back')} />;

  if (load.status === 'loading') return <section class="sf-page-body sf-rt">{head}<p class="sf-lib__note" role="status">{t('pr.loading')}</p></section>;
  if (load.status === 'error') return <section class="sf-page-body sf-rt">{head}<EmptyState icon="warning" title={t('pr.error')} actionLabel={t('rb.error.retry')} onAction={read} /></section>;
  const { rows } = load.data;
  return (
    <section class="sf-page-body sf-rt">
      {head}
      {rows.length === 0 ? (
        <EmptyState icon="barbell" title={t('pr.empty.title')} hint={t('pr.empty.body')} />
      ) : (
        <>
          {wallOn && (
            <div class="sf-rt__chips" role="group">
              <Chip selected={!wall} onPress={() => setWall(false)}>{t('pr.view.board')}</Chip>
              <Chip selected={wall} onPress={() => setWall(true)}>{t('pr.view.wall')}</Chip>
            </div>
          )}
          {wallOn && wall ? (
            <>
              <p class="sf-lib__note">{t('pr.wall.note')}</p>
              <ul class="sf-pr__wall">
                {prWall(rows).map((e) => {
                  const name = rows.find((r) => r.key === e.key)?.name ?? e.slug;
                  return (
                    <li key={`${e.key}-${e.metric}`} class="sf-pr__wall-row">
                      <strong>{name}</strong>
                      <span>{`${t(LABEL[e.metric])}: ${recordText(e.metric, e.value)}`}</span>
                      <span class="sf-pr__date">{e.day}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <p class="sf-lib__note">{t('pr.note')}</p>
              <div class="sf-rt__list">{rows.map((r) => <RecordCard key={r.key} row={r} />)}</div>
            </>
          )}
        </>
      )}
    </section>
  );
}

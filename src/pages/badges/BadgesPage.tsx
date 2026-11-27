import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Chip, EmptyState, ProgressBar, Sheet, SubPageHeader, Row } from '../../ui/components';
import { BodyPicker, type Sex as FigureSex, type View } from '../../ui/body';
import { useFigureSex } from '../../ui/body/useFigureSex';
import { confirmSets, getProfile, loadBadgeState, saveProfile, type BadgeState } from '../../data/repos/badges';
import { BADGE_GROUPS, type BadgeResult, type MuscleBadge } from '../../shared/badges';
import { dayLabel } from '../history/dayText';
import { Crest } from './Crest';
import { ProfileForm } from './ProfileForm';
import { TIER_IDS, confirmKeys, experienceTiers, figureTiers, pct, rankedRows, round1, round2, strongestWeakest, tierClass, unrankedCount } from './badgesModel';
import { goBack } from '../../app/navBack';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; state: BadgeState };

const muscleName = (id: string): string => t(`muscle.${id}` as StringKey);
const tierName = (n: number | null): string => (n == null ? t('badge.unranked') : t(`badge.tier.${n}` as StringKey));

type Layer = 'strength' | 'experience';

function MuscleSheet({ state, result, id, layer, onClose, onWeak }: { state: BadgeState; result: BadgeResult; id: string | null; layer: Layer; onClose: () => void; onWeak: () => void }) {
  const m: MuscleBadge | undefined = id ? result.muscles[id] : undefined;
  const ladderName = (lid: string): string => state.data.ladders.find((l) => l.ladderId === lid)?.name ?? lid;
  const exp = id ? result.experience.muscles[id] : undefined;
  const rust = id ? result.rust[id] : undefined;
  const expFirst = layer === 'experience';
  // A detailed muscle has its own meter; a group id (back, chest...) has only the group tier (median of its trained muscles).
  const groupExp = id ? result.experience.groups[id] : undefined;
  const expTier = exp && exp.mp > 0 ? exp.tier : groupExp ?? null;
  const expBody = exp && (
    <>
      <ProgressBar value={exp.progress} label={t('badge.exp.aria', { muscle: id ? muscleName(id) : '' })} />
      <p class="sf-bd__note">{exp.toNext > 0 ? t(Math.ceil(exp.toNext) === 1 ? 'badge.exp.line_one' : 'badge.exp.line', { tier: tierName(exp.tier), n: Math.ceil(exp.toNext), next: tierName(exp.tier + 1) }) : t('badge.exp.top', { tier: tierName(exp.tier) })}</p>
    </>
  );
  return (
    <Sheet open={id !== null} onClose={onClose} title={id ? muscleName(id) : ''}>
      {id && m && (
        <div class="sf-bd">
          <Crest tier={expFirst ? expTier : m.tier} size="lg" hideName />
          <p class="sf-bd__line">{expFirst ? t('badge.exp.sheet.line', { muscle: muscleName(id), tier: tierName(expTier) }) : t('badge.sheet.line', { muscle: muscleName(id), tier: tierName(m.tier) })}</p>
          {expFirst && (
            <>
              {expTier == null ? <p class="sf-bd__note">{t('badge.exp.sheet.none')}</p> : exp && exp.mp > 0 ? expBody : <p class="sf-bd__note">{t('badge.exp.sheet.group')}</p>}
              <p class="sf-bd__note">{t('badge.exp.sheet.explain')}</p>
              <h3 class="sf-bd__h">{t('badge.layer.strength')}</h3>
              <p class="sf-bd__line">{t('badge.sheet.line', { muscle: muscleName(id), tier: tierName(m.tier) })}</p>
            </>
          )}
          {result.estimated && m.tier != null && <p class="sf-bd__note">{t('badge.estimated.short')}</p>}
          {m.tier == null ? (
            <>
              <p class="sf-bd__note">{t('badge.sheet.unranked')}</p>
              {m.suggest.length > 0 && <p class="sf-bd__note">{t('badge.sheet.suggest', { lifts: m.suggest.map(ladderName).join(', ') })}</p>}
            </>
          ) : (
            <>
              {m.next ? (
                <>
                  <ProgressBar value={m.progress ?? 0} label={t('badge.sheet.progress_aria', { muscle: muscleName(id) })} />
                  <p class="sf-bd__note">{t('badge.sheet.to_next', { pct: pct(m.progress), tier: tierName(m.next.tier) })}</p>
                  <p class="sf-bd__note">{t('badge.sheet.need', { tier: tierName(m.next.tier), bw: round1(result.bodyweightKg), x: round2(m.next.ratio), kg: Math.round(m.next.thresholdKg), lift: ladderName(m.next.ladderId) })}</p>
                </>
              ) : (
                <p class="sf-bd__note">{t('badge.sheet.top')}</p>
              )}
              {m.best?.best && (
                <p class="sf-bd__note">{t('badge.sheet.best', { lift: ladderName(m.best.ladderId), e1rm: Math.round(m.best.best.e1rm), day: dayLabel(m.best.best.day) })}</p>
              )}
              {m.held && <p class="sf-bd__note">{t(`badge.held.${m.held}`)}</p>}
              {m.peak != null && m.peak > (m.tier ?? 0) && <p class="sf-bd__note">{t('badge.sheet.peak', { tier: tierName(m.peak) })}</p>}
            </>
          )}
          {rust?.rusty && rust.daysSince != null && <p class="sf-bd__rust" role="status">{t('badge.sheet.rusty', { n: rust.daysSince })}</p>}
          {exp && !expFirst && (
            <>
              <h3 class="sf-bd__h">{t('badge.exp.title')}</h3>
              {expBody}
            </>
          )}
          {m.candidates.length > 0 && (
            <>
              <h3 class="sf-bd__h">{t('badge.sheet.lifts')}</h3>
              <ul class="sf-bd__rows">
                {m.candidates.slice(0, 4).map((c) => (
                  <li key={c.ladderId} class="sf-bd__row">
                    <span>{c.name}</span>
                    <span class="sf-bd__val">{c.best ? t('badge.sheet.e1rm', { kg: Math.round(c.best.e1rm) }) : t('badge.sheet.notlogged')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Button variant="secondary" onPress={onWeak}>{t('badge.sheet.train')}</Button>
        </div>
      )}
    </Sheet>
  );
}

/** `/profile/muscles`: bodyweight-relative strength tiers per muscle, group and overall. */
export default function BadgesPage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [sex, setSex] = useFigureSex();
  const [view, setView] = useState<View>('front');
  const [picked, setPicked] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>('strength');

  const read = () => {
    setLoad({ status: 'loading' });
    loadBadgeState().then((state) => setLoad(state ? { status: 'ready', state } : { status: 'error' }), () => setLoad({ status: 'error' }));
  };
  useEffect(read, []);

  const state = load.status === 'ready' ? load.state : null;
  const result = state && state.result.status === 'ok' ? state.result : null;
  const tiers = useMemo(() => (result ? (layer === 'experience' ? experienceTiers(result) : figureTiers(result)) : {}), [result, layer]);
  const rows = useMemo(() => (result ? rankedRows(result) : []), [result]);

  const head = <SubPageHeader title={t('page.badges.title')} onBack={() => goBack(navigate, '/body')} backLabel={t('sm.back')} />;
  if (load.status === 'loading') return <div class="sf-bd">{head}<p class="sf-bd__note" role="status">{t('badge.loading')}</p></div>;
  if (load.status === 'error' || !state) return <div class="sf-bd">{head}<p class="sf-bd__note" role="alert">{t('badge.error')}</p><Button onPress={read}>{t('badge.retry')}</Button></div>;

  if (state.profile.skipped) {
    return (
      <div class="sf-bd">
        {head}
        <EmptyState title={t('badge.hidden.title')} hint={t('badge.hidden.hint')} actionLabel={t('badge.hidden.go')} onAction={async () => { await saveProfile({ ...(await getProfile()), skipped: false }); read(); }} />
      </div>
    );
  }
  if (!result) {
    return (
      <div class="sf-bd">
        {head}
        <h2 class="sf-bd__h">{t('badge.form.title')}</h2>
        <ProfileForm
          initialSex={state.profile.sex}
          initialKg={state.bodyweightKg}
          firstRun
          onDone={read}
          onSkip={async () => { await saveProfile({ ...(await getProfile()), skipped: true }); read(); }}
        />
        <p class="sf-bd__note">{t('badge.limits')}</p>
      </div>
    );
  }

  const order = BADGE_GROUPS as readonly string[];
  const sw = strongestWeakest(result.groups, order);
  const noneRanked = rows.length === 0;
  const confirm = confirmKeys(result);

  return (
    <div class="sf-bd">
      {head}
      <Row label={t('badge.settings')} href="/settings/badges" />

      <section class="sf-bd__card" aria-label={t('badge.overall.title')}>
        {layer === 'experience' ? (
          <>
            <Crest tier={result.experience.overall} size="lg" hideName />
            <div class="sf-bd__card-text">
              <strong>{result.experience.overall == null ? t('badge.exp.none') : t('badge.exp.overall', { tier: tierName(result.experience.overall) })}</strong>
            </div>
          </>
        ) : (
          <>
            <Crest tier={result.overall.tier} size="lg" hideName />
            <div class="sf-bd__card-text">
              <strong>{t('badge.overall.line', { tier: tierName(result.overall.tier) })}</strong>
              {result.overall.tier != null && result.overall.provisional && <span class="sf-bd__note">{t('badge.overall.provisional', { n: result.overall.rankedGroups })}</span>}
              <span class="sf-bd__note">{t('badge.at_bw', { kg: round1(result.bodyweightKg) })}</span>
              {result.estimated && <span class="sf-bd__est">{t('badge.estimated')}</span>}
            </div>
          </>
        )}
      </section>

      {noneRanked && <EmptyState title={t('badge.empty.title')} hint={t('badge.empty.hint')} actionLabel={t('badge.empty.go')} onAction={() => navigate('/train')} />}

      <div class="sf-rt__chips" role="group" aria-label={t('badge.layer.aria')}>
        <Chip selected={layer === 'strength'} onPress={() => setLayer('strength')}>{t('badge.layer.strength')}</Chip>
        <Chip selected={layer === 'experience'} onPress={() => setLayer('experience')}>{t('badge.layer.experience')}</Chip>
      </div>
      <p class="sf-bd__note sf-bd__layer-desc" aria-live="polite">{t(layer === 'experience' ? 'badge.layer.desc.experience' : 'badge.layer.desc.strength')}</p>
      <BodyPicker mode="heat" sex={sex} view={view} onSexChange={setSex} onViewChange={setView} onSelect={(id) => setPicked(id)} tier={tiers} />
      <div class="sf-bd__legend" role="group" aria-label={t('badge.legend')}>
        {TIER_IDS.map((n) => (
          <span key={n} class="sf-bd__key"><span class={`sf-bd__sw ${tierClass(n)}`} aria-hidden="true" />{tierName(n)}</span>
        ))}
      </div>
      {unrankedCount(result) > 0 && <p class="sf-bd__note">{t('badge.unranked_count', { n: unrankedCount(result) })}</p>}

      {rows.length > 0 && (
        <section class="sf-bd__sec" aria-label={t('badge.list.title')}>
          <h2 class="sf-bd__h">{t('badge.list.title')}</h2>
          <ul class="sf-bd__rows">
            {rows.map((m) => (
              <li key={m.id}>
                <button type="button" class="sf-bd__row sf-bd__btn" onClick={() => setPicked(m.id)}>
                  <Crest tier={m.tier} size="sm" hideName />
                  <span class="sf-bd__grow">{muscleName(m.id)}</span>
                  <span class="sf-bd__val">{tierName(m.tier)}{result.rust[m.id]?.rusty ? ` - ${t('badge.rusty')}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="sf-bd__sec" aria-label={t('badge.groups.title')}>
        <h2 class="sf-bd__h">{t('badge.groups.title')}</h2>
        <ul class="sf-bd__rows">
          {order.map((g) => {
            const b = result.groups[g];
            if (!b) return null;
            const share = b.rankingLadders > 0 ? b.rankedLadders / b.rankingLadders : 0;
            return (
              <li key={g} class="sf-bd__row sf-bd__row--col">
                <span class="sf-bd__row-top"><Crest tier={b.tier} size="sm" hideName /><span class="sf-bd__grow">{muscleName(g)}</span><span class="sf-bd__val">{tierName(b.tier)}</span></span>
                <ProgressBar value={share} label={t('badge.groups.aria', { group: muscleName(g) })} />
                <span class="sf-bd__note">{t('badge.groups.lifts', { a: b.rankedLadders, b: b.rankingLadders })}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {sw && (
        <section class="sf-bd__sec" aria-label={t('badge.sw.title')}>
          <h2 class="sf-bd__h">{t('badge.sw.title')}</h2>
          <p class="sf-bd__note">{t('badge.sw.strong', { group: muscleName(sw.strong), tier: tierName(result.groups[sw.strong]!.tier) })}</p>
          <p class="sf-bd__note">{t('badge.sw.weak', { group: muscleName(sw.weak), tier: tierName(result.groups[sw.weak]!.tier) })}</p>
          <Button variant="secondary" onPress={() => navigate('/heatmap')}>{t('badge.sw.go')}</Button>
        </section>
      )}

      <section class="sf-bd__sec" aria-label={t('badge.exp.title')}>
        <h2 class="sf-bd__h">{t('badge.exp.title')}</h2>
        <p class="sf-bd__note">{result.experience.overall == null ? t('badge.exp.none') : t('badge.exp.overall', { tier: tierName(result.experience.overall) })}</p>
        <p class="sf-bd__note">{t('badge.exp.explain')}</p>
      </section>

      {confirm.length > 0 && (
        <section class="sf-bd__sec" aria-label={t('badge.confirm.title')}>
          <h2 class="sf-bd__h">{t('badge.confirm.title')}</h2>
          <p class="sf-bd__note">{t('badge.confirm.body', { n: confirm.length })}</p>
          <Button variant="secondary" onPress={async () => { await confirmSets(confirm); read(); }}>{t('badge.confirm.yes')}</Button>
        </section>
      )}

      <p class="sf-bd__note">{t('badge.limits')}</p>

      <MuscleSheet state={state} result={result} id={picked} layer={layer} onClose={() => setPicked(null)} onWeak={() => { const id = picked; setPicked(null); if (id) navigate(`/muscle/${id}`); }} />
    </div>
  );
}

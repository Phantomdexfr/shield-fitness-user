import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t } from '../../i18n';
import { Button, SubPageHeader, Toggle } from '../../ui/components';
import { getProfile, latestBodyweight, saveProfile, type BadgeProfile } from '../../data/repos/badges';
import { ProfileForm } from './ProfileForm';
import { goBack } from '../../app/navBack';

/** `/settings/badges`: sex, bodyweight, and the switch that hides badges. A sub-page, like every settings screen. */
export default function BadgesSettingsPage() {
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<BadgeProfile | null>(null);
  const [kg, setKg] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([getProfile(), latestBodyweight()]).then(([p, w]) => {
      if (!live) return;
      setProfile(p);
      setKg(w);
    }, () => undefined);
    return () => { live = false; };
  }, [tick]);

  const head = <SubPageHeader title={t('page.badges_settings.title')} onBack={() => goBack(navigate, '/profile/muscles')} backLabel={t('sm.back')} />;
  if (!profile) return <div class="sf-bd">{head}<p class="sf-bd__note" role="status">{t('badge.loading')}</p></div>;

  return (
    <div class="sf-bd">
      {head}
      <Toggle
        checked={!profile.skipped}
        label={t('badge.set.show')}
        hint={t('badge.set.show_hint')}
        onChange={async (on) => { await saveProfile({ ...profile, skipped: !on }); setTick(tick + 1); }}
      />
      <ProfileForm key={`${profile.sex}-${kg}-${tick}`} initialSex={profile.sex} initialKg={kg} firstRun={false} onDone={() => { setSaved(true); setTick(tick + 1); }} />
      {saved && <p class="sf-bd__note" role="status">{t('badge.set.saved')}</p>}
      <Button variant="ghost" onPress={() => navigate('/profile/muscles')}>{t('badge.set.open')}</Button>
      <p class="sf-bd__note">{t('badge.limits')}</p>
    </div>
  );
}

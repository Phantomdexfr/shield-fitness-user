// Phase 98: the Premium icon for each page row (ux.icons ON). The classic icon of each row stays where it always was
// (ME_LINKS, GROUPS, MORE_GROUPS, the gym rows) and is used when ux.icons is OFF. One icon per page: no two pages share a picture.
import type { IconName } from './generated';

export const PREMIUM_ICON: Readonly<Record<string, IconName>> = {
  // Me tab (ME_LINKS keys)
  'me.history': 'clock-counter-clockwise',
  'me.progress': 'chart-line-up',
  'me.records': 'trophy',
  'me.recap': 'calendar-star',
  'me.photos': 'camera',
  'me.goals': 'target',
  'me.intake': 'drop',
  'me.badges': 'medal',
  'me.gym': 'buildings',
  'me.settings': 'gear',
  // Settings hub (group slugs)
  'settings.account': 'user-circle',
  'settings.training': 'barbell',
  'settings.workout-flow': 'list-checks',
  'settings.body': 'person-simple',
  'settings.appearance': 'palette',
  'settings.mode': 'sliders-horizontal',
  'settings.data': 'database',
  'settings.privacy': 'shield-check',
  'settings.reminders': 'bell',
  'settings.gym': 'plugs-connected',
  'settings.about': 'info',
  'settings.credits': 'heart',
  // Gym area (GymHomePage rows)
  'gym.membership': 'identification-card',
  'gym.qr': 'qr-code',
  'gym.attendance': 'calendar-check',
  'gym.inbox': 'envelope-simple',
  'gym.requests': 'chat-circle-text',
  'gym.restore': 'cloud-arrow-down',
};

export const premiumIconFor = (id: string, classic: IconName): IconName => PREMIUM_ICON[id] ?? classic;

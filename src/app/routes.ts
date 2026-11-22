import type { ComponentType } from 'preact';
import { h } from 'preact';
import { Placeholder } from '../pages/Placeholder';
import { lazyPage } from './lazyPage';
import type { IconName } from '../ui/components';
import type { StringKey } from '../i18n';

export type TabId = 'today' | 'body' | 'train' | 'library' | 'me';

export interface RouteDef {
  /** Unique id. */
  id: string;
  /** wouter path pattern, relative to the base path. Slugs are lowercase. */
  path: string;
  /** Key in contract/features.catalogue.json, or null for core screens that are never switched off. */
  feature: string | null;
  component: ComponentType<{ params: Record<string, string> }>;
  /** Which bottom tab is highlighted on this route. */
  tab?: TabId;
  /** Only registered in dev builds. */
  devOnly?: boolean;
}

export interface TabDef {
  id: TabId;
  path: string;
  icon: IconName;
  labelKey: StringKey;
}

export const TABS: readonly TabDef[] = [
  { id: 'today', path: '/', icon: 'house', labelKey: 'tab.today' },
  { id: 'body', path: '/body', icon: 'person-simple', labelKey: 'tab.body' },
  { id: 'train', path: '/train', icon: 'barbell', labelKey: 'tab.train' },
  { id: 'library', path: '/library', icon: 'books', labelKey: 'tab.library' },
  { id: 'me', path: '/me', icon: 'user-circle', labelKey: 'tab.me' },
];

const screen = (titleKey: StringKey, param?: string) => (p: { params: Record<string, string> }) =>
  h(Placeholder, { titleKey, param: param ? p.params[param] : undefined });

const MuscleLab = lazyPage(() => import('../pages/body/MuscleLab'));
const MusclePage = lazyPage(() => import('../pages/body/MusclePage'));
const RecoveryPage = lazyPage(() => import('../pages/body/RecoveryPage'));
const MarksPage = lazyPage(() => import('../pages/body/MarksPage'));
const HeatmapPage = lazyPage(() => import('../pages/heatmap/HeatmapPage'));
const AtlasPage = lazyPage(() => import('../pages/atlas/AtlasPage'));
const BadgesPage = lazyPage(() => import('../pages/badges/BadgesPage'));
const BadgesSettingsPage = lazyPage(() => import('../pages/badges/BadgesSettingsPage'));
const LibraryPage = lazyPage(() => import('../pages/library/LibraryPage'));
const ExercisePage = lazyPage(() => import('../pages/exercise/ExercisePage'));
const MachinePage = lazyPage(() => import('../pages/exercise/MachinePage'));
const MachineIndexPage = lazyPage(() => import('../pages/machines/MachineIndexPage'));
const MachineLabPage = lazyPage(() => import('../pages/machines/MachineLabPage'));
const NewExercisePage = lazyPage(() => import('../pages/library/NewExercisePage'));
const RoutinesPage = lazyPage(() => import('../pages/routines/RoutinesPage'));
const RoutineSetupPage = lazyPage(() => import('../pages/routines/RoutineSetupPage'));
const RoutineWeekPage = lazyPage(() => import('../pages/routines/RoutineWeekPage'));
const RoutineDayPage = lazyPage(() => import('../pages/routines/RoutineDayPage'));
const ScheduleEditPage = lazyPage(() => import('../pages/routines/ScheduleEditPage'));
const IntakePage = lazyPage(() => import('../pages/intake/IntakePage'));
const ScanPage = lazyPage(() => import('../pages/intake/ScanPage'));
const PhotosPage = lazyPage(() => import('../pages/progress/PhotosPage'));
const TrainPage = lazyPage(() => import('../pages/session/TrainPage'));
const SessionPage = lazyPage(() => import('../pages/session/SessionPage'));
const QuickWorkoutPage = lazyPage(() => import('../pages/routines/QuickWorkoutPage'));
const TodayPage = lazyPage(() => import('../pages/today/TodayPage'));
const ScheduleSettingsPage = lazyPage(() => import('../pages/settings/ScheduleSettingsPage'));
const ProgressHub = lazyPage(() => import('../pages/progress/ProgressHub'));
const ExerciseProgress = lazyPage(() => import('../pages/progress/ExerciseProgress'));
const BodyPage = lazyPage(() => import('../pages/progress/BodyPage'));
const GoalsPage = lazyPage(() => import('../pages/progress/GoalsPage'));
const RecapPage = lazyPage(() => import('../pages/recap/RecapPage'));
const RecordsPage = lazyPage(() => import('../pages/progress/RecordsPage'));
const HistoryPage = lazyPage(() => import('../pages/history/HistoryPage'));
const SessionViewPage = lazyPage(() => import('../pages/history/SessionViewPage'));
const ReceivePage = lazyPage(() => import('../pages/share/ReceivePage'));
const MePage = lazyPage(() => import('../pages/MePage'));
const SettingsHub = lazyPage(() => import('../pages/settings/SettingsHub'));
const WelcomePage = lazyPage(() => import('../pages/welcome/WelcomePage'));
const SettingsGroupPage = lazyPage(() => import('../pages/settings/SettingsGroupPage'));
const PrivacyPage = lazyPage(() => import('../pages/settings/PrivacyPage'));
const DataPage = lazyPage(() => import('../pages/settings/DataPage'));
const RemindersPage = lazyPage(() => import('../pages/settings/RemindersPage'));
const GymPage = lazyPage(() => import('../pages/settings/GymPage'));
const GymAddPage = lazyPage(() => import('../pages/settings/GymAddPage'));
const GymConfirmPage = lazyPage(() => import('../pages/settings/GymConfirmPage'));
const GymConnectPage = lazyPage(() => import('../pages/settings/GymConnectPage'));
const GymSignInPage = lazyPage(() => import('../pages/settings/GymSignInPage'));
const GymPasswordPage = lazyPage(() => import('../pages/settings/GymPasswordPage'));
const GymDisconnectPage = lazyPage(() => import('../pages/settings/GymDisconnectPage'));
const GymSyncPage = lazyPage(() => import('../pages/settings/GymSyncPage'));
const GymUploadPage = lazyPage(() => import('../pages/settings/GymUploadPage'));
const gymPage = (pick: 'GymHomePage' | 'GymMembershipPage' | 'GymQrPage' | 'GymAttendancePage' | 'GymInboxPage' | 'GymRequestsPage') =>
  lazyPage(() => import('../pages/gym/GymPages').then((m) => ({ default: m[pick] })));
const GymRestore = lazyPage(() => import('../pages/gym/RestorePage'));
const BackupRestore = lazyPage(() => import('../pages/settings/BackupRestorePage'));
const BackupHome = lazyPage(() => import('../pages/settings/BackupHomePage'));
const BackupConsent = lazyPage(() => import('../pages/settings/BackupConsentPage'));
const BackupPassword = lazyPage(() => import('../pages/settings/BackupPasswordPage'));
const BackupSignIn = lazyPage(() => import('../pages/settings/BackupSignInPage'));
const BackupQuestions = lazyPage(() => import('../pages/settings/BackupQuestionsPage'));
const BackupForgot = lazyPage(() => import('../pages/settings/BackupForgotPage'));
const BackupForgotStatus = lazyPage(() => import('../pages/settings/BackupForgotStatusPage'));
const BackupForgotRedeem = lazyPage(() => import('../pages/settings/BackupForgotRedeemPage'));
const BackupDelete = lazyPage(() => import('../pages/settings/BackupDeletePage'));
const BackupSwitch = lazyPage(() => import('../pages/settings/BackupSwitchPage'));
const GymHome = gymPage('GymHomePage');
const GymMembership = gymPage('GymMembershipPage');
const GymQr = gymPage('GymQrPage');
const GymAttendance = gymPage('GymAttendancePage');
const GymInbox = gymPage('GymInboxPage');
const GymRequests = gymPage('GymRequestsPage');
const AboutPage = lazyPage(() => import('../pages/settings/AboutPage'));
const CreditsPage = lazyPage(() => import('../pages/settings/CreditsPage'));
const DesignPreview = lazyPage(() => import('../pages/dev/DesignPreview'));

/** The route registry. Every addressable screen is listed here once. */
export const ROUTES: readonly RouteDef[] = [
  { id: 'today', path: '/', feature: null, tab: 'today', component: () => h(TodayPage, {}) },
  { id: 'body', path: '/body', feature: null, tab: 'body', component: () => h(MuscleLab, {}) },
  { id: 'train', path: '/train', feature: null, tab: 'train', component: () => h(TrainPage, {}) },
  { id: 'session', path: '/session/:id', feature: 'flexible_session', tab: 'train', component: () => h(SessionPage, {}) },
  { id: 'session-summary', path: '/session/:id/summary', feature: 'flexible_session', tab: 'train', component: () => h(SessionViewPage, {}) },
  { id: 'history', path: '/history', feature: 'flexible_session', tab: 'train', component: () => h(HistoryPage, {}) },
  { id: 'history-session', path: '/history/:id', feature: 'flexible_session', tab: 'train', component: () => h(SessionViewPage, {}) },
  { id: 'library', path: '/library', feature: null, tab: 'library', component: () => h(LibraryPage, {}) },
  { id: 'me', path: '/me', feature: null, tab: 'me', component: () => h(MePage, {}) },
  { id: 'exercise', path: '/exercise/:slug', feature: null, tab: 'library', component: () => h(ExercisePage, {}) },
  { id: 'library-new', path: '/library/new', feature: 'custom_exercises', tab: 'library', component: () => h(NewExercisePage, {}) },
  { id: 'exercise-edit', path: '/exercise/:slug/edit', feature: 'custom_exercises', tab: 'library', component: () => h(NewExercisePage, {}) },
  { id: 'machine', path: '/machine/:slug', feature: null, tab: 'library', component: () => h(MachinePage, {}) },
  { id: 'machines', path: '/machines', feature: 'machine_lab', tab: 'library', component: () => h(MachineIndexPage, {}) },
  { id: 'machine-lab', path: '/machines/:slug/lab', feature: 'machine_lab', tab: 'library', component: () => h(MachineLabPage, {}) },
  { id: 'routines', path: '/routines', feature: 'routine_builder', tab: 'train', component: () => h(RoutinesPage, {}) },
  { id: 'routine-new', path: '/routine/new', feature: 'routine_builder', tab: 'train', component: () => h(RoutineSetupPage, {}) },
  { id: 'routine', path: '/routine/:id', feature: 'routine_builder', tab: 'train', component: () => h(RoutineWeekPage, {}) },
  { id: 'routine-day', path: '/routine/:id/day/:dayId', feature: 'routine_builder', tab: 'train', component: () => h(RoutineDayPage, {}) },
  { id: 'quick-workout', path: '/quick', feature: 'quick_workout', tab: 'train', component: () => h(QuickWorkoutPage, {}) },
  { id: 'routine-schedule', path: '/routine/:id/schedule', feature: 'rest_scheduler', tab: 'train', component: () => h(ScheduleEditPage, {}) },
  { id: 'welcome', path: '/welcome', feature: null, component: () => h(WelcomePage, {}) },
  { id: 'settings', path: '/settings', feature: null, tab: 'me', component: () => h(SettingsHub, {}) },
  { id: 'settings-account', path: '/settings/account', feature: null, tab: 'me', component: () => h(SettingsGroupPage, {}) },
  { id: 'settings-training', path: '/settings/training', feature: null, tab: 'me', component: () => h(SettingsGroupPage, {}) },
  { id: 'settings-workout-flow', path: '/settings/workout-flow', feature: null, tab: 'me', component: () => h(SettingsGroupPage, {}) },
  { id: 'settings-body', path: '/settings/body', feature: null, tab: 'me', component: () => h(SettingsGroupPage, {}) },
  { id: 'settings-appearance', path: '/settings/appearance', feature: null, tab: 'me', component: () => h(SettingsGroupPage, {}) },
  { id: 'settings-mode', path: '/settings/mode', feature: null, tab: 'me', component: () => h(SettingsGroupPage, {}) },
  { id: 'settings-schedule', path: '/settings/schedule', feature: 'rest_scheduler', tab: 'me', component: () => h(ScheduleSettingsPage, {}) },
  { id: 'share', path: '/share', feature: 'plan_share', tab: 'train', component: () => h(ReceivePage, {}) },
  { id: 'settings-privacy', path: '/settings/privacy', feature: null, tab: 'me', component: () => h(PrivacyPage, {}) },
  { id: 'settings-data', path: '/settings/data', feature: null, tab: 'me', component: () => h(DataPage, {}) },
  { id: 'settings-reminders', path: '/settings/reminders', feature: null, tab: 'me', component: () => h(RemindersPage, {}) },
  { id: 'settings-gym', path: '/settings/gym', feature: null, tab: 'me', component: () => h(GymPage, {}) },
  { id: 'settings-gym-add', path: '/settings/gym/add', feature: null, tab: 'me', component: () => h(GymAddPage, {}) },
  { id: 'settings-gym-confirm', path: '/settings/gym/confirm', feature: null, tab: 'me', component: () => h(GymConfirmPage, {}) },
  { id: 'settings-gym-signin', path: '/settings/gym/signin', feature: null, tab: 'me', component: () => h(GymSignInPage, {}) },
  { id: 'settings-gym-password', path: '/settings/gym/password', feature: null, tab: 'me', component: () => h(GymPasswordPage, {}) },
  { id: 'settings-gym-disconnect', path: '/settings/gym/disconnect', feature: null, tab: 'me', component: () => h(GymDisconnectPage, {}) },
  { id: 'settings-gym-upload', path: '/settings/gym/upload', feature: null, tab: 'me', component: () => h(GymUploadPage, {}) },
  { id: 'settings-gym-sync', path: '/settings/gym/sync', feature: null, tab: 'me', component: () => h(GymSyncPage, {}) },
  { id: 'settings-backup', path: '/settings/backup', feature: 'cloud_backup', tab: 'me', component: () => h(BackupHome, {}) },
  { id: 'settings-backup-consent', path: '/settings/backup/consent', feature: 'free_account', tab: 'me', component: () => h(BackupConsent, {}) },
  { id: 'settings-backup-password', path: '/settings/backup/password', feature: 'free_account', tab: 'me', component: () => h(BackupPassword, {}) },
  { id: 'settings-backup-signin', path: '/settings/backup/signin', feature: 'free_account', tab: 'me', component: () => h(BackupSignIn, {}) },
  { id: 'settings-backup-questions', path: '/settings/backup/questions', feature: 'free_account', tab: 'me', component: () => h(BackupQuestions, {}) },
  { id: 'settings-backup-forgot', path: '/settings/backup/forgot', feature: 'free_account', tab: 'me', component: () => h(BackupForgot, {}) },
  { id: 'settings-backup-forgot-status', path: '/settings/backup/forgot/status', feature: 'free_account', tab: 'me', component: () => h(BackupForgotStatus, {}) },
  { id: 'settings-backup-forgot-redeem', path: '/settings/backup/forgot/redeem', feature: 'free_account', tab: 'me', component: () => h(BackupForgotRedeem, {}) },
  { id: 'settings-backup-delete', path: '/settings/backup/delete', feature: 'cloud_backup', tab: 'me', component: () => h(BackupDelete, {}) },
  { id: 'settings-backup-switch', path: '/settings/backup/switch', feature: 'free_account', tab: 'me', component: () => h(BackupSwitch, {}) },
  { id: 'settings-backup-restore', path: '/settings/backup/restore', feature: 'cloud_backup', tab: 'me', component: () => h(BackupRestore, {}) },
  { id: 'gym-restore', path: '/gym/restore', feature: null, tab: 'me', component: () => h(GymRestore, {}) },
  { id: 'gym-home', path: '/gym', feature: null, tab: 'me', component: () => h(GymHome, {}) },
  { id: 'gym-membership', path: '/gym/membership', feature: 'membership', tab: 'me', component: () => h(GymMembership, {}) },
  { id: 'gym-qr', path: '/gym/qr', feature: 'attendance_qr', tab: 'me', component: () => h(GymQr, {}) },
  { id: 'gym-attendance', path: '/gym/attendance', feature: 'attendance_qr', tab: 'me', component: () => h(GymAttendance, {}) },
  { id: 'gym-inbox', path: '/gym/inbox', feature: 'inbox', tab: 'me', component: () => h(GymInbox, {}) },
  { id: 'gym-requests', path: '/gym/requests', feature: 'requests', tab: 'me', component: () => h(GymRequests, {}) },
  { id: 'gym-connect', path: '/connect', feature: null, tab: 'me', component: () => h(GymConnectPage, {}) },
  { id: 'settings-about', path: '/settings/about', feature: null, tab: 'me', component: () => h(AboutPage, {}) },
  { id: 'settings-credits', path: '/settings/credits', feature: null, tab: 'me', component: () => h(CreditsPage, {}) },
  { id: 'progress', path: '/progress', feature: 'progress_charts', tab: 'me', component: () => h(ProgressHub, {}) },
  { id: 'progress-exercise', path: '/progress/exercise/:slug', feature: 'progress_charts', tab: 'me', component: () => h(ExerciseProgress, {}) },
  { id: 'progress-body', path: '/progress/body', feature: 'body_stats', tab: 'me', component: () => h(BodyPage, {}) },
  { id: 'goals', path: '/goals', feature: 'goals', tab: 'me', component: () => h(GoalsPage, {}) },
  { id: 'intake', path: '/intake', feature: 'intake', tab: 'me', component: () => h(IntakePage, {}) },
  { id: 'intake-scan', path: '/intake/scan', feature: 'barcode_scan', tab: 'me', component: () => h(ScanPage, {}) },
  { id: 'progress-photos', path: '/progress/photos', feature: 'progress_photos', tab: 'me', component: () => h(PhotosPage, {}) },
  { id: 'records', path: '/progress/records', feature: 'pr_board', tab: 'me', component: () => h(RecordsPage, {}) },
  { id: 'recap', path: '/progress/recap', feature: 'year_review', tab: 'me', component: () => h(RecapPage, {}) },
  { id: 'body-recovery', path: '/body/recovery', feature: 'recovery_clock', tab: 'body', component: () => h(RecoveryPage, {}) },
  { id: 'body-marks', path: '/body/marks', feature: 'injury_marks', tab: 'body', component: () => h(MarksPage, {}) },
  { id: 'atlas', path: '/atlas', feature: 'holo_atlas', tab: 'body', component: () => h(AtlasPage, {}) },
  { id: 'heatmap', path: '/heatmap', feature: 'heatmap', tab: 'body', component: () => h(HeatmapPage, {}) },
  { id: 'muscle-badges', path: '/profile/muscles', feature: 'muscle_badges', tab: 'me', component: () => h(BadgesPage, {}) },
  { id: 'settings-badges', path: '/settings/badges', feature: 'muscle_badges', tab: 'me', component: () => h(BadgesSettingsPage, {}) },
  { id: 'muscle', path: '/muscle/:id', feature: 'muscle_lab', tab: 'body', component: () => h(MusclePage, {}) },
  { id: 'design-preview', path: '/dev/design-preview', feature: null, devOnly: true, component: () => h(DesignPreview, {}) },
];

/** Routes active in this build (dev-only routes are dropped from production). */
export function activeRoutes(isDev: boolean): RouteDef[] {
  return ROUTES.filter((r) => isDev || !r.devOnly);
}

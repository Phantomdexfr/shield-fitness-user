// Phase 117: page tips. A small "i" button on each main page opens a short explanation of that page. One switch, app-wide.
// Pure rules only (no DOM, no storage): which page has a tip, and whether tips are on.
import type { StringKey } from '../i18n';

export interface PageTip {
  id: string;
  /** A route pattern as in `src/app/routes.ts` (`:name` = one segment). */
  path: string;
  titleKey: StringKey;
  bodyKey: StringKey;
}

export const PAGE_TIPS: readonly PageTip[] = [
  { id: 'today', path: '/', titleKey: 'tips.today.title', bodyKey: 'tips.today.body' },
  { id: 'train', path: '/train', titleKey: 'tips.train.title', bodyKey: 'tips.train.body' },
  { id: 'session', path: '/session/:id', titleKey: 'tips.session.title', bodyKey: 'tips.session.body' },
  { id: 'summary', path: '/session/:id/summary', titleKey: 'tips.summary.title', bodyKey: 'tips.summary.body' },
  { id: 'history', path: '/history', titleKey: 'tips.history.title', bodyKey: 'tips.history.body' },
  { id: 'historysession', path: '/history/:id', titleKey: 'tips.historysession.title', bodyKey: 'tips.historysession.body' },
  { id: 'routines', path: '/routines', titleKey: 'tips.routines.title', bodyKey: 'tips.routines.body' },
  { id: 'routinenew', path: '/routine/new', titleKey: 'tips.routinenew.title', bodyKey: 'tips.routinenew.body' },
  { id: 'routine', path: '/routine/:id', titleKey: 'tips.routine.title', bodyKey: 'tips.routine.body' },
  { id: 'routineday', path: '/routine/:id/day/:dayId', titleKey: 'tips.routineday.title', bodyKey: 'tips.routineday.body' },
  { id: 'routineschedule', path: '/routine/:id/schedule', titleKey: 'tips.routineschedule.title', bodyKey: 'tips.routineschedule.body' },
  { id: 'quick', path: '/quick', titleKey: 'tips.quick.title', bodyKey: 'tips.quick.body' },
  { id: 'share', path: '/share', titleKey: 'tips.share.title', bodyKey: 'tips.share.body' },
  { id: 'library', path: '/library', titleKey: 'tips.library.title', bodyKey: 'tips.library.body' },
  { id: 'exercise', path: '/exercise/:slug', titleKey: 'tips.exercise.title', bodyKey: 'tips.exercise.body' },
  { id: 'libnew', path: '/library/new', titleKey: 'tips.libnew.title', bodyKey: 'tips.libnew.body' },
  { id: 'exedit', path: '/exercise/:slug/edit', titleKey: 'tips.exedit.title', bodyKey: 'tips.exedit.body' },
  { id: 'machine', path: '/machine/:slug', titleKey: 'tips.machine.title', bodyKey: 'tips.machine.body' },
  { id: 'machines', path: '/machines', titleKey: 'tips.machines.title', bodyKey: 'tips.machines.body' },
  { id: 'machinelab', path: '/machines/:slug/lab', titleKey: 'tips.machinelab.title', bodyKey: 'tips.machinelab.body' },
  { id: 'body', path: '/body', titleKey: 'tips.body.title', bodyKey: 'tips.body.body' },
  { id: 'recovery', path: '/body/recovery', titleKey: 'tips.recovery.title', bodyKey: 'tips.recovery.body' },
  { id: 'marks', path: '/body/marks', titleKey: 'tips.marks.title', bodyKey: 'tips.marks.body' },
  { id: 'atlas', path: '/atlas', titleKey: 'tips.atlas.title', bodyKey: 'tips.atlas.body' },
  { id: 'anatomy', path: '/anatomy', titleKey: 'tips.anatomy.title', bodyKey: 'tips.anatomy.body' },
  { id: 'heatmap', path: '/heatmap', titleKey: 'tips.heatmap.title', bodyKey: 'tips.heatmap.body' },
  { id: 'muscle', path: '/muscle/:id', titleKey: 'tips.muscle.title', bodyKey: 'tips.muscle.body' },
  { id: 'me', path: '/me', titleKey: 'tips.me.title', bodyKey: 'tips.me.body' },
  { id: 'progress', path: '/progress', titleKey: 'tips.progress.title', bodyKey: 'tips.progress.body' },
  { id: 'progressex', path: '/progress/exercise/:slug', titleKey: 'tips.progressex.title', bodyKey: 'tips.progressex.body' },
  { id: 'progressbody', path: '/progress/body', titleKey: 'tips.progressbody.title', bodyKey: 'tips.progressbody.body' },
  { id: 'goals', path: '/goals', titleKey: 'tips.goals.title', bodyKey: 'tips.goals.body' },
  { id: 'intake', path: '/intake', titleKey: 'tips.intake.title', bodyKey: 'tips.intake.body' },
  { id: 'scan', path: '/intake/scan', titleKey: 'tips.scan.title', bodyKey: 'tips.scan.body' },
  { id: 'photos', path: '/progress/photos', titleKey: 'tips.photos.title', bodyKey: 'tips.photos.body' },
  { id: 'records', path: '/progress/records', titleKey: 'tips.records.title', bodyKey: 'tips.records.body' },
  { id: 'recap', path: '/progress/recap', titleKey: 'tips.recap.title', bodyKey: 'tips.recap.body' },
  { id: 'badges', path: '/profile/muscles', titleKey: 'tips.badges.title', bodyKey: 'tips.badges.body' },
  { id: 'badgesettings', path: '/settings/badges', titleKey: 'tips.badgesettings.title', bodyKey: 'tips.badgesettings.body' },
  { id: 'settings', path: '/settings', titleKey: 'tips.settings.title', bodyKey: 'tips.settings.body' },
  { id: 'setaccount', path: '/settings/account', titleKey: 'tips.setaccount.title', bodyKey: 'tips.setaccount.body' },
  { id: 'settraining', path: '/settings/training', titleKey: 'tips.settraining.title', bodyKey: 'tips.settraining.body' },
  { id: 'setflow', path: '/settings/workout-flow', titleKey: 'tips.setflow.title', bodyKey: 'tips.setflow.body' },
  { id: 'setbody', path: '/settings/body', titleKey: 'tips.setbody.title', bodyKey: 'tips.setbody.body' },
  { id: 'setappearance', path: '/settings/appearance', titleKey: 'tips.setappearance.title', bodyKey: 'tips.setappearance.body' },
  { id: 'setmode', path: '/settings/mode', titleKey: 'tips.setmode.title', bodyKey: 'tips.setmode.body' },
  { id: 'setschedule', path: '/settings/schedule', titleKey: 'tips.setschedule.title', bodyKey: 'tips.setschedule.body' },
  { id: 'setprivacy', path: '/settings/privacy', titleKey: 'tips.setprivacy.title', bodyKey: 'tips.setprivacy.body' },
  { id: 'setdata', path: '/settings/data', titleKey: 'tips.setdata.title', bodyKey: 'tips.setdata.body' },
  { id: 'setreminders', path: '/settings/reminders', titleKey: 'tips.setreminders.title', bodyKey: 'tips.setreminders.body' },
  { id: 'setabout', path: '/settings/about', titleKey: 'tips.setabout.title', bodyKey: 'tips.setabout.body' },
  { id: 'setcredits', path: '/settings/credits', titleKey: 'tips.setcredits.title', bodyKey: 'tips.setcredits.body' },
  { id: 'gymsettings', path: '/settings/gym', titleKey: 'tips.gymsettings.title', bodyKey: 'tips.gymsettings.body' },
  { id: 'gymadd', path: '/settings/gym/add', titleKey: 'tips.gymadd.title', bodyKey: 'tips.gymadd.body' },
  { id: 'gymconfirm', path: '/settings/gym/confirm', titleKey: 'tips.gymconfirm.title', bodyKey: 'tips.gymconfirm.body' },
  { id: 'gymconnect', path: '/connect', titleKey: 'tips.gymconnect.title', bodyKey: 'tips.gymconnect.body' },
  { id: 'gymsignin', path: '/settings/gym/signin', titleKey: 'tips.gymsignin.title', bodyKey: 'tips.gymsignin.body' },
  { id: 'gympassword', path: '/settings/gym/password', titleKey: 'tips.gympassword.title', bodyKey: 'tips.gympassword.body' },
  { id: 'gymdisconnect', path: '/settings/gym/disconnect', titleKey: 'tips.gymdisconnect.title', bodyKey: 'tips.gymdisconnect.body' },
  { id: 'gymupload', path: '/settings/gym/upload', titleKey: 'tips.gymupload.title', bodyKey: 'tips.gymupload.body' },
  { id: 'gymsync', path: '/settings/gym/sync', titleKey: 'tips.gymsync.title', bodyKey: 'tips.gymsync.body' },
  { id: 'gymrestore', path: '/gym/restore', titleKey: 'tips.gymrestore.title', bodyKey: 'tips.gymrestore.body' },
  { id: 'gymrestore', path: '/settings/backup/restore', titleKey: 'tips.gymrestore.title', bodyKey: 'tips.gymrestore.body' },
  { id: 'gymhome', path: '/gym', titleKey: 'tips.gymhome.title', bodyKey: 'tips.gymhome.body' },
  { id: 'gymmembership', path: '/gym/membership', titleKey: 'tips.gymmembership.title', bodyKey: 'tips.gymmembership.body' },
  { id: 'gymqr', path: '/gym/qr', titleKey: 'tips.gymqr.title', bodyKey: 'tips.gymqr.body' },
  { id: 'gymattendance', path: '/gym/attendance', titleKey: 'tips.gymattendance.title', bodyKey: 'tips.gymattendance.body' },
  { id: 'gyminbox', path: '/gym/inbox', titleKey: 'tips.gyminbox.title', bodyKey: 'tips.gyminbox.body' },
  { id: 'gymrequests', path: '/gym/requests', titleKey: 'tips.gymrequests.title', bodyKey: 'tips.gymrequests.body' },
  { id: 'backup', path: '/settings/backup', titleKey: 'tips.backup.title', bodyKey: 'tips.backup.body' },
  { id: 'backupconsent', path: '/settings/backup/consent', titleKey: 'tips.backupconsent.title', bodyKey: 'tips.backupconsent.body' },
  { id: 'backuppassword', path: '/settings/backup/password', titleKey: 'tips.backuppassword.title', bodyKey: 'tips.backuppassword.body' },
  { id: 'backupsignin', path: '/settings/backup/signin', titleKey: 'tips.backupsignin.title', bodyKey: 'tips.backupsignin.body' },
  { id: 'backupquestions', path: '/settings/backup/questions', titleKey: 'tips.backupquestions.title', bodyKey: 'tips.backupquestions.body' },
  { id: 'backupforgot', path: '/settings/backup/forgot', titleKey: 'tips.backupforgot.title', bodyKey: 'tips.backupforgot.body' },
  { id: 'backupstatus', path: '/settings/backup/forgot/status', titleKey: 'tips.backupstatus.title', bodyKey: 'tips.backupstatus.body' },
  { id: 'backupredeem', path: '/settings/backup/forgot/redeem', titleKey: 'tips.backupredeem.title', bodyKey: 'tips.backupredeem.body' },
  { id: 'backupdelete', path: '/settings/backup/delete', titleKey: 'tips.backupdelete.title', bodyKey: 'tips.backupdelete.body' },
  { id: 'backupswitch', path: '/settings/backup/switch', titleKey: 'tips.backupswitch.title', bodyKey: 'tips.backupswitch.body' },
];

/** Does `pattern` (`/exercise/:slug/edit`) match `path`? A `:name` segment matches exactly one segment. */
export function pathMatches(pattern: string, path: string): boolean {
  const a = pattern.split('/');
  const b = path.split('/');
  return a.length === b.length && a.every((seg, i) => (seg.startsWith(':') ? (b[i] ?? '').length > 0 : seg === b[i]));
}

/** The tip for a page, or undefined (the install gate and onboarding have none). Exact patterns first, so `/routine/new` wins over `/routine/:id`. */
export function tipForPath(path: string): PageTip | undefined {
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const hits = PAGE_TIPS.filter((p) => pathMatches(p.path, clean));
  return hits.find((p) => !p.path.includes(':')) ?? hits[0];
}

/** Stored row `tips` = { v: 1, on: boolean }. Anything else reads as "never chosen". */
export interface TipsRecord {
  v: 1;
  on: boolean;
}
export const parseTips = (raw: unknown): TipsRecord | null =>
  raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).on === 'boolean' ? { v: 1, on: (raw as { on: boolean }).on } : null;

/**
 * Are page tips on? A choice the person made always wins. With no choice yet: ON for a brand-new install (the tour record says `auto: true`),
 * OFF for an install that existed before this feature (no unprompted change; they can switch it on in Settings -> Appearance).
 */
export function tipsEnabled(row: TipsRecord | null, tourAuto: boolean): boolean {
  return row ? row.on : tourAuto;
}

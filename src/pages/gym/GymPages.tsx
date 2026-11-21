import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { t, type StringKey } from '../../i18n';
import { Button, Icon, SubPageHeader } from '../../ui/components';
import { QrSvg } from '../share/qr';
import { istDayKey } from '../../shared/dates';
import {
  REQUEST_KINDS,
  attendanceSummary,
  canOpenRequest,
  encodeMemberQr,
  membershipView,
  monthGrid,
  pickMembership,
  unreadCount,
  type RequestKind,
} from '../../shared/gymData';
import { getLastVerdict, istTime, markRead, refreshGymNow, submitRequest, useConnection, useGymData } from '../../data/repos/gymLink';
import type { GymData } from '../../data/repos/gymLink';
import { resolveFeature } from '../../app/flags';
import { SyncChip } from '../settings/SyncChip';

const today = (): string => istDayKey(Date.now());
const niceDate = (key: string): string => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Wraps a gym screen: standalone and signed-out states, the forced-password redirect, and the header. */
function GymFrame({ title, back, children }: { title: string; back: string; children: (d: GymData) => preact.ComponentChildren }) {
  const [, navigate] = useLocation();
  const { conn } = useConnection();
  const data = useGymData();
  useEffect(() => {
    if (conn?.mustChangePassword) navigate('/settings/gym/password', { replace: true });
  }, [conn]);
  return (
    <section class="sf-page-body sf-st">
      <SubPageHeader title={title} onBack={() => navigate(back)} />
      {conn === undefined ? (
        <p role="status">{t('page.loading')}</p>
      ) : conn === null ? (
        <div class="sf-st__row">
          <p class="sf-st__para">{t('gd.standalone')}</p>
          <Button variant="secondary" onPress={() => navigate('/settings/gym/add')}>{t('gd.connect')}</Button>
        </div>
      ) : !conn.signedIn && !data.memberCode && data.fetchedAt === null ? (
        <div class="sf-st__row">
          <p class="sf-st__para">{t('gd.signin')}</p>
          <Button onPress={() => navigate('/settings/gym/signin')}>{t('gd.signin.go')}</Button>
        </div>
      ) : (
        children(data)
      )}
    </section>
  );
}

function Updated({ at }: { at: number | null }) {
  return <p class="sf-st__hint">{at === null ? t('gd.never') : t('gd.updated', { time: istTime(at) })}</p>;
}

/** /gym: one row per feature the gym has on, with the unread count. */
export function GymHomePage() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const rows: { to: string; key: StringKey; icon: 'check' | 'info' | 'plus-square' | 'user-circle'; feature: string }[] = [
    { to: '/gym/membership', key: 'gd.mem', icon: 'user-circle', feature: 'membership' },
    { to: '/gym/qr', key: 'gd.qr', icon: 'check', feature: 'attendance_qr' },
    { to: '/gym/attendance', key: 'gd.att', icon: 'check', feature: 'attendance_qr' },
    { to: '/gym/inbox', key: 'gd.inbox', icon: 'info', feature: 'inbox' },
    { to: '/gym/requests', key: 'gd.req', icon: 'plus-square', feature: 'requests' },
  ];
  return (
    <GymFrame title={t('gd.title')} back="/me">
      {(d) => (
        <>
          <div class="sf-st__row">
            <SyncChip />
            <Updated at={d.fetchedAt} />
            <Button variant="secondary" disabled={busy} onPress={() => { setBusy(true); void refreshGymNow().catch(() => undefined).then(() => setBusy(false)); }}>{t('gd.refresh')}</Button>
          </div>
          {getLastVerdict() !== 'ok' && (
            <ul class="sf-st__list">
              <li>
                <a href="/gym/restore" class="sf-st__group" onClick={(e) => { e.preventDefault(); navigate('/gym/restore'); }}>
                  <span class="sf-st__icon" aria-hidden="true"><Icon name="info" /></span>
                  <span class="sf-st__text"><span class="sf-st__name">{t('rs.row')}</span><span class="sf-st__hint">{t('rs.row.hint')}</span></span>
                  <span class="sf-st__caret" aria-hidden="true"><Icon name="caret-right" /></span>
                </a>
              </li>
            </ul>
          )}
          <ul class="sf-st__list">
            {rows.filter((r) => resolveFeature(r.feature)).map((r) => (
              <li key={r.to}>
                <a href={r.to} class="sf-st__group" onClick={(e) => { e.preventDefault(); navigate(r.to); }}>
                  <span class="sf-st__icon" aria-hidden="true"><Icon name={r.icon} /></span>
                  <span class="sf-st__text">
                    <span class="sf-st__name">{t(r.key)}</span>
                    {r.to === '/gym/inbox' && unreadCount(d.inbox) > 0 && <span class="sf-st__hint">{t('gd.unread', { n: unreadCount(d.inbox) })}</span>}
                  </span>
                  <span class="sf-st__caret" aria-hidden="true"><Icon name="caret-right" /></span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </GymFrame>
  );
}

/** /gym/membership: plan, dates, days left. */
export function GymMembershipPage() {
  return (
    <GymFrame title={t('gd.mem')} back="/gym">
      {(d) => {
        const v = membershipView(pickMembership(d.memberships, today()), today());
        const left =
          v.daysLeft === null ? '' : v.state === 'expired' ? (v.daysOver === 1 ? t('gd.mem.over1') : t('gd.mem.over', { n: v.daysOver ?? 0 })) : v.daysLeft === 0 ? t('gd.mem.today') : v.daysLeft === 1 ? t('gd.mem.left1') : t('gd.mem.left', { n: v.daysLeft });
        return (
          <>
            <div class="sf-st__row">
              <h2 class="sf-st__label">{t(`gd.mem.s.${v.state}` as StringKey)}</h2>
              {v.state === 'none' ? (
                <p class="sf-st__para">{t('gd.mem.none')}</p>
              ) : (
                <>
                  {v.planName && <p class="sf-st__value">{`${t('gd.mem.plan')}: ${v.planName}`}</p>}
                  {v.state !== 'frozen' && v.state !== 'upcoming' && <p class="sf-st__value">{left}</p>}
                  {v.state === 'upcoming' && <p class="sf-st__value">{t('gd.mem.from', { date: niceDate(v.startDate!) })}</p>}
                  <p class="sf-st__hint">{t('gd.mem.to', { date: niceDate(v.endDate!) })}</p>
                </>
              )}
            </div>
            <Updated at={d.fetchedAt} />
          </>
        );
      }}
    </GymFrame>
  );
}

/** /gym/qr: the member QR, drawn on the phone from the stored member code (works offline). */
export function GymQrPage() {
  return (
    <GymFrame title={t('gd.qr')} back="/gym">
      {(d) => {
        const text = d.memberCode ? encodeMemberQr(d.memberCode) : null;
        return text ? (
          <div class="sf-st__row">
            <QrSvg text={text} />
            <p class="sf-st__value">{t('gd.qr.code', { code: d.memberCode! })}</p>
            <p class="sf-st__hint">{t('gd.qr.help')}</p>
          </div>
        ) : (
          <div class="sf-st__row"><p class="sf-st__para">{t('gd.qr.none')}</p></div>
        );
      }}
    </GymFrame>
  );
}

/** /gym/attendance: streak, visits in 30 days, a month calendar. */
export function GymAttendancePage() {
  const now = today();
  const [ym, setYm] = useState<[number, number]>([Number(now.slice(0, 4)), Number(now.slice(5, 7))]);
  const step = (n: number) => setYm(([y, m]) => { const x = y * 12 + (m - 1) + n; return [Math.floor(x / 12), (x % 12) + 1]; });
  return (
    <GymFrame title={t('gd.att')} back="/gym">
      {(d) => {
        const s = attendanceSummary(d.attendance, now);
        const grid = monthGrid(d.attendance, ym[0], ym[1]);
        const title = new Date(Date.UTC(ym[0], ym[1] - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        return (
          <>
            <div class="sf-st__row">
              <p class="sf-st__value">{`${t('gd.att.streak')}: ${t('gd.att.days', { n: s.streakDays })}`}</p>
              <p class="sf-st__hint">{`${t('gd.att.last30')}: ${s.last30}`}</p>
              <p class="sf-st__hint">{`${t('gd.att.longest')}: ${t('gd.att.days', { n: s.longestDays })}`}</p>
              {s.lastVisit ? <p class="sf-st__hint">{t('gd.att.last', { date: niceDate(s.lastVisit) })}</p> : <p class="sf-st__hint">{t('gd.att.none')}</p>}
            </div>
            <div class="sf-st__row">
              <div class="sf-st__chips">
                <Button variant="secondary" onPress={() => step(-1)}>{t('gd.att.prev')}</Button>
                <Button variant="secondary" onPress={() => step(1)}>{t('gd.att.next')}</Button>
              </div>
              <h2 class="sf-st__label">{title}</h2>
              <ul class="sf-gdcal" aria-label={title}>
                {grid.map((c, i) => (
                  <li key={i} class={c.visited ? 'sf-gdcal__day sf-gdcal__day--on' : 'sf-gdcal__day'} aria-label={c.key && c.visited ? `${c.key} ${t('gd.att.visited')}` : undefined}>
                    {c.key ? Number(c.key.slice(8)) : ''}
                  </li>
                ))}
              </ul>
            </div>
            <Updated at={d.fetchedAt} />
          </>
        );
      }}
    </GymFrame>
  );
}

/** /gym/inbox: messages for the member and the gym's announcements. Opening a message marks it read. */
export function GymInboxPage() {
  return (
    <GymFrame title={t('gd.inbox')} back="/gym">
      {(d) => (
        <>
          <div class="sf-st__row">
            <h2 class="sf-st__label">{t('gd.inbox.mine')}</h2>
            {d.inbox.length === 0 && <p class="sf-st__hint">{t('gd.inbox.none')}</p>}
            {d.inbox.map((m) => (
              <div key={m.id} class="sf-st__row">
                <p class="sf-st__value">{m.title}</p>
                <p class="sf-st__para">{m.body}</p>
                {!m.readAt && <Button variant="secondary" onPress={() => void markRead(m.id)}>{t('gd.inbox.read')}</Button>}
              </div>
            ))}
          </div>
          <div class="sf-st__row">
            <h2 class="sf-st__label">{t('gd.inbox.ann')}</h2>
            {d.announcements.length === 0 && <p class="sf-st__hint">{t('gd.inbox.none')}</p>}
            {d.announcements.map((a) => (
              <div key={a.id} class="sf-st__row">
                <p class="sf-st__value">{a.title}</p>
                <p class="sf-st__para">{a.body}</p>
              </div>
            ))}
          </div>
          <Updated at={d.fetchedAt} />
        </>
      )}
    </GymFrame>
  );
}

/** /gym/requests: the member's requests and a new-request form. A request is saved on the phone first and sent when online. */
export function GymRequestsPage() {
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [note, setNote] = useState('');
  const [days, setDays] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const send = async (existing: GymData['queuedAndSent']) => {
    setErr(null);
    setMsg(null);
    if (!kind) return setErr(t('gd.req.p.kind'));
    if (!canOpenRequest(kind, existing)) return setErr(t('gd.req.open'));
    const r = await submitRequest({ kind, note, freezeDays: days.trim() === '' ? undefined : Number(days) });
    if (!r.ok) return setErr(t(`gd.req.p.${r.problem}` as StringKey));
    setMsg(t('gd.req.sent'));
    setNote('');
    setDays('');
    setKind(null);
  };
  return (
    <GymFrame title={t('gd.req')} back="/gym">
      {(d) => (
        <>
          <div class="sf-st__row">
            <h2 class="sf-st__label">{t('gd.req.new')}</h2>
            <p class="sf-st__hint">{t('gd.req.kind')}</p>
            <div class="sf-st__chips">
              {REQUEST_KINDS.map((k) => (
                <Button key={k} variant={kind === k ? 'primary' : 'secondary'} onPress={() => setKind(k)}>{t(`gd.req.k.${k}` as StringKey)}</Button>
              ))}
            </div>
            {kind === 'forgot_password' && <p class="sf-st__hint">{t('gd.req.forgot')}</p>}
            {kind === 'freeze' && (
              <label class="sf-st__hint">
                {t('gd.req.days')}
                <input class="sf-input" type="number" inputMode="numeric" min="1" max="90" value={days} onInput={(e) => setDays((e.target as HTMLInputElement).value)} />
              </label>
            )}
            {kind && (
              <label class="sf-st__hint">
                {t('gd.req.note')}
                <input class="sf-input" type="text" maxLength={400} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
              </label>
            )}
            {err && <p class="sf-rt__err" role="alert">{err}</p>}
            {msg && <p class="sf-st__ok" role="status">{msg}</p>}
            <Button onPress={() => void send(d.queuedAndSent)}>{t('gd.req.send')}</Button>
          </div>
          <div class="sf-st__row">
            <h2 class="sf-st__label">{t('gd.req')}</h2>
            {d.queuedAndSent.length === 0 && <p class="sf-st__hint">{t('gd.req.none')}</p>}
            {d.queuedAndSent.map((r) => (
              <div key={r.clientId} class="sf-st__row">
                <p class="sf-st__value">{t(`gd.req.k.${r.kind}` as StringKey)}</p>
                <p class="sf-st__hint">{t(`gd.req.s.${r.status}` as StringKey)}</p>
                {r.note && <p class="sf-st__para">{r.note}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </GymFrame>
  );
}

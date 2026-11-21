import { describe, expect, it } from 'vitest';
import {
  EXPIRING_DAYS,
  attendanceDays,
  attendanceSummary,
  canOpenRequest,
  crc16,
  decodeMemberQr,
  encodeMemberQr,
  membershipView,
  monthGrid,
  nextRequestStatus,
  normaliseMemberCode,
  pickMembership,
  requestRow,
  unreadCount,
  validateRequest,
} from '../../src/shared/gymData';

const T = '2026-11-21';

describe('membership days left and state', () => {
  const m = (start: string, end: string, status?: string) => ({ plan_name: 'Monthly', start_date: start, end_date: end, status });
  it('last day counts as 0 left and is expiring', () => {
    const v = membershipView(m('2026-10-22', T), T);
    expect(v.daysLeft).toBe(0);
    expect(v.state).toBe('expiring');
  });
  it('the day after the end is expired by 1', () => {
    const v = membershipView(m('2026-10-21', '2026-11-20'), T);
    expect(v.state).toBe('expired');
    expect(v.daysLeft).toBe(-1);
    expect(v.daysOver).toBe(1);
  });
  it('boundary of the expiring window', () => {
    expect(membershipView(m('2026-11-01', '2026-11-28'), T).state).toBe('expiring'); // 7 left
    expect(membershipView(m('2026-11-01', '2026-11-29'), T).state).toBe('active'); // 8 left
    expect(EXPIRING_DAYS).toBe(7);
  });
  it('upcoming, frozen, cancelled, bad dates', () => {
    expect(membershipView(m('2026-11-25', '2026-12-25'), T).state).toBe('upcoming');
    expect(membershipView(m('2026-11-01', '2026-12-25', 'frozen'), T).state).toBe('frozen');
    expect(membershipView(m('2026-11-01', '2026-12-25', 'cancelled'), T).state).toBe('none');
    expect(membershipView(m('nope', '2026-12-25'), T).state).toBe('none');
    expect(membershipView(null, T).state).toBe('none');
  });
  it('year and leap-day crossings', () => {
    expect(membershipView(m('2027-12-01', '2028-03-01'), '2028-02-28').daysLeft).toBe(2);
    expect(membershipView(m('2026-12-01', '2027-01-05'), '2026-12-30').daysLeft).toBe(6);
  });
  it('picks running, then next upcoming, then latest ended', () => {
    const rows = [m('2026-01-01', '2026-02-01'), m('2026-11-01', '2026-12-01'), m('2026-12-05', '2027-01-05')];
    expect(pickMembership(rows, T)?.end_date).toBe('2026-12-01');
    expect(pickMembership([rows[0]!, rows[2]!], T)?.start_date).toBe('2026-12-05');
    expect(pickMembership([rows[0]!, m('2026-03-01', '2026-04-01')], T)?.end_date).toBe('2026-04-01');
    expect(pickMembership([], T)).toBeNull();
  });
});

describe('member QR', () => {
  it('crc16 matches the CCITT-FALSE check value', () => {
    expect(crc16('123456789')).toBe(0x29b1);
    expect(crc16('')).toBe(0xffff);
  });
  it('encodes SF1:<code>:<crc4> and normalises the code', () => {
    const q = encodeMemberQr(' sf-0042 ');
    expect(q).toMatch(/^SF1:SF-0042:[0-9A-F]{4}$/);
    expect(q).toBe(`SF1:SF-0042:${crc16('SF1:SF-0042').toString(16).toUpperCase().padStart(4, '0')}`);
  });
  it('round trips', () => {
    const q = encodeMemberQr('SF-0042')!;
    expect(decodeMemberQr(q)).toEqual({ ok: true, code: 'SF-0042' });
  });
  it('a changed character or crc is refused', () => {
    const q = encodeMemberQr('SF-0042')!;
    expect(decodeMemberQr(q.replace('0042', '0043'))).toEqual({ ok: false, reason: 'crc' });
    expect(decodeMemberQr(q.slice(0, -1) + (q.endsWith('0') ? '1' : '0'))).toEqual({ ok: false, reason: 'crc' });
  });
  it('wrong shapes are refused', () => {
    for (const s of ['', 'SF1:', 'SF2:SF-0042:ABCD', 'SF1:SF-0042', 'SF1:sf-0042:ABCD', 'SF1:SF-0042:ZZZZ', 'hello']) {
      expect(decodeMemberQr(s)).toEqual({ ok: false, reason: 'format' });
    }
  });
  it('bad member codes give no QR', () => {
    expect(encodeMemberQr('')).toBeNull();
    expect(encodeMemberQr('a b')).toBeNull();
    expect(normaliseMemberCode('x')).toBeNull();
  });
});

describe('attendance', () => {
  it('distinct valid sorted days; deleted rows ignored', () => {
    expect(
      attendanceDays([
        { day: '2026-11-20' },
        { day: '2026-11-19' },
        { day: '2026-11-20' },
        { day: 'bad' },
        { day: '2026-11-18', deleted_at: '2026-11-19T00:00:00Z' },
      ]),
    ).toEqual(['2026-11-19', '2026-11-20']);
  });
  it('streak counts today, or yesterday when today has no visit yet', () => {
    expect(attendanceSummary(['2026-11-19', '2026-11-20', T], T).streakDays).toBe(3);
    expect(attendanceSummary(['2026-11-19', '2026-11-20'], T).streakDays).toBe(2);
    expect(attendanceSummary(['2026-11-18'], T).streakDays).toBe(0);
    expect(attendanceSummary([], T)).toEqual({ last30: 0, streakDays: 0, longestDays: 0, lastVisit: null });
  });
  it('last 30 days window and longest run', () => {
    const days = ['2026-10-22', '2026-10-23', '2026-10-24', '2026-11-10', T];
    const s = attendanceSummary(days, T);
    expect(s.last30).toBe(4); // 22 Oct is day 31 back (not counted)
    expect(s.longestDays).toBe(3);
    expect(s.lastVisit).toBe(T);
  });
  it('month grid starts under the right weekday and marks visits', () => {
    const g = monthGrid(['2026-11-03'], 2026, 11); // 1 Nov 2026 is a Sunday: 6 blanks (Monday first)
    expect(g.slice(0, 6).every((c) => c.key === null)).toBe(true);
    expect(g[6]?.key).toBe('2026-11-01');
    expect(g.length).toBe(6 + 30);
    expect(g.find((c) => c.key === '2026-11-03')?.visited).toBe(true);
  });
});

describe('inbox', () => {
  it('counts unread, not read or deleted', () => {
    expect(unreadCount([{ id: 'a' }, { id: 'b', read_at: 'x' }, { id: 'c', deleted_at: 'y' }])).toBe(1);
  });
});

describe('requests', () => {
  it('validates kind, note and freeze days', () => {
    expect(validateRequest({ kind: 'nope' })).toBe('kind');
    expect(validateRequest({ kind: 'complaint', note: '' })).toBe('note-required');
    expect(validateRequest({ kind: 'complaint', note: 'AC is broken' })).toBeNull();
    expect(validateRequest({ kind: 'locker' })).toBeNull();
    expect(validateRequest({ kind: 'locker', note: 'x'.repeat(301) })).toBe('note-too-long');
    expect(validateRequest({ kind: 'freeze' })).toBe('freeze-days');
    expect(validateRequest({ kind: 'freeze', freezeDays: 0 })).toBe('freeze-days');
    expect(validateRequest({ kind: 'freeze', freezeDays: 91 })).toBe('freeze-days');
    expect(validateRequest({ kind: 'freeze', freezeDays: 14 })).toBeNull();
  });
  it('one open request per kind', () => {
    expect(canOpenRequest('locker', [{ kind: 'locker', status: 'open' }])).toBe(false);
    expect(canOpenRequest('locker', [{ kind: 'locker', status: 'queued' }])).toBe(false);
    expect(canOpenRequest('locker', [{ kind: 'locker', status: 'done' }])).toBe(true);
    expect(canOpenRequest('locker', [{ kind: 'freeze', status: 'open' }])).toBe(true);
  });
  it('status moves: queued -> open on send; final states never move back', () => {
    expect(nextRequestStatus('queued', 'sent')).toBe('open');
    expect(nextRequestStatus('open', 'sent')).toBe('open');
    expect(nextRequestStatus('open', 'server', 'in_progress')).toBe('in_progress');
    expect(nextRequestStatus('done', 'server', 'open')).toBe('done');
    expect(nextRequestStatus('rejected', 'sent')).toBe('rejected');
  });
  it('the pushed row has status open and no staff fields', () => {
    const r = requestRow({ kind: 'freeze', freezeDays: 7, note: ' trip ' }, 'cid-1');
    expect(r).toEqual({ client_id: 'cid-1', kind: 'freeze', note: 'trip', freeze_days: 7, status: 'open' });
    expect(requestRow({ kind: 'locker' }, 'c2').freeze_days).toBeNull();
  });
});

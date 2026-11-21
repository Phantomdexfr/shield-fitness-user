import { describe, expect, it } from 'vitest';
import { canStartRequest, isLocked, lockedUntil, MIN_ANSWER_CHARS, sameAccount, showCancelPrompt, ticketView, validateAnswers, validateForgot, TICKET_LIFE_MS, LOCK_MS } from '../../src/shared/freeRecovery';
import { freeError } from '../../src/shared/freeAccount';

const NOW = Date.parse('2026-11-21T06:00:00Z');
const good = { identifier: 'lifter-7k2q', firstMonth: '2025-01', lastMonth: '2026-11', band: '30-99', answers: { p1: 'abc', p2: 'def' } };

describe('recovery answers (R3)', () => {
  it('needs both, trimmed, at least the minimum', () => {
    expect(validateAnswers({ p1: 'ab', p2: 'good one' })).toEqual({ ok: false, fields: ['p1'] });
    expect(validateAnswers({ p1: '  ', p2: '' })).toEqual({ ok: false, fields: ['p1', 'p2'] });
    expect(validateAnswers({ p1: ' abc ', p2: 'x'.repeat(MIN_ANSWER_CHARS) })).toEqual({ ok: true, answers: { p1: 'abc', p2: 'xxx' } });
    expect(validateAnswers({ p1: 'x'.repeat(101), p2: 'abc' })).toMatchObject({ ok: false });
  });
});

describe('forgot request (R7)', () => {
  it('builds the contract body with an empty decoy box', () => {
    const r = validateForgot(good, '2026-11');
    expect(r).toEqual({ ok: true, body: { identifier: 'lifter-7k2q', facts: { first_month: '2025-01', last_month: '2026-11', sessions_band: '30-99' }, answers: { p1: 'abc', p2: 'def' }, website: '' } });
  });
  it('marks every wrong box', () => {
    const r = validateForgot({ identifier: ' ', firstMonth: '2027-01', lastMonth: '2024-13', band: '5', answers: { p1: 'a', p2: 'abc' } }, '2026-11');
    expect(r).toEqual({ ok: false, fields: ['identifier', 'first_month', 'last_month', 'sessions_band', 'p1'] });
  });
  it('last month before first month is refused', () => {
    expect(validateForgot({ ...good, firstMonth: '2026-05', lastMonth: '2026-04' }, '2026-11')).toEqual({ ok: false, fields: ['last_month'] });
  });
});

describe('ticket state (R8)', () => {
  const o = (signed = false, createdAt = NOW) => ({ now: NOW, createdAt, signedInSameAccount: signed });
  it('cooling and waiting are open, cancel only from the signed-in account', () => {
    expect(ticketView({ status: 'cooling', readyAfter: '2026-11-22T06:00:00Z' }, o(false))).toMatchObject({ open: true, canCancel: false, canRedeem: false, date: '2026-11-22T06:00:00Z', key: 'bk.fp.st.cooling' });
    expect(ticketView({ status: 'waiting' }, o(true))).toMatchObject({ open: true, canCancel: true });
  });
  it('approved can be redeemed until the window closes, then reads as expired', () => {
    const t = { status: 'approved' as const, redeemUntil: '2026-11-21T08:00:00Z' };
    expect(ticketView(t, o())).toMatchObject({ canRedeem: true, status: 'approved' });
    expect(ticketView(t, { ...o(), now: NOW + 3 * 3600_000 })).toMatchObject({ canRedeem: false, status: 'expired', key: 'bk.fp.st.expired' });
  });
  it('an open ticket older than 7 days reads as expired even if the server was not asked', () => {
    expect(ticketView({ status: 'waiting' }, o(false, NOW - TICKET_LIFE_MS - 1)).status).toBe('expired');
    expect(ticketView({ status: 'waiting' }, o(false, NOW - TICKET_LIFE_MS + 1000)).status).toBe('waiting');
  });
  it('closed tickets are final and cannot be cancelled or redeemed', () => {
    for (const s of ['denied', 'cancelled', 'expired', 'redeemed'] as const) expect(ticketView({ status: s }, o(true))).toMatchObject({ open: false, canCancel: false, canRedeem: false });
    expect(ticketView({ status: 'redeemed' }, o()).canCheck).toBe(false);
  });
});

describe('one open ticket', () => {
  const stored = { identifier: 'x', code: 'C', readyAfter: null, createdAt: NOW };
  it('a stored open ticket blocks a second request; a closed or old one does not', () => {
    expect(canStartRequest(null, null, NOW)).toBe(true);
    expect(canStartRequest(stored, 'cooling', NOW)).toBe(false);
    expect(canStartRequest(stored, null, NOW)).toBe(false);
    expect(canStartRequest(stored, 'denied', NOW)).toBe(true);
    expect(canStartRequest(stored, 'waiting', NOW + TICKET_LIFE_MS + 5)).toBe(true);
  });
});

describe('cancel prompt and lock', () => {
  it('the prompt shows for an open ticket on the signed-in account only', () => {
    expect(showCancelPrompt('cooling', true)).toBe(true);
    expect(showCancelPrompt('cooling', false)).toBe(false);
    expect(showCancelPrompt('redeemed', true)).toBe(false);
    expect(showCancelPrompt(null, true)).toBe(false);
  });
  it('same account by free id or username, any case', () => {
    const a = { free_id: 'FR1-7K2Q9', username: 'lifter-7k2q' };
    expect(sameAccount(' fr1-7k2q9 ', a)).toBe(true);
    expect(sameAccount('LIFTER-7K2Q', a)).toBe(true);
    expect(sameAccount('lifter-zzzz', a)).toBe(false);
    expect(sameAccount('lifter-7k2q', null)).toBe(false);
  });
  it('the 24 hour lock runs out', () => {
    const until = lockedUntil(NOW);
    expect(until - NOW).toBe(LOCK_MS);
    expect(isLocked(until, NOW + 1)).toBe(true);
    expect(isLocked(until, until)).toBe(false);
    expect(isLocked(null, NOW)).toBe(false);
  });
  it('error codes map to the plain messages', () => {
    expect(freeError('SFE708').key).toBe('bk.err.locked');
    expect(freeError('SFE709').key).toBe('bk.err.noticket');
    expect(freeError('SFE710').key).toBe('bk.err.notready');
  });
});

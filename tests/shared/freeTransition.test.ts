import { describe, expect, it } from 'vitest';
import { moveDecision, moveKeys, moveView, ownerPrompt, parseMove, restoreSourceFor, switchOffer, type MoveInput } from '../../src/shared/freeTransition';

const base: MoveInput = { mode: 'free_backup', rec: { agreed: true }, hasSession: true, mustChange: false, online: true, prompt: 'mine', rows: 5, freeHasData: true, running: false };

describe('freeTransition (pure)', () => {
  it('starts only when everything in the order is done and the person agreed', () => {
    expect(moveDecision(base)).toBe('start');
    expect(moveDecision({ ...base, hasSession: false })).toBe('wait'); // not signed in to the gym yet
    expect(moveDecision({ ...base, mustChange: true })).toBe('wait'); // password change first
    expect(moveDecision({ ...base, rec: {} })).toBe('wait'); // no consent
    expect(moveDecision({ ...base, online: false })).toBe('wait');
    expect(moveDecision({ ...base, prompt: 'ask' })).toBe('wait');
    expect(moveDecision({ ...base, prompt: 'other' })).toBe('wait');
    expect(moveDecision({ ...base, freeHasData: null })).toBe('wait'); // free copy could not be asked
  });
  it('never moves from a standalone or already connected phone', () => {
    expect(moveDecision({ ...base, mode: 'connected', rec: null })).toBe('none');
    expect(moveDecision({ ...base, mode: 'standalone', rec: null })).toBe('none');
  });
  it('an empty phone with a free copy restores first, never writes an empty gym backup', () => {
    expect(moveDecision({ ...base, rows: 0, freeHasData: true })).toBe('restore_first');
    expect(moveDecision({ ...base, rows: 0, freeHasData: false })).toBe('start');
  });
  it('a dead phone is repaired; a live run is left alone', () => {
    expect(moveDecision({ ...base, rec: { agreed: true, phase: 'writing' } })).toBe('rollback');
    expect(moveDecision({ ...base, rec: { agreed: true, phase: 'writing' }, running: true })).toBe('wait');
  });
  it('after the flip only the free delete is left', () => {
    const f = { ...base, mode: 'connected' as const, rec: { phase: 'flipped' as const } };
    expect(moveDecision(f)).toBe('delete_free');
    expect(moveDecision({ ...f, online: false })).toBe('wait');
    expect(moveDecision({ ...f, hasSession: false })).toBe('wait');
  });
  it('"Is this your data?" asks only for stamped rows of someone else', () => {
    const m = 'member:ABC123';
    expect(ownerPrompt({ stamp: 'free:FR1-X', memberOwner: m, rows: 3 })).toBe('ask');
    expect(ownerPrompt({ stamp: 'member:OTHER', memberOwner: m, rows: 3 })).toBe('ask');
    expect(ownerPrompt({ stamp: 'free:FR1-X', memberOwner: m, rows: 0 })).toBe('mine');
    expect(ownerPrompt({ stamp: null, memberOwner: m, rows: 3 })).toBe('mine');
    expect(ownerPrompt({ stamp: m, memberOwner: m, rows: 3 })).toBe('mine');
    expect(ownerPrompt({ stamp: 'free:FR1-X', memberOwner: m, rows: 3, answer: true })).toBe('mine');
    expect(ownerPrompt({ stamp: m, memberOwner: m, rows: 3, answer: false })).toBe('other');
  });
  it('free first on a phone that still has the free account', () => {
    expect(restoreSourceFor({ mode: 'free_backup', hasFreeAccount: true })).toBe('free');
    expect(restoreSourceFor({ mode: 'free_backup', hasFreeAccount: false })).toBe('gym');
    expect(restoreSourceFor({ mode: 'connected', hasFreeAccount: true })).toBe('gym');
  });
  it('R10 is offered only to a phone that was on the gym backup and has no free account', () => {
    const o = { wasConnected: true, cloudBackupOn: true, freeAccountOn: true, configReady: true, hasFreeAccount: false };
    expect(switchOffer(o)).toBe(true);
    for (const k of Object.keys(o) as (keyof typeof o)[]) expect(switchOffer({ ...o, [k]: k === 'hasFreeAccount' ? true : false })).toBe(false);
  });
  it('the R12 block follows the state', () => {
    const v = { mode: 'free_backup' as const, rec: null, gymSignedIn: true, mustChange: false, prompt: 'mine' as const };
    expect(moveView(v)).toBe('consent');
    expect(moveView({ ...v, prompt: 'ask' })).toBe('ask');
    expect(moveView({ ...v, prompt: 'other' })).toBe('other');
    expect(moveView({ ...v, rec: { agreed: true } })).toBe('waiting');
    expect(moveView({ ...v, rec: { agreed: true }, restoreFirst: true })).toBe('restore_first');
    expect(moveView({ ...v, gymSignedIn: false })).toBe('hidden');
    expect(moveView({ ...v, mode: 'standalone' })).toBe('hidden');
    expect(moveView({ ...v, mode: 'connected', rec: { phase: 'flipped' } })).toBe('kept');
  });
  it('record parsing ignores junk; the snapshot keys exclude the mode', () => {
    expect(parseMove(null)).toBeNull();
    expect(parseMove({ mine: 'x', phase: 'zzz', snapshot: [1, { key: 'a', value: 1 }] })).toEqual({ snapshot: [{ key: 'a', value: 1 }] });
    expect(moveKeys(['backup:mode', 'backup:dirty', 'owner', 'backup:base:a'])).toEqual(['backup:dirty', 'backup:base:a']);
  });
});

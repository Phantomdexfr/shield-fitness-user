import { describe, expect, it } from 'vitest';
import { planAutoRestore, screenFor, WIFI_ROWS, type AutoRestoreInput } from '../../src/shared/restoreFlow';

const base: AutoRestoreInput = {
  signedIn: true, mustChangePassword: false, cloudBackupOn: true, autoRestoreOn: true, shardKnown: true,
  stampedOwner: null, currentOwner: 'member:M1', localRows: 0,
  manifests: [{ key: 'sessions:2026-11', rows: 40, schema: 1 }, { key: 'small', rows: 5, schema: 1 }],
  supportedSchema: 1, restoreRunning: false,
};
const plan = (o: Partial<AutoRestoreInput> = {}) => planAutoRestore({ ...base, ...o });

describe('planAutoRestore (RECOVERY_PLAN section 6)', () => {
  it('empty phone + manifest = start by itself', () => {
    expect(plan()).toEqual({ kind: 'start', rows: 45, parts: 2, wifi: false, resume: false });
  });
  it('1: signed out waits for sign-in; forced password change waits for the change', () => {
    expect(plan({ signedIn: false })).toEqual({ kind: 'wait', why: 'signin' });
    expect(plan({ mustChangePassword: true })).toEqual({ kind: 'wait', why: 'password' });
  });
  it('2: another member on this phone = owner message, never a start or a merge offer', () => {
    expect(plan({ stampedOwner: 'member:M9' })).toEqual({ kind: 'owner' });
    expect(plan({ stampedOwner: 'member:M9', localRows: 10 })).toEqual({ kind: 'owner' });
    expect(plan({ stampedOwner: 'member:M1' }).kind).toBe('start');
  });
  it('3: local data = offer (merge), never an automatic start', () => {
    expect(plan({ localRows: 3 })).toMatchObject({ kind: 'offer' });
  });
  it('4: a running record resumes by itself, even with rows on the phone', () => {
    expect(plan({ restoreRunning: true, localRows: 12 })).toMatchObject({ kind: 'start', resume: true });
  });
  it('5 [A-R4]: expired or frozen changes nothing', () => {
    for (const memberStatus of ['expired', 'frozen'] as const) expect(plan({ memberStatus })).toEqual(plan());
  });
  it('7: a shard that is not in the config = closed', () => {
    expect(plan({ shardKnown: false })).toEqual({ kind: 'closed' });
  });
  it('9: above 500 rows the Wi-Fi line shows; exactly 500 does not', () => {
    expect(plan({ manifests: [{ key: 'small', rows: WIFI_ROWS, schema: 1 }] })).toMatchObject({ wifi: false });
    expect(plan({ manifests: [{ key: 'small', rows: WIFI_ROWS + 1, schema: 1 }] })).toMatchObject({ wifi: true });
  });
  it('11: a newer schema = update the app', () => {
    expect(plan({ manifests: [{ key: 'small', rows: 1, schema: 2 }] })).toEqual({ kind: 'update' });
  });
  it('feature off: auto_restore off = button only; cloud_backup off = nothing', () => {
    expect(plan({ autoRestoreOn: false })).toMatchObject({ kind: 'offer' });
    expect(plan({ cloudBackupOn: false })).toEqual({ kind: 'none' });
  });
  it('no manifest = none; unreadable manifest list = wait offline', () => {
    expect(plan({ manifests: [] })).toEqual({ kind: 'none' });
    expect(plan({ manifests: null })).toEqual({ kind: 'wait', why: 'offline' });
  });
  it('screenFor maps every decision', () => {
    expect(screenFor(plan())).toBe('running');
    expect(screenFor(plan({ localRows: 1 }))).toBe('offer');
    expect(screenFor(plan({ signedIn: false }))).toBe('signin');
    expect(screenFor(plan({ mustChangePassword: true }))).toBe('password');
    expect(screenFor(plan({ manifests: null }))).toBe('offline');
    expect(screenFor({ kind: 'owner' })).toBe('owner');
  });
});

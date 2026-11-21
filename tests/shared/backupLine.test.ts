import { describe, expect, it } from 'vitest';
import { backupLine, type BackupLineInput } from '../../src/shared/backupPlan';
import { chipState, type ChipInput } from '../../src/shared/sync';

const DAY = 86_400_000;
const base: BackupLineInput = { mode: 'connected', featureOn: true, online: true, saving: false, restoring: false, dirty: 0, okAt: 1_000_000, errorCode: undefined, now: 1_000_000 + DAY };
const chip: ChipInput = { connected: true, running: false, online: true, waiting: 0, failed: 0, authPaused: false, versionMismatch: false, lastSyncedAt: null };

describe('backup status line (R13)', () => {
  it('standalone or feature off is the "off" line', () => {
    expect(backupLine({ ...base, mode: 'standalone' }).key).toBe('bk.state.off');
    expect(backupLine({ ...base, featureOn: false }).key).toBe('bk.state.off');
  });
  it('ok with the time; amber past 7 days online; not amber offline', () => {
    expect(backupLine(base)).toEqual({ key: 'bk.state.ok', at: 1_000_000, amber: false });
    expect(backupLine({ ...base, now: 1_000_000 + 8 * DAY }).amber).toBe(true);
    expect(backupLine({ ...base, now: 1_000_000 + 8 * DAY, online: false }).amber).toBe(false);
  });
  it('waiting, saving, restoring, blocked, update, attention', () => {
    expect(backupLine({ ...base, dirty: 2, online: false }).key).toBe('bk.state.wait');
    expect(backupLine({ ...base, saving: true }).key).toBe('bk.state.saving');
    expect(backupLine({ ...base, restoring: true }).key).toBe('bk.state.restoring');
    expect(backupLine({ ...base, errorCode: 'S1' }).key).toBe('bk.state.blocked');
    expect(backupLine({ ...base, errorCode: 'SFE707', saving: true }).key).toBe('bk.state.update');
    expect(backupLine({ ...base, errorCode: 'SFE703' }).key).toBe('bk.state.attn');
    expect(backupLine({ ...base, okAt: null }).key).toBe('bk.state.attn');
  });
});

describe('chip with a backup input', () => {
  it('absent input changes nothing; newer and blocked need attention; saving shows backing_up', () => {
    expect(chipState(chip)).toEqual({ kind: 'idle', lastSyncedAt: null });
    expect(chipState({ ...chip, backup: { saving: false, blocked: false, newer: true } })).toMatchObject({ kind: 'attention', reason: 'backup_update' });
    expect(chipState({ ...chip, backup: { saving: false, blocked: true, newer: false } })).toMatchObject({ kind: 'attention', reason: 'backup_blocked' });
    expect(chipState({ ...chip, backup: { saving: true, blocked: false, newer: false } })).toEqual({ kind: 'backing_up' });
    expect(chipState({ ...chip, running: true, backup: { saving: true, blocked: false, newer: false } })).toEqual({ kind: 'syncing' });
    expect(chipState({ ...chip, connected: false, backup: { saving: true, blocked: true, newer: true } })).toBeNull();
  });
});

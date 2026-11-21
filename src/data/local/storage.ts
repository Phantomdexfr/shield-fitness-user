/** Persistent-storage request and quota helper (Settings -> Data shows the numbers in Phase 63). */

export async function requestPersist(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface QuotaInfo {
  supported: boolean;
  usageBytes: number;
  quotaBytes: number;
  /** 0..1, 0 when unknown */
  fraction: number;
}

export async function getQuota(): Promise<QuotaInfo> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { supported: false, usageBytes: 0, quotaBytes: 0, fraction: 0 };
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      supported: true,
      usageBytes: usage,
      quotaBytes: quota,
      fraction: quota > 0 ? Math.min(1, usage / quota) : 0,
    };
  } catch {
    return { supported: false, usageBytes: 0, quotaBytes: 0, fraction: 0 };
  }
}

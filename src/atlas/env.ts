// Phase 60: reads the device (DOM side of the pure decisions in logic.ts). No three.js here, so it stays in the page chunk.
import type { PowerEnv, RendererEnv } from './logic';

export const MODEL_FILES = ['body.bin', 'fit.bin', 'meta.json'] as const;
/** Measured sum of public/atlas/* (Phase 60): body.bin 2,003,790 + fit.bin 625,563 + meta.json 14,581 bytes. */
export const MODEL_BYTES = 2643934;
export const MODEL_MB_TEXT = '2.6';

export function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function rendererEnv(): RendererEnv {
  return { hasWebGL: detectWebGL(), hasDecompression: typeof (globalThis as { DecompressionStream?: unknown }).DecompressionStream === 'function' };
}

interface NavExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
}

export function readPowerEnvSync(): PowerEnv {
  const n = navigator as Navigator & NavExtras;
  return { hardwareConcurrency: n.hardwareConcurrency, deviceMemory: n.deviceMemory, saveData: !!n.connection?.saveData };
}

/** Adds the battery level where the browser offers it (not on iOS). Never throws. */
export async function readPowerEnv(): Promise<PowerEnv> {
  const base = readPowerEnvSync();
  try {
    const b = await (navigator as Navigator & NavExtras).getBattery?.();
    if (b) return { ...base, batteryLevel: b.level, batteryCharging: b.charging };
  } catch {
    /* unknown battery: leave it out */
  }
  return base;
}

export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const modelUrl = (file: (typeof MODEL_FILES)[number]): string => `${import.meta.env.BASE_URL}atlas/${file}`;

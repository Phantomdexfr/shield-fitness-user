// Barcode detector for the scanner (Phase 56). Native `BarcodeDetector` when the browser has it, else the `barcode-detector` WASM
// ponyfill, loaded lazily (a separate chunk) only when the scanner opens. The WASM file is bundled with the app and located by its own
// URL, so no CDN request is made at runtime (the ponyfill's default would fetch it from a CDN).

import { SCAN_FORMATS, type BarcodeFormat } from '../../shared/barcode';

export interface Detector {
  /** One frame in, the first raw barcode text out (or null). */
  read(source: HTMLVideoElement): Promise<string | null>;
}

interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
interface NativeCtor {
  new (opts: { formats: BarcodeFormat[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

export async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = (await Native.getSupportedFormats?.()) ?? [];
      const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
      // A browser that lists no EAN / UPC format (some desktop builds) cannot read food labels: use the ponyfill.
      if (formats.some((f) => f !== 'code_128')) {
        const d = new Native({ formats });
        return { read: async (v) => (await d.detect(v))[0]?.rawValue ?? null };
      }
    } catch {
      /* fall through to the ponyfill */
    }
  }
  const [{ BarcodeDetector, setZXingModuleOverrides }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  const wasmUrl = wasm.default;
  setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) });
  const d = new BarcodeDetector({ formats: [...SCAN_FORMATS] });
  return { read: async (v) => (await d.detect(v))[0]?.rawValue ?? null };
}

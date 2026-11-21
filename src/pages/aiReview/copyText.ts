// Copy the AI review text (Phase 40). Clipboard API first; when it is missing or refuses, the text area is selected so the
// person can copy by hand (and `execCommand('copy')` is tried on that selection). Pure of React; the environment is injectable.

export type CopyResult = 'copied' | 'selected';

export interface CopyEnv {
  clipboard?: { writeText(text: string): Promise<void> } | undefined;
  /** The text area holding the text; `select()` highlights all of it. */
  area?: { select(): void; focus?(): void; setSelectionRange?(a: number, b: number): void } | null | undefined;
  /** Legacy copy of the current selection. Returns false when the browser refuses. */
  execCopy?: (() => boolean) | undefined;
}

/** 'copied' = on the clipboard. 'selected' = could not copy; the text is selected in the area for a manual copy. */
export async function copyWithFallback(text: string, env: CopyEnv): Promise<CopyResult> {
  if (env.clipboard) {
    try {
      await env.clipboard.writeText(text);
      return 'copied';
    } catch {
      // fall through to the select-all path
    }
  }
  env.area?.focus?.();
  env.area?.select();
  env.area?.setSelectionRange?.(0, text.length);
  try {
    if (env.execCopy?.()) return 'copied';
  } catch {
    // selection stays; the person copies by hand
  }
  return 'selected';
}

/** The real environment for a screen. */
export function browserCopyEnv(area: HTMLTextAreaElement | null): CopyEnv {
  return {
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
    area,
    execCopy: () => (typeof document !== 'undefined' && typeof document.execCommand === 'function' ? document.execCommand('copy') : false),
  };
}

/** System share sheet, when the browser has one. */
export const canShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

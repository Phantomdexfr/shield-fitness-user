import { en, type StringKey } from './en';

export type { StringKey };

/** Look up a UI string. Unknown keys return the key (visible in review, never a crash). */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const text: string = en[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

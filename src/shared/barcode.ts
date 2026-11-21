// Barcode scanner (Phase 56). Pure: no DOM, no network, no storage, no clock (times are parameters).
// Turns what a person typed or a camera read into one canonical code, reads an Open Food Facts answer into a small product shape,
// works out per-serving numbers, and keeps the "last 50 looked-up products" list. Unknown numbers are null (shown as a dash), never 0.

/** The only host the product lookup may call (docs/security/SECURITY_MODEL.md, connect-src). */
export const OFF_ORIGIN = 'https://world.openfoodfacts.org';
export const OFF_FIELDS = 'code,product_name,product_name_en,brands,quantity,serving_size,serving_quantity,nutriments';
export const CACHE_MAX = 50;

export type BarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'code_128';
/** Formats the scanner asks the detector for. */
export const SCAN_FORMATS: readonly BarcodeFormat[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export type BarcodeError = 'empty' | 'chars' | 'length' | 'checksum';
export type BarcodeResult = { ok: true; code: string; format: 'ean_13' | 'ean_8' } | { ok: false; error: BarcodeError };

/** GS1 check digit: the last digit of `digits` must equal this over the others (weights 3, 1 from the right). */
function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

const validGs1 = (digits: string): boolean => checkDigit(digits.slice(0, -1)) === digits.charCodeAt(digits.length - 1) - 48;

/** UPC-E (8 digits: system 0 or 1, 6 digits, check) to the 12-digit UPC-A it stands for. Null when it is not a UPC-E shape. */
export function upcEToUpcA(e: string): string | null {
  if (!/^[01]\d{7}$/.test(e)) return null;
  const sys = e[0] as string;
  const d = e.slice(1, 7);
  const chk = e[7] as string;
  const last = d[5] as string;
  let body: string;
  if (last === '0' || last === '1' || last === '2') body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === '3') body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === '4') body = `${d.slice(0, 4)}00000${d[4] as string}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  return `${sys}${body}${chk}`;
}

/**
 * One barcode from anything typed or scanned. Spaces and hyphens are ignored; only digits are allowed.
 * 13 digits = EAN-13; 12 = UPC-A (becomes EAN-13 with a leading 0, which is how Open Food Facts stores it);
 * 8 = EAN-8, or a UPC-E when it is not a valid EAN-8 but expands to a valid UPC-A. The check digit must match.
 * A Code-128 label that carries one of these digit strings is read the same way; any other Code-128 text is refused.
 */
export function normalizeBarcode(raw: string): BarcodeResult {
  const s = String(raw ?? '').replace(/[\s-]+/g, '');
  if (s === '') return { ok: false, error: 'empty' };
  if (!/^\d+$/.test(s)) return { ok: false, error: 'chars' };
  if (s.length === 13) return validGs1(s) ? { ok: true, code: s, format: 'ean_13' } : { ok: false, error: 'checksum' };
  if (s.length === 12) return validGs1(s) ? { ok: true, code: `0${s}`, format: 'ean_13' } : { ok: false, error: 'checksum' };
  if (s.length === 8) {
    if (validGs1(s)) return { ok: true, code: s, format: 'ean_8' };
    const a = upcEToUpcA(s);
    if (a !== null && validGs1(a)) return { ok: true, code: `0${a}`, format: 'ean_13' };
    return { ok: false, error: 'checksum' };
  }
  return { ok: false, error: 'length' };
}

/** The lookup address for a canonical code (digits only, so nothing else can be injected). Null when the code is not canonical. */
export function productUrl(code: string): string | null {
  return /^(\d{8}|\d{13})$/.test(code) ? `${OFF_ORIGIN}/api/v2/product/${code}.json?fields=${OFF_FIELDS}` : null;
}

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'salt'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
/** Per 100 g or per serving; a missing number is null. */
export type NutrientSet = Record<Nutrient, number | null>;

export interface Product {
  code: string;
  name: string;
  brand: string | null;
  /** Package size text as printed, e.g. "500 g". */
  quantity: string | null;
  /** Serving text as printed, e.g. "30 g (2 biscuits)". */
  servingText: string | null;
  /** Serving in grams when the source gives it, else null. */
  servingG: number | null;
  per100: NutrientSet;
  /** Per serving: the source's own numbers, else per 100 g x servingG / 100, else null. */
  perServing: NutrientSet;
}

const KEYS: Record<Nutrient, string> = {
  kcal: 'energy-kcal',
  protein: 'proteins',
  carbs: 'carbohydrates',
  fat: 'fat',
  sugar: 'sugars',
  salt: 'salt',
};
const DECIMALS: Record<Nutrient, number> = { kcal: 0, protein: 1, carbs: 1, fat: 1, sugar: 1, salt: 2 };

const round = (v: number, dp: number): number => {
  const m = 10 ** dp;
  return Math.round(v * m + Number.EPSILON * Math.sign(v)) / m;
};

/** A number or a numeric string, 0 or more, finite; anything else is null. */
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s === '' ? null : s.slice(0, max);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Grams out of a serving text such as "30 g" or "1 bar (45g)". Millilitres are not grams, so they give null. */
export function servingGrams(servingQuantity: unknown, servingSize: unknown): number | null {
  const q = num(servingQuantity);
  if (q !== null && q > 0) return q;
  if (typeof servingSize !== 'string') return null;
  const m = /(\d+(?:[.,]\d+)?)\s*g\b/i.exec(servingSize);
  if (!m) return null;
  const g = Number((m[1] as string).replace(',', '.'));
  return Number.isFinite(g) && g > 0 ? g : null;
}

export const emptySet = (): NutrientSet => ({ kcal: null, protein: null, carbs: null, fat: null, sugar: null, salt: null });

/** Per-serving set from a per-100 g set and the serving in grams. Unknown stays null. */
export function scaleToServing(per100: NutrientSet, servingG: number | null): NutrientSet {
  const out = emptySet();
  if (servingG === null || !(servingG > 0)) return out;
  for (const n of NUTRIENTS) {
    const v = per100[n];
    out[n] = v === null ? null : round((v * servingG) / 100, DECIMALS[n]);
  }
  return out;
}

export type ParseError = 'not_found' | 'malformed';
export type ParseResult = { ok: true; product: Product } | { ok: false; error: ParseError };

/** Reads one Open Food Facts v2 product answer. `status` 0 or a missing product is not_found; anything not shaped like an answer is malformed. */
export function parseProduct(json: unknown, code: string): ParseResult {
  if (!isObj(json)) return { ok: false, error: 'malformed' };
  const status = json.status;
  if (status === 0 || status === '0' || status === 'failure') return { ok: false, error: 'not_found' };
  const p = json.product;
  if (p === undefined || p === null) return { ok: false, error: status === 1 || status === '1' ? 'malformed' : 'not_found' };
  if (!isObj(p)) return { ok: false, error: 'malformed' };
  const name = text(p.product_name, 120) ?? text(p.product_name_en, 120);
  if (name === null) return { ok: false, error: 'not_found' };
  const n = isObj(p.nutriments) ? p.nutriments : {};
  const per100 = emptySet();
  const raw100 = emptySet();
  const own = emptySet();
  for (const k of NUTRIENTS) {
    const a = num(n[`${KEYS[k]}_100g`]);
    raw100[k] = a;
    per100[k] = a === null ? null : round(a, DECIMALS[k]);
    const b = num(n[`${KEYS[k]}_serving`]);
    own[k] = b === null ? null : round(b, DECIMALS[k]);
  }
  const servingG = servingGrams(p.serving_quantity, p.serving_size);
  // Scale from the unrounded numbers so a value is rounded once, not twice.
  const scaled = scaleToServing(raw100, servingG);
  const perServing = emptySet();
  for (const k of NUTRIENTS) perServing[k] = own[k] ?? scaled[k];
  return {
    ok: true,
    product: {
      code,
      name,
      brand: text(p.brands, 80),
      quantity: text(p.quantity, 40),
      servingText: text(p.serving_size, 60),
      servingG,
      per100,
      perServing,
    },
  };
}

/** True when a per-serving column has at least one number (otherwise the toggle has nothing to show). */
export const hasServing = (p: Product): boolean => NUTRIENTS.some((k) => p.perServing[k] !== null);

/** Display text of one number: a dash for unknown, never 0. Decimal comma is not used (kg and g follow the rest of the app). */
export const nutrientText = (v: number | null): string => (v === null ? '-' : String(v));

export interface CacheEntry {
  code: string;
  /** UTC ms of the lookup. */
  savedAt: number;
  product: Product;
}

const validSet = (v: unknown): v is NutrientSet => isObj(v) && NUTRIENTS.every((k) => v[k] === null || (typeof v[k] === 'number' && Number.isFinite(v[k] as number)));

function validProduct(v: unknown): v is Product {
  if (!isObj(v)) return false;
  return (
    typeof v.code === 'string' &&
    typeof v.name === 'string' &&
    (v.brand === null || typeof v.brand === 'string') &&
    (v.quantity === null || typeof v.quantity === 'string') &&
    (v.servingText === null || typeof v.servingText === 'string') &&
    (v.servingG === null || typeof v.servingG === 'number') &&
    validSet(v.per100) &&
    validSet(v.perServing)
  );
}

/** Stored cache back into entries: bad rows dropped, newest first, at most 50. */
export function parseCache(raw: unknown): CacheEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CacheEntry[] = [];
  for (const r of raw) {
    if (!isObj(r) || typeof r.code !== 'string' || typeof r.savedAt !== 'number' || !validProduct(r.product)) continue;
    if (out.some((e) => e.code === r.code)) continue;
    out.push({ code: r.code, savedAt: r.savedAt, product: r.product });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt).slice(0, CACHE_MAX);
}

/** Puts a looked-up product first (replacing an older copy of the same code) and drops the oldest beyond 50. Input is not changed. */
export function addToCache(cache: readonly CacheEntry[], product: Product, nowMs: number): CacheEntry[] {
  const rest = cache.filter((e) => e.code !== product.code);
  return [{ code: product.code, savedAt: nowMs, product }, ...rest].slice(0, CACHE_MAX);
}

export const findInCache = (cache: readonly CacheEntry[], code: string): CacheEntry | null => cache.find((e) => e.code === code) ?? null;

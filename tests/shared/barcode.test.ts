import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX, NUTRIENTS, OFF_ORIGIN, addToCache, emptySet, findInCache, hasServing, normalizeBarcode, nutrientText, parseCache, parseProduct,
  productUrl, scaleToServing, servingGrams, upcEToUpcA, type Product,
} from '../../src/shared/barcode';

describe('barcode parsing and manual-entry normalisation', () => {
  it('accepts EAN-13, UPC-A (as EAN-13 with a leading 0), EAN-8 and UPC-E with a good check digit', () => {
    expect(normalizeBarcode('3017620422003')).toEqual({ ok: true, code: '3017620422003', format: 'ean_13' });
    expect(normalizeBarcode('737628064502')).toEqual({ ok: true, code: '0737628064502', format: 'ean_13' });
    expect(normalizeBarcode('96385074')).toEqual({ ok: true, code: '96385074', format: 'ean_8' });
    expect(normalizeBarcode('04252614')).toEqual({ ok: true, code: '0042100005264', format: 'ean_13' });
  });
  it('ignores spaces and hyphens, nothing else', () => {
    expect(normalizeBarcode(' 3017-6204 22003 ')).toEqual({ ok: true, code: '3017620422003', format: 'ean_13' });
    expect(normalizeBarcode('\t0737 628 064 502\n')).toEqual({ ok: true, code: '0737628064502', format: 'ean_13' });
  });
  it('names the problem', () => {
    expect(normalizeBarcode('')).toEqual({ ok: false, error: 'empty' });
    expect(normalizeBarcode('  - ')).toEqual({ ok: false, error: 'empty' });
    expect(normalizeBarcode('30176204220O3')).toEqual({ ok: false, error: 'chars' });
    expect(normalizeBarcode('ABC-123')).toEqual({ ok: false, error: 'chars' });
    expect(normalizeBarcode('12345')).toEqual({ ok: false, error: 'length' });
    expect(normalizeBarcode('301762042200312')).toEqual({ ok: false, error: 'length' });
    expect(normalizeBarcode('3017620422004')).toEqual({ ok: false, error: 'checksum' });
    expect(normalizeBarcode('737628064503')).toEqual({ ok: false, error: 'checksum' });
    expect(normalizeBarcode('96385075')).toEqual({ ok: false, error: 'checksum' });
  });
  it('a Code-128 label with a non-digit text is refused, with digits it is read like any other', () => {
    expect(normalizeBarcode('SHIELD-42')).toEqual({ ok: false, error: 'chars' });
    expect(normalizeBarcode('3017620422003')).toMatchObject({ ok: true });
  });
  it('UPC-E expansion covers every last-digit rule', () => {
    expect(upcEToUpcA('04252614')).toBe('042100005264');
    expect(upcEToUpcA('01234505')).toBe('012000003455');
    expect(upcEToUpcA('01234531')).toBe('012300000451');
    expect(upcEToUpcA('01234542')).toBe('012340000052');
    expect(upcEToUpcA('01234569')).toBe('012345000069');
    expect(upcEToUpcA('21234505')).toBeNull();
    expect(upcEToUpcA('1234')).toBeNull();
  });
  it('the lookup address is the Open Food Facts host only and only for a canonical code', () => {
    const u = productUrl('3017620422003');
    expect(u).not.toBeNull();
    expect(new URL(u as string).origin).toBe('https://world.openfoodfacts.org');
    expect(OFF_ORIGIN).toBe('https://world.openfoodfacts.org');
    expect(u).toContain('/api/v2/product/3017620422003.json?fields=');
    expect(productUrl('3017620422003/../../x')).toBeNull();
    expect(productUrl('12345')).toBeNull();
    expect(productUrl('737628064502')).toBeNull();
  });
});

const answer = (p: Record<string, unknown>, status: unknown = 1) => ({ status, code: '3017620422003', product: p });

describe('Open Food Facts answers', () => {
  it('reads name, brand, pack, serving and per-100 g numbers; unknown is null, never 0', () => {
    const r = parseProduct(answer({
      product_name: '  Hazelnut   spread ', brands: 'Brand A', quantity: '400 g', serving_size: '15 g', serving_quantity: 15,
      nutriments: { 'energy-kcal_100g': 539, proteins_100g: '6.3', carbohydrates_100g: 57.5, fat_100g: 30.9, sugars_100g: 56.3 },
    }), '3017620422003');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.product;
    expect(p.name).toBe('Hazelnut spread');
    expect(p.brand).toBe('Brand A');
    expect(p.quantity).toBe('400 g');
    expect(p.servingG).toBe(15);
    expect(p.per100).toEqual({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugar: 56.3, salt: null });
    expect(nutrientText(p.per100.salt)).toBe('-');
    expect(nutrientText(0)).toBe('0');
  });
  it('per serving: the source\'s own number wins, else per 100 g x serving grams / 100, else null', () => {
    const r = parseProduct(answer({
      product_name: 'Bar', serving_size: '45 g',
      nutriments: { 'proteins_100g': 20, 'proteins_serving': 8.5, 'energy-kcal_100g': 400, fat_100g: 10.55, salt_100g: 0.333 },
    }), '3017620422003');
    if (!r.ok) throw new Error('parse');
    expect(r.product.servingG).toBe(45);
    expect(r.product.perServing.protein).toBe(8.5);
    expect(r.product.perServing.kcal).toBe(180);
    expect(r.product.perServing.fat).toBe(4.7);
    expect(r.product.perServing.salt).toBe(0.15);
    expect(r.product.perServing.carbs).toBeNull();
    expect(hasServing(r.product)).toBe(true);
  });
  it('no serving grams: per serving is all null and the toggle has nothing to show', () => {
    const r = parseProduct(answer({ product_name: 'Drink', serving_size: '250 ml', nutriments: { proteins_100g: 3 } }), '3017620422003');
    if (!r.ok) throw new Error('parse');
    expect(r.product.servingG).toBeNull();
    expect(NUTRIENTS.every((k) => r.product.perServing[k] === null)).toBe(true);
    expect(hasServing(r.product)).toBe(false);
  });
  it('serving grams from text, comma decimals, and ml is not grams', () => {
    expect(servingGrams(undefined, '1 bar (45g)')).toBe(45);
    expect(servingGrams('', '2,5 g')).toBe(2.5);
    expect(servingGrams(undefined, '250 ml')).toBeNull();
    expect(servingGrams(0, '0 g')).toBeNull();
    expect(servingGrams('30', null)).toBe(30);
  });
  it('scaleToServing keeps unknown as null and rounds per nutrient', () => {
    const s = scaleToServing({ ...emptySet(), kcal: 333, protein: 7.77, salt: 1.234 }, 30);
    expect(s).toEqual({ kcal: 100, protein: 2.3, carbs: null, fat: null, sugar: null, salt: 0.37 });
    expect(scaleToServing({ ...emptySet(), kcal: 1 }, null).kcal).toBeNull();
    expect(scaleToServing({ ...emptySet(), kcal: 1 }, 0).kcal).toBeNull();
  });
  it('negative, text and non-finite numbers are unknown', () => {
    const r = parseProduct(answer({ product_name: 'X', nutriments: { proteins_100g: -3, fat_100g: 'abc', sugars_100g: null, 'energy-kcal_100g': Infinity } }), '3017620422003');
    if (!r.ok) throw new Error('parse');
    expect(r.product.per100).toEqual(emptySet());
  });
  it('not found, malformed', () => {
    expect(parseProduct({ status: 0, status_verbose: 'product not found' }, 'x')).toEqual({ ok: false, error: 'not_found' });
    expect(parseProduct({ status: 'failure' }, 'x')).toEqual({ ok: false, error: 'not_found' });
    expect(parseProduct({ status: 1 }, 'x')).toEqual({ ok: false, error: 'malformed' });
    expect(parseProduct({ status: 1, product: 'nope' }, 'x')).toEqual({ ok: false, error: 'malformed' });
    expect(parseProduct(answer({ brands: 'No name' }), 'x')).toEqual({ ok: false, error: 'not_found' });
    for (const bad of [null, undefined, 5, 'text', [], true]) expect(parseProduct(bad, 'x')).toEqual({ ok: false, error: 'malformed' });
  });
});

const prod = (code: string, name = code): Product => ({ code, name, brand: null, quantity: null, servingText: null, servingG: null, per100: emptySet(), perServing: emptySet() });

describe('cache of the last 50 looked-up products', () => {
  it('newest first, a repeat moves to the front without a duplicate', () => {
    let c = addToCache([], prod('a'), 1);
    c = addToCache(c, prod('b'), 2);
    c = addToCache(c, prod('a', 'a2'), 3);
    expect(c.map((e) => e.code)).toEqual(['a', 'b']);
    expect(findInCache(c, 'a')?.product.name).toBe('a2');
    expect(findInCache(c, 'zzz')).toBeNull();
  });
  it('evicts the oldest beyond 50 and does not change its input', () => {
    let c = [] as ReturnType<typeof addToCache>;
    for (let i = 0; i < 60; i++) c = addToCache(c, prod(`c${i}`), i);
    expect(c).toHaveLength(CACHE_MAX);
    expect(c[0]?.code).toBe('c59');
    expect(c[49]?.code).toBe('c10');
    expect(findInCache(c, 'c9')).toBeNull();
    const before = JSON.stringify(c);
    addToCache(c, prod('new'), 99);
    expect(JSON.stringify(c)).toBe(before);
  });
  it('parseCache drops bad rows, duplicates and keeps 50 newest', () => {
    const good = { code: 'a', savedAt: 5, product: prod('a') };
    expect(parseCache(null)).toEqual([]);
    expect(parseCache('x')).toEqual([]);
    expect(parseCache([good, good, { code: 'b' }, { code: 'c', savedAt: 1, product: { name: 1 } }, 7, null])).toEqual([good]);
    const many = Array.from({ length: 70 }, (_, i) => ({ code: `k${i}`, savedAt: i, product: prod(`k${i}`) }));
    const out = parseCache(many);
    expect(out).toHaveLength(50);
    expect(out[0]?.code).toBe('k69');
  });
});

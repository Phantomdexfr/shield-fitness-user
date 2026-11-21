// Units (Phase 12). Pure. Weights are kg with 2 decimals; money is integer paise (display only).

/** Round to 2 decimals, half away from zero, without float noise (1.005 -> 1.01). */
export function roundKg(kg: number): number {
  if (!Number.isFinite(kg)) return 0;
  const sign = kg < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(kg) * 100 + 1e-9)) / 100;
}

const LB_PER_KG = 2.2046226218;

export function kgToLb(kg: number): number {
  return roundKg(kg * LB_PER_KG);
}

export function lbToKg(lb: number): number {
  return roundKg(lb / LB_PER_KG);
}

/** Integer paise -> "1,234.50" style text with Indian digit grouping (12,34,567.00). Integer maths only. */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error('paise must be an integer');
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const r = String(rupees);
  const grouped = r.length <= 3 ? r : `${r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${r.slice(-3)}`;
  return `${neg ? '-' : ''}${grouped}.${rest}`;
}

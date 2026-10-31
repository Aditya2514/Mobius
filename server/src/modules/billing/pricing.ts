// Pure pricing: no database, unit-tested. Order per line: subtotal → discount → tax → total,
// each rounded to 2 places half-up (Backend Blueprint sections 6 and 7).
import { Decimal, r2 } from '../../lib/money';

export { r2 };

export type Disc = { id: bigint; type: 'FIXED' | 'PERCENTAGE'; value: Decimal };

export function discountAmount(sub: Decimal, d?: Disc): Decimal {
  if (!d) return new Decimal(0);
  return d.type === 'FIXED' ? Decimal.min(d.value, sub) : r2(sub.mul(d.value).div(100));
}

export function priceLine(unitPrice: Decimal, qty: number, taxRate: Decimal, d?: Disc) {
  const subtotal = r2(unitPrice.mul(qty));
  const discount = discountAmount(subtotal, d);
  const tax = r2(subtotal.minus(discount).mul(taxRate).div(100));
  return { subtotal, discount, tax, total: subtotal.minus(discount).plus(tax) };
}
// priceLine(1560, 5, 18, 10% off) → 7800 / 780 / 1263.6 / 8283.6

/**
 * FIXED subscription-scope discount split across lines by their subtotals; the rounding
 * remainder goes on the last line (500 over 7,800 / 2,000 / 333.33 → 384.87 + 98.68 + 16.45).
 * Sets `applied` on each line to a FIXED discount of that line's share.
 */
export function allocateFixed<T extends { sub: Decimal; applied?: Disc }>(d: Disc, rest: T[]) {
  const base = rest.reduce((s, w) => s.plus(w.sub), new Decimal(0));
  if (base.isZero()) return;
  const total = Decimal.min(d.value, base);
  let left = total;
  rest.forEach((w, i) => {
    const share = i === rest.length - 1 ? left : r2(total.mul(w.sub).div(base));
    left = left.minus(share);
    w.applied = { id: d.id, type: 'FIXED', value: share };
  });
}

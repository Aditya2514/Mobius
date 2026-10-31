/**
 * Price preview for subscriptions: exactly what the engine would bill today, using the shared
 * selectDiscounts(), but it NEVER claims a usage slot. Prices a whole page of subscriptions with
 * one discounts query, so list endpoints stay free of N+1 queries.
 */
import { Decimal, toDecimal, type MoneyLike } from '../../lib/money';
import { selectDiscounts, type DiscountRule } from '../discounts/discount.eligibility';
import { priceLine } from './pricing';

export { loadDiscountRules } from '../discounts/discount.eligibility';

export type PreviewLine = { product_id: bigint; quantity: number; unit_price: MoneyLike; tax_rate: MoneyLike | null };

export type Totals = { subtotal: Decimal; discountTotal: Decimal; taxTotal: Decimal; total: Decimal };

export function previewTotals(subscriptionId: bigint, lines: PreviewLine[], rules: DiscountRule[]): Totals {
  const applied = selectDiscounts(subscriptionId, lines, rules);
  let subtotal = new Decimal(0), discountTotal = new Decimal(0), taxTotal = new Decimal(0);
  lines.forEach((l, i) => {
    const p = priceLine(toDecimal(l.unit_price), l.quantity, toDecimal(l.tax_rate ?? 0), applied[i]);
    subtotal = subtotal.plus(p.subtotal);
    discountTotal = discountTotal.plus(p.discount);
    taxTotal = taxTotal.plus(p.tax);
  });
  return { subtotal, discountTotal, taxTotal, total: subtotal.minus(discountTotal).plus(taxTotal) };
}

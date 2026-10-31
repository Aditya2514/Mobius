/**
 * Price preview for subscriptions: the same rules the billing engine applies on the invoice
 * date (best single PRODUCT discount per line, then one SUBSCRIPTION discount over the lines
 * left without one), but it NEVER claims a usage slot. Works on a whole page of subscriptions
 * with one discounts query, so list endpoints stay free of N+1 queries.
 */
import type { Prisma } from '@prisma/client';
import { Decimal, toDecimal, type MoneyLike } from '../../lib/money';
import { allocateFixed, discountAmount, priceLine, type Disc } from './pricing';

type Db = Pick<Prisma.TransactionClient, 'discounts'>;

export type DiscountRule = Disc & {
  scope: 'PRODUCT' | 'SUBSCRIPTION';
  minQuantity: number;
  minPurchase: Decimal;
  productIds: Set<bigint>;
  /** SUBSCRIPTION scope with no target rows = every subscription */
  allSubscriptions: boolean;
  subscriptionIds: Set<bigint>;
};

export type PreviewLine = { product_id: bigint; quantity: number; unit_price: MoneyLike; tax_rate: MoneyLike | null };

export type Totals = { subtotal: Decimal; discountTotal: Decimal; taxTotal: Decimal; total: Decimal };

/** Discounts usable on `onDate` (active, in date range, slots left), with targets for these subscriptions. */
export async function loadDiscountRules(db: Db, subscriptionIds: bigint[], onDate: Date): Promise<DiscountRule[]> {
  const rows = await db.discounts.findMany({
    where: {
      is_active: true,
      start_date: { lte: onDate },
      OR: [{ end_date: null }, { end_date: { gte: onDate } }],
    },
    select: {
      id: true, type: true, value: true, scope: true, min_purchase: true, min_quantity: true,
      usage_limit: true, used_count: true,
      discount_products: { select: { product_id: true } },
      discount_subscriptions: { where: { subscription_id: { in: subscriptionIds } }, select: { subscription_id: true } },
      _count: { select: { discount_subscriptions: true } },
    },
  });
  return rows
    .filter((d) => d.usage_limit === null || d.used_count < d.usage_limit)
    .map((d) => ({
      id: d.id,
      type: d.type,
      value: toDecimal(d.value),
      scope: d.scope,
      minQuantity: d.min_quantity,
      minPurchase: toDecimal(d.min_purchase),
      productIds: new Set(d.discount_products.map((p) => p.product_id)),
      allSubscriptions: d._count.discount_subscriptions === 0,
      subscriptionIds: new Set(d.discount_subscriptions.map((s) => s.subscription_id)),
    }));
}

/** best (largest amount) first; ties by id so the result is stable */
const best = (base: Decimal) => (a: DiscountRule, b: DiscountRule) =>
  discountAmount(base, b).cmp(discountAmount(base, a)) || (a.id < b.id ? -1 : 1);

export function previewTotals(subscriptionId: bigint, lines: PreviewLine[], rules: DiscountRule[]): Totals {
  const work = lines.map((line) => {
    const unit = toDecimal(line.unit_price);
    const sub = unit.mul(line.quantity);
    // 1. PRODUCT scope: the best eligible discount for this line
    const applied = rules
      .filter(
        (d) =>
          d.scope === 'PRODUCT' &&
          d.productIds.has(line.product_id) &&
          d.minQuantity <= line.quantity &&
          d.minPurchase.lte(sub),
      )
      .sort(best(sub))[0] as Disc | undefined;
    return { line, unit, sub, applied };
  });

  // 2. SUBSCRIPTION scope covers the lines that got no product discount
  const rest = work.filter((w) => !w.applied);
  if (rest.length > 0) {
    const totalQty = lines.reduce((q, l) => q + l.quantity, 0);
    const totalSub = work.reduce((s, w) => s.plus(w.sub), new Decimal(0));
    const d = rules
      .filter(
        (r) =>
          r.scope === 'SUBSCRIPTION' &&
          (r.allSubscriptions || r.subscriptionIds.has(subscriptionId)) &&
          r.minQuantity <= totalQty &&
          r.minPurchase.lte(totalSub),
      )
      .sort(best(totalSub))[0];
    if (d) {
      if (d.type === 'PERCENTAGE') rest.forEach((w) => { w.applied = d; });
      else allocateFixed(d, rest);
    }
  }

  // 3. price every line; totals are sums of line values
  let subtotal = new Decimal(0), discountTotal = new Decimal(0), taxTotal = new Decimal(0);
  for (const w of work) {
    const p = priceLine(w.unit, w.line.quantity, toDecimal(w.line.tax_rate ?? 0), w.applied);
    subtotal = subtotal.plus(p.subtotal);
    discountTotal = discountTotal.plus(p.discount);
    taxTotal = taxTotal.plus(p.tax);
  }
  return { subtotal, discountTotal, taxTotal, total: subtotal.minus(discountTotal).plus(taxTotal) };
}

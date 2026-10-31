/**
 * The ONE implementation of discount eligibility, used by both the price preview and the
 * billing engine (Backend Blueprint section 6):
 *   1. PRODUCT scope: per line, the best eligible discount (largest amount), no stacking.
 *   2. SUBSCRIPTION scope: one discount over the lines left without a product discount;
 *      PERCENTAGE applies to each of them, FIXED is split by subtotal (remainder on the last line).
 * selectDiscounts() is pure. It never claims a usage slot: the engine claims what it picks with
 * claimSlot() and re-runs the selection without any discount whose claim failed.
 */
import type { Prisma } from '@prisma/client';
import { Decimal, toDecimal, type MoneyLike } from '../../lib/money';
import { allocateFixed, discountAmount, type Disc } from '../billing/pricing';

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

export type SelectionLine = { product_id: bigint; quantity: number; unit_price: MoneyLike };

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

/** best (largest amount) first; ties by id so the choice is stable */
const best = (base: Decimal) => (a: DiscountRule, b: DiscountRule) =>
  discountAmount(base, b).cmp(discountAmount(base, a)) || (a.id < b.id ? -1 : 1);

/** The discount each line gets (same order as `lines`); undefined = none. FIXED subscription shares are per line. */
export function selectDiscounts(subscriptionId: bigint, lines: SelectionLine[], rules: DiscountRule[]): (Disc | undefined)[] {
  const work = lines.map((line) => {
    const sub = toDecimal(line.unit_price).mul(line.quantity);
    const applied = rules
      .filter(
        (d) =>
          d.scope === 'PRODUCT' &&
          d.productIds.has(line.product_id) &&
          d.minQuantity <= line.quantity &&
          d.minPurchase.lte(sub),
      )
      .sort(best(sub))[0] as Disc | undefined;
    return { sub, applied };
  });

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
  return work.map((w) => w.applied);
}

import type { Prisma } from '@prisma/client';
import { fromISODate, toISODate } from '../../lib/dates';
import { AppError, notFound } from '../../lib/errors';
import { toDecimal } from '../../lib/money';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import type { CreateDiscountBody, ListDiscountsQuery, UpdateDiscountBody } from './discount.schema';

const discountInclude = {
  discount_products: { select: { product_id: true } },
  discount_subscriptions: { select: { subscription_id: true } },
} satisfies Prisma.discountsInclude;

type DiscountRow = Prisma.discountsGetPayload<{ include: typeof discountInclude }>;

/** Contract shape: target join rows become productIds / subscriptionIds. */
function toDto({ discount_products, discount_subscriptions, created_by: _createdBy, ...d }: DiscountRow) {
  return {
    ...d,
    productIds: discount_products.map((p) => p.product_id),
    subscriptionIds: discount_subscriptions.map((s) => s.subscription_id),
  };
}

type Rules = {
  type: 'FIXED' | 'PERCENTAGE';
  value: string;
  scope: 'PRODUCT' | 'SUBSCRIPTION';
  startDate: string;
  endDate: string | null;
  productIds: string[];
  subscriptionIds: string[];
};

/** Rules that span several fields. Run on the final values, for create and update alike. */
function checkRules(d: Rules) {
  const bad = (field: string, message: string) => new AppError(400, 'VALIDATION_ERROR', message, { field });
  const value = toDecimal(d.value);
  if (value.lte(0)) throw bad('value', 'Value must be more than 0');
  if (d.type === 'PERCENTAGE' && value.gt(100)) throw bad('value', 'A percentage cannot be more than 100');
  if (d.endDate && d.endDate < d.startDate) throw bad('endDate', 'End date must be on or after the start date');
  if (d.scope === 'PRODUCT' && d.productIds.length === 0) throw bad('productIds', 'Pick at least one product');
  if (d.scope === 'PRODUCT' && d.subscriptionIds.length > 0)
    throw bad('subscriptionIds', 'Product discounts target products, not subscriptions');
  if (d.scope === 'SUBSCRIPTION' && d.productIds.length > 0)
    throw bad('productIds', 'Subscription discounts target subscriptions, not products');
}

async function replaceTargets(tx: Prisma.TransactionClient, discountId: bigint, productIds?: string[], subscriptionIds?: string[]) {
  if (productIds) {
    await tx.discount_products.deleteMany({ where: { discount_id: discountId } });
    await tx.discount_products.createMany({
      data: [...new Set(productIds)].map((id) => ({ discount_id: discountId, product_id: BigInt(id) })),
    });
  }
  if (subscriptionIds) {
    await tx.discount_subscriptions.deleteMany({ where: { discount_id: discountId } });
    await tx.discount_subscriptions.createMany({
      data: [...new Set(subscriptionIds)].map((id) => ({ discount_id: discountId, subscription_id: BigInt(id) })),
    });
  }
}

export async function listDiscounts(q: ListDiscountsQuery) {
  const page = toPage(
    q,
    { createdAt: 'created_at', name: 'name', startDate: 'start_date', endDate: 'end_date', usedCount: 'used_count' },
    '-createdAt',
  );
  const where: Prisma.discountsWhereInput = {
    ...(q.scope ? { scope: q.scope } : {}),
    ...(q.active !== undefined ? { is_active: q.active } : {}),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.discounts.findMany({ where, include: discountInclude, orderBy: page.orderBy, skip: page.skip, take: page.take }),
    prisma.discounts.count({ where }),
  ]);
  return listResult(rows.map(toDto), total, page);
}

export async function getDiscount(id: bigint) {
  const row = await prisma.discounts.findUnique({ where: { id }, include: discountInclude });
  if (!row) throw notFound('Discount');
  return toDto(row);
}

/** Only ADMIN reaches this (route guard); created_by records who. */
export async function createDiscount(body: CreateDiscountBody, adminId: bigint) {
  checkRules(body);
  return prisma.$transaction(async (tx) => {
    const d = await tx.discounts.create({
      data: {
        name: body.name,
        type: body.type,
        value: body.value,
        scope: body.scope,
        min_purchase: body.minPurchase,
        min_quantity: body.minQuantity,
        start_date: fromISODate(body.startDate),
        end_date: body.endDate ? fromISODate(body.endDate) : null,
        usage_limit: body.usageLimit,
        is_active: body.isActive,
        created_by: adminId,
      },
    });
    await replaceTargets(tx, d.id, body.productIds, body.subscriptionIds);
    return toDto(await tx.discounts.findUniqueOrThrow({ where: { id: d.id }, include: discountInclude }));
  });
}

export async function updateDiscount(id: bigint, body: UpdateDiscountBody) {
  return prisma.$transaction(async (tx) => {
    // lock so a billing run can't change used_count between our check and our write
    await tx.$queryRaw`SELECT id FROM discounts WHERE id = ${id} FOR UPDATE`;
    const current = await tx.discounts.findUnique({ where: { id }, include: discountInclude });
    if (!current) throw notFound('Discount');
    const cur = toDto(current);

    checkRules({
      type: body.type ?? cur.type,
      value: body.value ?? cur.value.toString(),
      scope: body.scope ?? cur.scope,
      startDate: body.startDate ?? toISODate(cur.start_date),
      endDate: body.endDate !== undefined ? body.endDate : cur.end_date && toISODate(cur.end_date),
      productIds: body.productIds ?? cur.productIds.map(String),
      subscriptionIds: body.subscriptionIds ?? cur.subscriptionIds.map(String),
    });
    if (body.usageLimit != null && body.usageLimit < cur.used_count) {
      throw new AppError(400, 'BUSINESS_RULE', `Usage limit cannot be below the ${cur.used_count} uses so far`, {
        field: 'usageLimit',
      });
    }

    await tx.discounts.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        value: body.value,
        scope: body.scope,
        min_purchase: body.minPurchase,
        min_quantity: body.minQuantity,
        start_date: body.startDate ? fromISODate(body.startDate) : undefined,
        end_date: body.endDate === undefined ? undefined : body.endDate ? fromISODate(body.endDate) : null,
        usage_limit: body.usageLimit,
        is_active: body.isActive,
      },
    });
    await replaceTargets(tx, id, body.productIds, body.subscriptionIds);
    return toDto(await tx.discounts.findUniqueOrThrow({ where: { id }, include: discountInclude }));
  });
}

import bcrypt from 'bcrypt';
import type { Express } from 'express';
import request from 'supertest';
import { prisma } from './db';

export const PASSWORD = 'Demo@12345';
// cost 4 keeps tests fast; bcrypt.compare works the same for any cost
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';
let seq = 0;

export async function makeUser(role: Role, over: { email?: string; fullName?: string; isActive?: boolean } = {}) {
  seq += 1;
  return prisma.users.create({
    data: {
      email: over.email ?? `${role.toLowerCase()}${seq}@test.local`,
      password_hash: PASSWORD_HASH,
      full_name: over.fullName ?? `${role[0]}${role.slice(1).toLowerCase()} ${seq}`,
      role,
      is_active: over.isActive ?? true,
    },
  });
}
export const makeAdmin = (over = {}) => makeUser('ADMIN', over);
export const makeStaff = (over = {}) => makeUser('STAFF', over);
export const makeCustomer = (over = {}) => makeUser('CUSTOMER', over);

/** Logs in through the real endpoint and returns the access token. */
export async function tokenFor(app: Express, user: { email: string }, password = PASSWORD): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
  if (res.status !== 200) throw new Error(`login failed for ${user.email}: ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

export const makeTax = (rate = 18) =>
  prisma.taxes.create({ data: { name: `GST ${rate}% #${++seq}`, rate: String(rate) } });

export const makeProduct = (over: { name?: string; price?: string | number; taxId?: bigint } = {}) =>
  prisma.products.create({
    data: {
      name: over.name ?? `Product ${++seq}`,
      sales_price: String(over.price ?? 1000),
      default_tax_id: over.taxId ?? null,
    },
  });

type PlanOver = {
  period?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  autoClose?: boolean;
  minQuantity?: number;
  pausable?: boolean;
  closable?: boolean;
  renewable?: boolean;
  availableFrom?: string;
  availableTo?: string;
};
export const makePlan = (over: PlanOver = {}) =>
  prisma.plans.create({
    data: {
      name: `Plan ${++seq}`,
      price: '1000',
      billing_period: over.period ?? 'MONTHLY',
      min_quantity: over.minQuantity ?? 1,
      available_from: new Date(over.availableFrom ?? '2026-01-01'),
      available_to: over.availableTo ? new Date(over.availableTo) : null,
      auto_close: over.autoClose ?? false,
      is_pausable: over.pausable ?? false,
      is_closable: over.closable ?? true,
      is_renewable: over.renewable ?? true,
    },
  });

export const makeVariant = (productId: bigint, attribute: string, value: string, extra: string | number) =>
  prisma.product_variants.create({ data: { product_id: productId, attribute, value, extra_price: String(extra) } });

/** The blueprint's "Seats 10%": PERCENTAGE 10, PRODUCT scope, min 5 seats, 100 uses. */
export function makeDiscount(
  createdBy: bigint,
  over: {
    name?: string; type?: 'FIXED' | 'PERCENTAGE'; value?: string; scope?: 'PRODUCT' | 'SUBSCRIPTION';
    productIds?: bigint[]; subscriptionIds?: bigint[]; minQuantity?: number; minPurchase?: string;
    startDate?: string; endDate?: string; usageLimit?: number | null; usedCount?: number;
  } = {},
) {
  return prisma.discounts.create({
    data: {
      name: over.name ?? 'Seats 10%',
      type: over.type ?? 'PERCENTAGE',
      value: over.value ?? '10',
      scope: over.scope ?? 'PRODUCT',
      min_quantity: over.minQuantity ?? 5,
      min_purchase: over.minPurchase ?? '0',
      start_date: new Date(over.startDate ?? '2026-10-01'),
      end_date: over.endDate ? new Date(over.endDate) : null,
      usage_limit: over.usageLimit === undefined ? 100 : over.usageLimit,
      used_count: over.usedCount ?? 0,
      created_by: createdBy,
      discount_products: { create: (over.productIds ?? []).map((product_id) => ({ product_id })) },
      discount_subscriptions: { create: (over.subscriptionIds ?? []).map((subscription_id) => ({ subscription_id })) },
    },
  });
}

export async function makeActiveSub(customerId: bigint, over: { startDate?: string; nextBillingDate?: string } = {}) {
  const plan = await makePlan();
  const start = new Date(over.startDate ?? '2026-11-01');
  return prisma.subscriptions.create({
    data: {
      customer_id: customerId,
      plan_id: plan.id,
      status: 'ACTIVE',
      start_date: start,
      next_billing_date: new Date(over.nextBillingDate ?? start.toISOString().slice(0, 10)),
    },
  });
}

/**
 * Test fixture only: a confirmed invoice row for ownership tests.
 * Application code creates invoices exclusively through the billing engine (AGENTS.md rule 4);
 * once the engine exists, billing tests use it instead of this.
 */
export async function makeInvoiceFixture(sub: { id: bigint; customer_id: bigint }) {
  const customer = await prisma.users.findUniqueOrThrow({ where: { id: sub.customer_id } });
  return prisma.invoices.create({
    data: {
      subscription_id: sub.id,
      customer_id: sub.customer_id,
      period_start: new Date('2026-11-01'),
      period_end: new Date('2026-12-01'),
      invoice_date: new Date('2026-11-01'),
      due_date: new Date('2026-11-16'),
      status: 'CONFIRMED',
      subtotal: '1000.00',
      discount_total: '0.00',
      tax_total: '180.00',
      total: '1180.00',
      bill_to_name: customer.full_name,
      bill_to_email: customer.email,
    },
  });
}

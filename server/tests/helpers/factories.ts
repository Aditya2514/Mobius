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

export const makePlan = (over: { period?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; autoClose?: boolean } = {}) =>
  prisma.plans.create({
    data: {
      name: `Plan ${++seq}`,
      price: '1000',
      billing_period: over.period ?? 'MONTHLY',
      available_from: new Date('2026-01-01'),
      auto_close: over.autoClose ?? false,
    },
  });

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

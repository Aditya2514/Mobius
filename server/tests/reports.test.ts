import { addMonths, format, startOfMonth } from 'date-fns';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { todayIST, toISODate } from '../src/lib/dates';
import { billOne } from '../src/modules/billing/engine';
import { prisma, resetDb } from './helpers/db';
import { makeActiveSub, makeCustomer, makePlan, makeProduct, makeStaff, tokenFor } from './helpers/factories';

const app = createApp();
const api = '/api/v1';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let staff: string;
let customer: string;
beforeEach(async () => {
  await resetDb();
  staff = await tokenFor(app, await makeStaff());
  customer = await tokenFor(app, await makeCustomer());
});
afterAll(() => prisma.$disconnect());

/** an ACTIVE subscription with one 1,000-per-unit line (no tax), billed once on `day` and confirmed */
async function billed(planPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY', qty: number, day: string) {
  const owner = await makeCustomer();
  const product = await makeProduct({ price: 1000 });
  const plan = await makePlan({ period: planPeriod });
  const sub = await makeActiveSub(owner.id, {
    planId: plan.id, startDate: day, lines: [{ productId: product.id, quantity: qty, unitPrice: '1000.00' }],
  });
  await prisma.$transaction((tx) => billOne(tx, sub.id, D(day)));
  const inv = await prisma.invoices.findFirstOrThrow({ where: { subscription_id: sub.id } });
  await prisma.invoices.update({ where: { id: inv.id }, data: { status: 'CONFIRMED', confirmed_at: new Date() } });
  return { plan, sub, inv };
}

async function pay(invoiceId: bigint, amount: string, paidOn: string) {
  const res = await request(app).post(`${api}/invoices/${invoiceId}/payments`).set(bearer(staff)).send({ method: 'UPI', amount, paidOn });
  expect(res.status).toBe(201);
}

describe('reports', () => {
  it('summary: active count, this month\'s revenue, outstanding, overdue, MRR', async () => {
    const today = toISODate(todayIST());
    const monthly = await billed('MONTHLY', 2, '2026-09-01'); // 2,000, due 16 Sep → overdue
    await billed('YEARLY', 12, today); // 12,000 per year → MRR 1,000; due in 15 days
    await pay(monthly.inv.id, '500.00', today); // partial: still overdue

    const res = await request(app).get(`${api}/reports/summary`).set(bearer(staff));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeSubscriptions: 2,
      revenueThisMonth: '500.00',
      outstanding: '13500.00', // 1,500 + 12,000
      overdueCount: 1,
      overdueAmount: '1500.00',
      mrr: '3000.00', // 2,000 monthly + 12,000 / 12
    });
  });

  it('subscriptions-by-plan normalises every period to a month', async () => {
    const d = await billed('DAILY', 1, '2026-10-01'); // 1,000/day × 365 / 12 = 30,416.67
    const w = await billed('WEEKLY', 3, '2026-10-01'); // 3,000/week × 52 / 12 = 13,000.00
    const res = await request(app).get(`${api}/reports/subscriptions-by-plan`).set(bearer(staff));
    const byId = Object.fromEntries(res.body.map((p: { planId: string }) => [p.planId, p]));
    expect(byId[d.plan.id.toString()]).toMatchObject({ billingPeriod: 'DAILY', active: 1, mrr: '30416.67' });
    expect(byId[w.plan.id.toString()]).toMatchObject({ billingPeriod: 'WEEKLY', active: 1, mrr: '13000.00' });
    const summary = await request(app).get(`${api}/reports/summary`).set(bearer(staff));
    expect(summary.body.mrr).toBe('43416.67'); // the card equals the sum of the chart
  });

  it('revenue by month includes empty months as 0.00', async () => {
    const a = await billed('MONTHLY', 5, '2026-08-01');
    await pay(a.inv.id, '1000.00', '2026-08-20');
    await pay(a.inv.id, '1500.00', '2026-10-02');
    const res = await request(app).get(`${api}/reports/revenue?from=2026-08-01&to=2026-10-31`).set(bearer(staff));
    expect(res.body).toEqual([
      { month: '2026-08', amount: '1000.00' },
      { month: '2026-09', amount: '0.00' },
      { month: '2026-10', amount: '1500.00' },
    ]);
    // default: the last 12 months
    const def = await request(app).get(`${api}/reports/revenue`).set(bearer(staff));
    expect(def.body).toHaveLength(12);
    expect(def.body[11].month).toBe(format(todayIST(), 'yyyy-MM'));
    expect(def.body[0].month).toBe(format(addMonths(startOfMonth(todayIST()), -11), 'yyyy-MM'));
  });

  it('overdue list: oldest first, with days overdue and balance', async () => {
    const older = await billed('MONTHLY', 1, '2026-08-01'); // due 16 Aug
    const newer = await billed('MONTHLY', 3, '2026-09-01'); // due 16 Sep
    await billed('MONTHLY', 1, toISODate(todayIST())); // not due yet
    const res = await request(app).get(`${api}/reports/overdue`).set(bearer(staff));
    expect(res.body.total).toBe(2);
    expect(res.body.data.map((i: { id: string }) => i.id)).toEqual([older.inv.id, newer.inv.id].map(String));
    const days = Math.round((todayIST().getTime() - D('2026-08-16').getTime()) / 86_400_000);
    expect(res.body.data[0]).toMatchObject({ dueDate: '2026-08-16', daysOverdue: days, balanceDue: '1000.00' });
  });

  it('customers cannot see reports', async () => {
    for (const path of ['summary', 'revenue', 'overdue', 'subscriptions-by-plan']) {
      expect((await request(app).get(`${api}/reports/${path}`).set(bearer(customer))).status).toBe(403);
    }
  });
});

import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { toISODate } from '../src/lib/dates';
import { billOne, runBilling } from '../src/modules/billing/engine';
import { transition } from '../src/modules/subscriptions/subscription.service';
import { prisma, resetDb } from './helpers/db';
import {
  makeActiveSub, makeAdmin, makeCustomer, makeDiscount, makePlan, makeProduct, makeStaff, makeTax, makeVariant, tokenFor,
} from './helpers/factories';

const app = createApp();
const api = '/api/v1';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => toISODate(d);

let c: Awaited<ReturnType<typeof setup>>;

/** CRM Pro 1,000 + Brand Odoo 560 (= 1,560), GST 18%, a monthly plan. */
async function setup() {
  const admin = await makeAdmin();
  const customer = await makeCustomer({ fullName: 'Acme Ops' });
  const customer2 = await makeCustomer({ fullName: 'Globex Finance' });
  const gst = await makeTax(18);
  const crm = await makeProduct({ name: 'CRM Pro', price: 1000, taxId: gst.id });
  const odoo = await makeVariant(crm.id, 'Brand', 'Odoo', 560);
  const plan = await makePlan({ period: 'MONTHLY', pausable: true });
  return { admin, customer, customer2, gst, crm, odoo, plan };
}

/** 5 × CRM Pro (Odoo) @ 1,560 with GST 18%: the ₹8,283.60 example when Seats 10% applies */
const crmLines = (qty = 5) => [{ productId: c.crm.id, variantId: c.odoo.id, quantity: qty, unitPrice: '1560.00', taxId: c.gst.id }];

const sub = (over: Parameters<typeof makeActiveSub>[1] = {}, customerId = c.customer.id) =>
  makeActiveSub(customerId, { planId: c.plan.id, lines: crmLines(), ...over });

const invoicesOf = (subscriptionId: bigint) =>
  prisma.invoices.findMany({ where: { subscription_id: subscriptionId }, orderBy: { period_start: 'asc' }, include: { invoice_lines: { orderBy: { id: 'asc' } } } });

const periods = (invs: { period_start: Date; period_end: Date }[]) => invs.map((i) => `${iso(i.period_start)}→${iso(i.period_end)}`);

beforeEach(async () => {
  await resetDb();
  c = await setup();
});
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

describe('no double billing', () => {
  it('#3 runBilling twice on the same date → exactly 1 invoice, second run is a clean no-op', async () => {
    const s = await sub();
    const first = await runBilling(D('2026-11-01'));
    expect(first).toEqual({ invoicesCreated: 1, closed: 0, errors: [] });
    const second = await runBilling(D('2026-11-01'));
    expect(second).toEqual({ invoicesCreated: 0, closed: 0, errors: [] });

    // even if next_billing_date were rewound (say, a crash before it was saved), the period is not billed again
    await prisma.subscriptions.update({ where: { id: s.id }, data: { next_billing_date: D('2026-11-01') } });
    const third = await runBilling(D('2026-11-01'));
    expect(third).toEqual({ invoicesCreated: 0, closed: 0, errors: [] });
    expect(await prisma.invoices.count()).toBe(1);
    expect(iso((await prisma.subscriptions.findUniqueOrThrow({ where: { id: s.id } })).next_billing_date!)).toBe('2026-12-01');
  });

  it('#4 two runBilling calls in parallel → exactly 1 invoice and 1 discount use', async () => {
    const disc = await makeDiscount(c.admin.id, { productIds: [c.crm.id] });
    await sub();
    const [a, b] = await Promise.all([runBilling(D('2026-11-01')), runBilling(D('2026-11-01'))]);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.invoicesCreated + b.invoicesCreated).toBe(1);
    expect(await prisma.invoices.count()).toBe(1);
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: disc.id } })).used_count).toBe(1);
  });
});

describe('no skipped periods, correct dates', () => {
  it('#5 next billing date 3 months back → 3 invoices for consecutive periods', async () => {
    const s = await sub({ startDate: '2026-08-01' });
    const res = await runBilling(D('2026-10-15'));
    expect(res.invoicesCreated).toBe(3);
    const invs = await invoicesOf(s.id);
    expect(periods(invs)).toEqual(['2026-08-01→2026-09-01', '2026-09-01→2026-10-01', '2026-10-01→2026-11-01']);
    // invoiced on the run date, due run date + 15 days
    expect(invs.every((i) => iso(i.invoice_date) === '2026-10-15' && iso(i.due_date) === '2026-10-30')).toBe(true);
    expect(iso((await prisma.subscriptions.findUniqueOrThrow({ where: { id: s.id } })).next_billing_date!)).toBe('2026-11-01');
  });

  it('#6 start 31 Jan, monthly → periods start 31 Jan, 28 Feb, 31 Mar', async () => {
    const s = await sub({ startDate: '2026-01-31' });
    await runBilling(D('2026-03-31'));
    expect(periods(await invoicesOf(s.id))).toEqual([
      '2026-01-31→2026-02-28', '2026-02-28→2026-03-31', '2026-03-31→2026-04-30',
    ]);
  });

  it('#7 expiry inside the billing window → no invoice starts after the expiry date', async () => {
    const s = await sub({ startDate: '2026-08-01', expiryDate: '2026-09-15' });
    await runBilling(D('2026-10-15'));
    const invs = await invoicesOf(s.id);
    expect(periods(invs)).toEqual(['2026-08-01→2026-09-01', '2026-09-01→2026-10-01']);
    expect(invs.every((i) => i.period_start <= D('2026-09-15'))).toBe(true);
  });

  it('#8 PAUSED subscription on billing day → no invoice', async () => {
    const s = await sub({ status: 'PAUSED' });
    expect((await runBilling(D('2026-11-01'))).invoicesCreated).toBe(0);
    expect(await prisma.invoices.count({ where: { subscription_id: s.id } })).toBe(0);
  });

  it('pause 10–20 Jan → billing anchor shifts 10 days; the 11 Feb invoice covers [11 Feb, 11 Mar)', async () => {
    const staff = await makeStaff();
    const actor = { id: staff.id.toString(), role: 'STAFF' as const };
    const s = await sub({ startDate: '2026-01-01' });
    await runBilling(D('2026-01-01')); // January, billed in advance

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-10T06:00:00Z'));
    await transition(s.id, 'pause', actor);
    vi.setSystemTime(new Date('2026-01-20T06:00:00Z'));
    const resumed = await transition(s.id, 'resume', actor);
    vi.useRealTimers();
    expect(iso(resumed.nextBillingDate as Date)).toBe('2026-02-11');
    const row = await prisma.subscriptions.findUniqueOrThrow({ where: { id: s.id } });
    expect(iso(row.billing_anchor!)).toBe('2026-01-11');
    expect(iso(row.start_date)).toBe('2026-01-01'); // the contract start never moves

    expect((await runBilling(D('2026-02-10'))).invoicesCreated).toBe(0);
    expect((await runBilling(D('2026-02-11'))).invoicesCreated).toBe(1);
    await runBilling(D('2026-03-11'));
    expect(periods(await invoicesOf(s.id))).toEqual([
      '2026-01-01→2026-02-01', '2026-02-11→2026-03-11', '2026-03-11→2026-04-11',
    ]);
  });
});

describe('discounts at billing time', () => {
  it('#9 discount at 99/100, two subscriptions billed at once → only one discounted, used_count = 100', async () => {
    const disc = await makeDiscount(c.admin.id, { productIds: [c.crm.id], usedCount: 99, usageLimit: 100 });
    const s1 = await sub();
    const s2 = await sub({}, c.customer2.id);
    const day = D('2026-11-01');

    // A claims the last slot and holds its transaction open...
    let aBilled!: () => void;
    let releaseA!: () => void;
    const aDone = new Promise<void>((r) => (aBilled = r));
    const gate = new Promise<void>((r) => (releaseA = r));
    const txA = prisma.$transaction(async (tx) => {
      const n = await billOne(tx, s1.id, day);
      aBilled();
      await gate;
      return n;
    }, { timeout: 20_000 });
    await aDone;
    // ...B read 99/100 too and is now blocked on the discount row, about to try the same slot
    const txB = prisma.$transaction((tx) => billOne(tx, s2.id, day), { timeout: 20_000 });
    await waitForLockWait();
    releaseA();

    expect(await Promise.all([txA, txB])).toEqual([1, 1]);
    const lines = await prisma.invoice_lines.findMany({ orderBy: { id: 'asc' } });
    expect(lines.map((l) => l.discount_amount.toFixed(2)).sort()).toEqual(['0.00', '780.00']);
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: disc.id } })).used_count).toBe(100);
    expect(await prisma.discount_redemptions.count()).toBe(1);
  });

  it('#10 discount outside its dates → not applied', async () => {
    const ended = await makeDiscount(c.admin.id, { productIds: [c.crm.id], endDate: '2026-10-31' });
    const future = await makeDiscount(c.admin.id, { name: 'Later', productIds: [c.crm.id], startDate: '2026-11-02' });
    const s = await sub();
    await runBilling(D('2026-11-01'));
    const [inv] = await invoicesOf(s.id);
    expect(inv.discount_total.toFixed(2)).toBe('0.00');
    expect(inv.total.toFixed(2)).toBe('9204.00'); // 7800 + 18%
    for (const d of [ended, future]) expect((await prisma.discounts.findUniqueOrThrow({ where: { id: d.id } })).used_count).toBe(0);
  });

  it('#11 line quantity below the discount minimum → not applied', async () => {
    const disc = await makeDiscount(c.admin.id, { productIds: [c.crm.id], minQuantity: 5 });
    const s = await sub({ lines: crmLines(4) });
    await runBilling(D('2026-11-01'));
    const [inv] = await invoicesOf(s.id);
    expect(inv.invoice_lines[0].discount_id).toBeNull();
    expect(inv.total.toFixed(2)).toBe('7363.20'); // 6240 + 18%
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: disc.id } })).used_count).toBe(0);
  });

  it('#21 FIXED ₹500 subscription discount over three lines → 384.87 + 98.68 + 16.45, one use', async () => {
    const helpdesk = await makeProduct({ name: 'Helpdesk', price: 1000, taxId: c.gst.id });
    const storage = await makeProduct({ name: 'Storage', price: '333.33', taxId: c.gst.id });
    const disc = await makeDiscount(c.admin.id, {
      name: 'Loyalty ₹500', type: 'FIXED', value: '500', scope: 'SUBSCRIPTION', minQuantity: 0,
    });
    const s = await sub({
      lines: [
        ...crmLines(5), // 7,800
        { productId: helpdesk.id, quantity: 2, unitPrice: '1000.00', taxId: c.gst.id }, // 2,000
        { productId: storage.id, quantity: 1, unitPrice: '333.33', taxId: c.gst.id }, // 333.33
      ],
    });
    await runBilling(D('2026-11-01'));
    const [inv] = await invoicesOf(s.id);
    expect(inv.invoice_lines.map((l) => l.discount_amount.toFixed(2))).toEqual(['384.87', '98.68', '16.45']);
    expect(inv.discount_total.toFixed(2)).toBe('500.00');
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: disc.id } })).used_count).toBe(1);
    const red = await prisma.discount_redemptions.findMany();
    expect(red.map((r) => r.amount.toFixed(2))).toEqual(['500.00']);
  });
});

describe('auto-close', () => {
  it('#12 auto_close plan, expiry passed → CLOSED with a history row', async () => {
    const plan = await makePlan({ autoClose: true });
    const s = await sub({ planId: plan.id, startDate: '2026-10-01', expiryDate: '2026-10-31', nextBillingDate: '2026-11-01' });
    const res = await runBilling(D('2026-11-01'));
    expect(res).toMatchObject({ invoicesCreated: 0, closed: 1, errors: [] });
    const row = await prisma.subscriptions.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe('CLOSED');
    expect(row.closed_at).not.toBeNull();
    const history = await prisma.subscription_status_history.findMany({ where: { subscription_id: s.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ from_status: 'ACTIVE', to_status: 'CLOSED', changed_by: null });
  });
});

describe('preview equals invoice', () => {
  async function previewOf(id: bigint) {
    const staff = await tokenFor(app, await makeStaff());
    return (await request(app).get(`${api}/subscriptions/${id}`).set(bearer(staff))).body.preview;
  }
  type Money = { toFixed(n: number): string };
  const totalsOf = (i: { subtotal: Money; discount_total: Money; tax_total: Money; total: Money }) => ({
    subtotal: i.subtotal.toFixed(2),
    discountTotal: i.discount_total.toFixed(2),
    taxTotal: i.tax_total.toFixed(2),
    total: i.total.toFixed(2),
  });

  it('the ₹8,283.60 example: preview and invoice agree, and only the invoice uses a slot', async () => {
    const disc = await makeDiscount(c.admin.id, { productIds: [c.crm.id], usedCount: 3 });
    const s = await sub();
    const preview = await previewOf(s.id);
    expect(preview).toEqual({ subtotal: '7800.00', discountTotal: '780.00', taxTotal: '1263.60', total: '8283.60' });
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: disc.id } })).used_count).toBe(3);

    await runBilling(D('2026-11-01'));
    const [inv] = await invoicesOf(s.id);
    expect(totalsOf(inv)).toEqual(preview);
    expect(inv.invoice_lines[0].description).toBe('CRM Pro (Brand: Odoo)');
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: disc.id } })).used_count).toBe(4);
  });

  it('the ₹500 split: preview and invoice agree', async () => {
    const extra = await makeProduct({ name: 'Helpdesk', price: 1000, taxId: c.gst.id });
    await makeDiscount(c.admin.id, { name: 'Loyalty ₹500', type: 'FIXED', value: '500', scope: 'SUBSCRIPTION', minQuantity: 0 });
    const s = await sub({ lines: [...crmLines(5), { productId: extra.id, quantity: 2, unitPrice: '1000.00', taxId: c.gst.id }] });
    const preview = await previewOf(s.id);
    await runBilling(D('2026-11-01'));
    const [inv] = await invoicesOf(s.id);
    expect(totalsOf(inv)).toEqual(preview);
    expect(preview.discountTotal).toBe('500.00');
  });
});

describe('billing endpoints', () => {
  it('POST /billing/run is ADMIN only, refuses future dates, and logs the run', async () => {
    await sub({ startDate: '2026-10-01' });
    const staff = await tokenFor(app, await makeStaff());
    expect((await request(app).post(`${api}/billing/run`).set(bearer(staff)).send({ date: '2026-10-01' })).status).toBe(403);

    const admin = await tokenFor(app, c.admin);
    expect((await request(app).post(`${api}/billing/run`).set(bearer(admin)).send({ date: '2099-01-01' })).status).toBe(400);
    const res = await request(app).post(`${api}/billing/run`).set(bearer(admin)).send({ date: '2026-10-01' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ invoicesCreated: 1, closed: 0, errors: [] });

    const runs = await request(app).get(`${api}/billing/runs`).set(bearer(admin));
    expect(runs.body.data[0]).toMatchObject({
      runDate: '2026-10-01', invoicesCreated: 1, subscriptionsClosed: 0, errors: [], triggeredBy: { id: c.admin.id.toString() },
    });
  });

  it('POST /subscriptions/:id/invoice bills one subscription, idempotently; customers cannot', async () => {
    const s = await sub({ startDate: '2026-10-01' });
    const staff = await tokenFor(app, await makeStaff());
    const first = await request(app).post(`${api}/subscriptions/${s.id}/invoice`).set(bearer(staff));
    expect(first.status).toBe(200);
    expect(first.body.invoicesCreated).toBeGreaterThanOrEqual(1);
    const again = await request(app).post(`${api}/subscriptions/${s.id}/invoice`).set(bearer(staff));
    expect(again.body).toEqual({ invoicesCreated: 0 });

    const customer = await tokenFor(app, c.customer);
    expect((await request(app).post(`${api}/subscriptions/${s.id}/invoice`).set(bearer(customer))).status).toBe(403);
  });
});

/** wait until some session in this database is blocked on a row lock */
async function waitForLockWait() {
  for (let i = 0; i < 100; i++) {
    const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (n > 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('the second billing transaction never blocked on the discount row');
}

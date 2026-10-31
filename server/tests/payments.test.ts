import { addDays } from 'date-fns';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { todayIST, toISODate } from '../src/lib/dates';
import { billOne } from '../src/modules/billing/engine';
import { prisma, resetDb } from './helpers/db';
import {
  makeActiveSub, makeAdmin, makeCustomer, makeDiscount, makePlan, makeProduct, makeStaff, makeTax, makeVariant, tokenFor,
} from './helpers/factories';

const app = createApp();
const api = '/api/v1';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let c: Awaited<ReturnType<typeof setup>>;

/** CRM Pro (Odoo) × 5 @ 1,560, GST 18%, Seats 10% → every invoice is ₹8,283.60 */
async function setup() {
  const admin = await makeAdmin();
  const staffUser = await makeStaff();
  const acme = await makeCustomer({ fullName: 'Acme Ops' });
  const globex = await makeCustomer({ fullName: 'Globex Finance' });
  const gst = await makeTax(18);
  const crm = await makeProduct({ name: 'CRM Pro', price: 1000, taxId: gst.id });
  const odoo = await makeVariant(crm.id, 'Brand', 'Odoo', 560);
  const plan = await makePlan();
  const discount = await makeDiscount(admin.id, { productIds: [crm.id] });
  return {
    admin, staffUser, acme, globex, gst, crm, odoo, plan, discount,
    staff: await tokenFor(app, staffUser),
    acmeToken: await tokenFor(app, acme),
  };
}

/** an invoice made by the real billing engine (DRAFT), billing only this new subscription on `day` */
async function billedInvoice(customerId = c.acme.id, day = '2026-10-01', unitPrice = '1560.00') {
  const sub = await makeActiveSub(customerId, {
    planId: c.plan.id, startDate: day,
    lines: [{ productId: c.crm.id, variantId: c.odoo.id, quantity: 5, unitPrice, taxId: c.gst.id }],
  });
  expect(await prisma.$transaction((tx) => billOne(tx, sub.id, D(day)))).toBe(1);
  return prisma.invoices.findFirstOrThrow({ where: { subscription_id: sub.id } });
}

const confirm = (id: bigint | string) => request(app).post(`${api}/invoices/${id}/confirm`).set(bearer(c.staff));
const pay = (id: bigint | string, amount: string, method = 'UPI', token = c.staff) =>
  request(app).post(`${api}/invoices/${id}/payments`).set(bearer(token)).send({ method, amount, paidOn: '2026-10-05' });
const invoice = (id: bigint | string, token = c.staff) => request(app).get(`${api}/invoices/${id}`).set(bearer(token));

beforeEach(async () => {
  await resetDb();
  c = await setup();
});
afterAll(() => prisma.$disconnect());

describe('recording payments (section 7)', () => {
  it('#13 two partial payments summing to the total → PAID with paid_at set', async () => {
    const inv = await billedInvoice();
    expect(inv.total.toFixed(2)).toBe('8283.60');
    expect((await confirm(inv.id)).body.status).toBe('CONFIRMED');

    const first = await pay(inv.id, '5000', 'UPI');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      method: 'UPI',
      amount: '5000.00',
      paidOn: '2026-10-05',
      recordedBy: { id: c.staffUser.id.toString(), name: c.staffUser.full_name },
    });
    expect((await invoice(inv.id)).body).toMatchObject({ status: 'CONFIRMED', amountPaid: '5000.00', balanceDue: '3283.60' });

    expect((await pay(inv.id, '3283.60', 'BANK_TRANSFER')).status).toBe(201);
    const done = await invoice(inv.id);
    expect(done.body).toMatchObject({ status: 'PAID', amountPaid: '8283.60', balanceDue: '0.00', isOverdue: false });
    expect(done.body.payments.map((p: { amount: string }) => p.amount)).toEqual(['5000.00', '3283.60']);
    const row = await prisma.invoices.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.paid_at).not.toBeNull();

    // PAID is final: no more payments
    expect((await pay(inv.id, '1')).status).toBe(400);
  });

  it('#14 payment above the balance → 400 and nothing saved', async () => {
    const inv = await billedInvoice();
    await confirm(inv.id);
    const over = await pay(inv.id, '8283.61');
    expect(over.status).toBe(400);
    expect(over.body.error).toMatchObject({ code: 'BUSINESS_RULE', message: 'Amount must be between 0.01 and 8283.60' });
    expect(await prisma.payments.count()).toBe(0);
    expect((await prisma.invoices.findUniqueOrThrow({ where: { id: inv.id } })).amount_paid.toFixed(2)).toBe('0.00');

    // after a partial payment the limit is the remaining balance
    await pay(inv.id, '5000');
    expect((await pay(inv.id, '3283.61')).status).toBe(400);
    expect(await prisma.payments.count()).toBe(1);
    expect((await invoice(inv.id)).body).toMatchObject({ status: 'CONFIRMED', amountPaid: '5000.00' });
  });

  it('a payment dated after today (India date) → 400 on paidOn; earlier dates are fine', async () => {
    const inv = await billedInvoice();
    await confirm(inv.id);
    const tomorrow = toISODate(addDays(todayIST(), 1));
    const res = await request(app).post(`${api}/invoices/${inv.id}/payments`).set(bearer(c.staff))
      .send({ method: 'UPI', amount: '100', paidOn: tomorrow });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { field: 'paidOn' } });
    const today = await request(app).post(`${api}/invoices/${inv.id}/payments`).set(bearer(c.staff))
      .send({ method: 'UPI', amount: '100', paidOn: toISODate(todayIST()) });
    expect(today.status).toBe(201);
  });

  it('#15 payment on a DRAFT invoice → 400', async () => {
    const inv = await billedInvoice();
    const res = await pay(inv.id, '100');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
    expect(await prisma.payments.count()).toBe(0);
  });

  it('two payments at the same moment cannot both take the same balance', async () => {
    const inv = await billedInvoice();
    await confirm(inv.id);
    const results = await Promise.all([pay(inv.id, '5000'), pay(inv.id, '5000')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const row = await prisma.invoices.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.amount_paid.toFixed(2)).toBe('5000.00');
    const sum = await prisma.payments.aggregate({ _sum: { amount: true } });
    expect(sum._sum.amount!.toFixed(2)).toBe('5000.00');
  });

  it('only staff record payments; customers list payments on their own invoices only', async () => {
    const mine = await billedInvoice();
    const theirs = await billedInvoice(c.globex.id);
    await confirm(mine.id);
    await confirm(theirs.id);
    expect((await pay(mine.id, '100', 'UPI', c.acmeToken)).status).toBe(403);
    await pay(mine.id, '100');
    await pay(theirs.id, '200');

    const asCustomer = await request(app).get(`${api}/payments`).set(bearer(c.acmeToken));
    expect(asCustomer.body.total).toBe(1);
    expect(asCustomer.body.data[0]).toMatchObject({ invoiceId: mine.id.toString(), amount: '100.00' });
    expect(asCustomer.body.data[0].recordedBy).toBeUndefined();
    const asStaff = await request(app).get(`${api}/payments?method=UPI`).set(bearer(c.staff));
    expect(asStaff.body.total).toBe(2);
    expect(asStaff.body.data[0].recordedBy).toMatchObject({ id: c.staffUser.id.toString() });
  });
});

describe('invoice status changes', () => {
  it('confirm needs a DRAFT with lines and a total above zero', async () => {
    const inv = await billedInvoice();
    expect((await confirm(inv.id)).status).toBe(200);
    const again = await confirm(inv.id);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');

    const free = await billedInvoice(c.globex.id, '2026-10-01', '0.00');
    const zero = await confirm(free.id);
    expect(zero.status).toBe(400);
    expect(zero.body.error.code).toBe('BUSINESS_RULE');
  });

  it('bulk-confirm confirms the drafts and explains the rest', async () => {
    const a = await billedInvoice();
    const b = await billedInvoice(c.globex.id);
    await confirm(b.id);
    const res = await request(app).post(`${api}/invoices/bulk-confirm`).set(bearer(c.staff))
      .send({ ids: [a.id.toString(), b.id.toString(), '999999'] });
    expect(res.status).toBe(200);
    expect(res.body.confirmed).toEqual([a.id.toString()]);
    expect(res.body.skipped).toEqual([
      { id: b.id.toString(), reason: 'Only a draft invoice can be confirmed' },
      { id: '999999', reason: 'Invoice not found' },
    ]);
  });

  it('cancel: DRAFT or unpaid CONFIRMED only; the discount slot is not given back', async () => {
    const draft = await billedInvoice();
    const usedBefore = (await prisma.discounts.findUniqueOrThrow({ where: { id: c.discount.id } })).used_count;
    const cancelled = await request(app).post(`${api}/invoices/${draft.id}/cancel`).set(bearer(c.staff));
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: c.discount.id } })).used_count).toBe(usedBefore);
    expect((await request(app).post(`${api}/invoices/${draft.id}/cancel`).set(bearer(c.staff))).body.error.code).toBe('INVALID_TRANSITION');

    const partly = await billedInvoice(c.globex.id);
    await confirm(partly.id);
    await pay(partly.id, '100');
    const refused = await request(app).post(`${api}/invoices/${partly.id}/cancel`).set(bearer(c.staff));
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('BUSINESS_RULE');
  });
});

describe('invoice list (v_invoice_balance)', () => {
  it('filters by status, overdue, subscription and search; customers see only their own', async () => {
    // billed 1 Sep, due 16 Sep: overdue once confirmed. Seats 10% only starts 1 Oct, so 7,800 + 18% = 9,204.00
    const old = await billedInvoice(c.acme.id, '2026-09-01');
    const recent = await billedInvoice(c.globex.id, '2026-10-30'); // due 14 Nov: not overdue
    await confirm(old.id);
    await confirm(recent.id);
    const draft = await billedInvoice(c.globex.id, '2026-10-01');

    const list = (qs: string, token = c.staff) => request(app).get(`${api}/invoices${qs}`).set(bearer(token));
    const ids = (res: request.Response) => res.body.data.map((i: { id: string }) => i.id);

    const all = await list('');
    expect(all.body).toMatchObject({ page: 1, pageSize: 25, total: 3 });
    expect(all.body.data[0].lines).toBeUndefined(); // list items carry no lines or payments
    expect(ids(await list('?overdue=true'))).toEqual([old.id.toString()]);
    expect((await list('?overdue=true')).body.data[0]).toMatchObject({ isOverdue: true, balanceDue: '9204.00', subscriptionNumber: expect.stringMatching(/^SUB-/) });
    expect(ids(await list('?overdue=false')).sort()).toEqual([recent.id, draft.id].map(String).sort());
    expect(ids(await list('?status=DRAFT'))).toEqual([draft.id.toString()]);
    expect(ids(await list(`?subscriptionId=${draft.subscription_id}`))).toEqual([draft.id.toString()]);
    expect(ids(await list(`?q=${old.number}`))).toEqual([old.id.toString()]);
    expect(ids(await list('?from=2026-10-01&to=2026-10-31')).sort()).toEqual([recent.id, draft.id].map(String).sort());
    expect(ids(await list('?sort=dueDate'))).toEqual([old.id, draft.id, recent.id].map(String));

    // a customer's view is their own, whatever customerId they pass
    expect(ids(await list(`?customerId=${c.globex.id}`, c.acmeToken))).toEqual([old.id.toString()]);
    // paying in full clears overdue
    expect((await pay(old.id, '9204.00')).status).toBe(201);
    expect((await list('?overdue=true')).body.total).toBe(0);
  });
});

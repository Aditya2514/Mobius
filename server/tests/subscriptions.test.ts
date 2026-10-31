import { addDays } from 'date-fns';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { todayIST, toISODate } from '../src/lib/dates';
import { prisma, resetDb } from './helpers/db';
import {
  makeAdmin, makeCustomer, makeDiscount, makePlan, makeProduct, makeStaff, makeTax, makeVariant, tokenFor,
} from './helpers/factories';

const app = createApp();
const api = '/api/v1';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const today = () => toISODate(todayIST());

type Ctx = Awaited<ReturnType<typeof setup>>;
let ctx: Ctx;

/** CRM Pro 1,000 + Brand Odoo 560, GST 18%, monthly pausable plan, Seats 10% (used 3/100), a 5-seat template. */
async function setup() {
  const admin = await makeAdmin();
  const staffUser = await makeStaff();
  const acme = await makeCustomer({ email: 'ops@acme.test', fullName: 'Acme Ops' });
  const globex = await makeCustomer({ email: 'fin@globex.test', fullName: 'Globex Finance' });
  const gst = await makeTax(18);
  const crm = await makeProduct({ name: 'CRM Pro', price: 1000, taxId: gst.id });
  const odoo = await makeVariant(crm.id, 'Brand', 'Odoo', 560);
  const plan = await makePlan({ pausable: true, minQuantity: 1 });
  const discount = await makeDiscount(admin.id, { productIds: [crm.id], usedCount: 3 });
  const template = await prisma.quotation_templates.create({
    data: {
      name: 'CRM 5 seats', plan_id: plan.id, validity_days: 30, payment_terms_days: 15,
      quotation_template_lines: { create: [{ product_id: crm.id, variant_id: odoo.id, quantity: 5 }] },
    },
  });
  return {
    admin, staffUser, acme, globex, gst, crm, odoo, plan, discount, template,
    staff: await tokenFor(app, staffUser),
    acmeToken: await tokenFor(app, acme),
    globexToken: await tokenFor(app, globex),
  };
}

beforeEach(async () => {
  await resetDb();
  ctx = await setup();
});
afterAll(() => prisma.$disconnect());

const create = (body: object, token = ctx.staff) => request(app).post(`${api}/subscriptions`).set(bearer(token)).send(body);
const act = (id: string, action: string, token = ctx.staff) =>
  request(app).post(`${api}/subscriptions/${id}/transition`).set(bearer(token)).send({ action });

async function draftFromTemplate(over: object = {}) {
  const res = await create({
    customerId: ctx.acme.id.toString(), planId: ctx.plan.id.toString(), templateId: ctx.template.id.toString(),
    startDate: '2026-11-01', ...over,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function activeSub(over: object = {}) {
  const s = await draftFromTemplate(over);
  for (const a of ['send_quote', 'confirm', 'activate']) expect((await act(s.id, a)).status).toBe(200);
  return s;
}

describe('state machine', () => {
  it('#16 DRAFT → close is refused with 400 INVALID_TRANSITION and the allowed list', async () => {
    const s = await draftFromTemplate();
    const res = await act(s.id, 'close');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_TRANSITION', details: { allowed: ['send_quote', 'cancel'] } });
    const row = await prisma.subscriptions.findUniqueOrThrow({ where: { id: BigInt(s.id) } });
    expect(row.status).toBe('DRAFT');
    expect(await prisma.subscription_status_history.count({ where: { subscription_id: row.id } })).toBe(1);
  });

  it('template → DRAFT → QUOTATION → CONFIRMED → ACTIVE, with history and the ₹8,283.60 preview', async () => {
    const s = await draftFromTemplate();
    expect(s).toMatchObject({
      number: 'SUB-000001', status: 'DRAFT', customer: { name: 'Acme Ops' }, paymentTermsDays: 15,
      template: { name: 'CRM 5 seats' }, allowedActions: ['send_quote', 'cancel'],
      lines: [{
        product: { name: 'CRM Pro' }, variant: { attribute: 'Brand', value: 'Odoo' }, quantity: 5,
        unitPrice: '1560.00', tax: { rate: '18.00' }, // price fixed from product + variant, tax from product default
      }],
      preview: { subtotal: '7800.00', discountTotal: '780.00', taxTotal: '1263.60', total: '8283.60' },
      recurringTotal: '8283.60',
    });

    const quoted = await act(s.id, 'send_quote');
    expect(quoted.body).toMatchObject({ status: 'QUOTATION', quotationValidUntil: toISODate(addDays(todayIST(), 30)) });
    expect((await act(s.id, 'confirm')).body.status).toBe('CONFIRMED');
    const active = await act(s.id, 'activate');
    expect(active.body).toMatchObject({ status: 'ACTIVE', nextBillingDate: '2026-11-01', allowedActions: ['pause', 'close'] });

    const history = await request(app).get(`${api}/subscriptions/${s.id}/history`).set(bearer(ctx.staff));
    expect(history.body.data.map((h: { fromStatus: string; toStatus: string }) => `${h.fromStatus}→${h.toStatus}`)).toEqual([
      'null→DRAFT', 'DRAFT→QUOTATION', 'QUOTATION→CONFIRMED', 'CONFIRMED→ACTIVE',
    ]);
    // previews never claim a discount slot
    expect((await prisma.discounts.findUniqueOrThrow({ where: { id: ctx.discount.id } })).used_count).toBe(3);
  });

  it('cancel a quotation; revise goes back to DRAFT and clears the validity date', async () => {
    const s = await draftFromTemplate();
    await act(s.id, 'send_quote');
    const revised = await act(s.id, 'revise');
    expect(revised.body).toMatchObject({ status: 'DRAFT', quotationValidUntil: null });
    const cancelled = await act(s.id, 'cancel');
    expect(cancelled.body).toMatchObject({ status: 'CLOSED', allowedActions: [] });
    expect(cancelled.body.closedAt).toBeTruthy();
  });

  it('an expired quotation cannot be confirmed', async () => {
    const s = await draftFromTemplate();
    await act(s.id, 'send_quote');
    await prisma.subscriptions.update({ where: { id: BigInt(s.id) }, data: { quotation_valid_until: addDays(todayIST(), -1) } });
    const res = await act(s.id, 'confirm');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('send_quote needs at least one line', async () => {
    const s = await create({ customerId: ctx.acme.id.toString(), planId: ctx.plan.id.toString(), startDate: '2026-11-01' });
    expect(s.status).toBe(201);
    expect(s.body.lines).toEqual([]);
    const res = await act(s.body.id, 'send_quote');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('pause, then resume pushes the next billing date forward by the days paused', async () => {
    const s = await activeSub();
    const paused = await act(s.id, 'pause');
    expect(paused.body).toMatchObject({ status: 'PAUSED', pausedAt: today(), allowedActions: ['resume', 'close'] });
    // pretend it was paused 5 days ago
    await prisma.subscriptions.update({ where: { id: BigInt(s.id) }, data: { paused_at: addDays(todayIST(), -5) } });
    const resumed = await act(s.id, 'resume');
    expect(resumed.body).toMatchObject({ status: 'ACTIVE', pausedAt: null, nextBillingDate: '2026-11-06' });
  });

  it('renew moves the expiry forward by the original term', async () => {
    const s = await activeSub({ expiryDate: '2026-11-30' }); // 29-day term
    expect(s.allowedActions).toBeDefined();
    const renewed = await act(s.id, 'renew');
    expect(renewed.status).toBe(200);
    expect(renewed.body).toMatchObject({ status: 'ACTIVE', expiryDate: '2026-12-29' });
  });

  it('plan flags: a non-pausable plan cannot be paused and does not offer pause', async () => {
    const rigid = await makePlan({ pausable: false });
    const s = await activeSub({ planId: rigid.id.toString(), templateId: undefined, lines: [
      { productId: ctx.crm.id.toString(), quantity: 1 },
    ] });
    const detail = await request(app).get(`${api}/subscriptions/${s.id}`).set(bearer(ctx.staff));
    expect(detail.body.allowedActions).not.toContain('pause');
    const res = await act(s.id, 'pause');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });
});

describe('editing rules', () => {
  it('lines and header are locked once confirmed', async () => {
    const s = await draftFromTemplate();
    await act(s.id, 'send_quote');
    await act(s.id, 'confirm');
    const addLine = await request(app).post(`${api}/subscriptions/${s.id}/lines`).set(bearer(ctx.staff))
      .send({ productId: ctx.crm.id.toString(), quantity: 1 });
    expect(addLine.status).toBe(400);
    expect(addLine.body.error.code).toBe('INVALID_TRANSITION');
    const patch = await request(app).patch(`${api}/subscriptions/${s.id}`).set(bearer(ctx.staff)).send({ notes: 'late edit' });
    expect(patch.status).toBe(400);
  });

  it('PATCH never sets status (rule 7)', async () => {
    const s = await draftFromTemplate();
    const res = await request(app).patch(`${api}/subscriptions/${s.id}`).set(bearer(ctx.staff))
      .send({ status: 'ACTIVE', notes: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'DRAFT', notes: 'hello' });
  });

  it('quantity below the plan minimum → 400 BUSINESS_RULE', async () => {
    const strict = await makePlan({ minQuantity: 5 });
    const res = await create({
      customerId: ctx.acme.id.toString(), planId: strict.id.toString(), startDate: '2026-11-01',
      lines: [{ productId: ctx.crm.id.toString(), quantity: 2 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'BUSINESS_RULE', details: { field: 'lines.0.quantity' } });
  });

  it('a plan that is not available today cannot be chosen', async () => {
    const future = await makePlan({ availableFrom: '2099-01-01' });
    const res = await create({ customerId: ctx.acme.id.toString(), planId: future.id.toString(), startDate: '2026-11-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('line edits re-price the preview; dropping below 5 seats loses the discount', async () => {
    const s = await draftFromTemplate();
    const lineId = s.lines[0].id;
    const res = await request(app).patch(`${api}/subscriptions/${s.id}/lines/${lineId}`).set(bearer(ctx.staff)).send({ quantity: 4 });
    expect(res.status).toBe(200);
    // 1560 × 4 = 6240, no discount under 5 seats, GST 1123.20
    expect(res.body.preview).toEqual({ subtotal: '6240.00', discountTotal: '0.00', taxTotal: '1123.20', total: '7363.20' });
    expect(res.body.lines[0].unitPrice).toBe('1560.00'); // agreed price kept
  });
});

describe('customers', () => {
  it('see only their own subscriptions; another customer\'s → 404', async () => {
    const mine = await draftFromTemplate();
    const theirs = await draftFromTemplate({ customerId: ctx.globex.id.toString() });

    const list = await request(app).get(`${api}/subscriptions`).set(bearer(ctx.acmeToken));
    expect(list.body.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ id: mine.id, recurringTotal: '8283.60' });
    // a customerId filter cannot widen a customer's view: their own id always wins
    const sneaky = await request(app).get(`${api}/subscriptions?customerId=${ctx.globex.id}`).set(bearer(ctx.acmeToken));
    expect(sneaky.body.data.map((s: { id: string }) => s.id)).toEqual([mine.id]);

    expect((await request(app).get(`${api}/subscriptions/${theirs.id}`).set(bearer(ctx.acmeToken))).status).toBe(404);
    expect((await act(theirs.id, 'cancel', ctx.acmeToken)).status).toBe(404);
  });

  it('may pause/resume/close their own when the plan allows, nothing else', async () => {
    const s = await activeSub();
    const view = await request(app).get(`${api}/subscriptions/${s.id}`).set(bearer(ctx.acmeToken));
    expect(view.body.allowedActions).toEqual(['pause', 'close']);

    expect((await act(s.id, 'pause', ctx.acmeToken)).body.status).toBe('PAUSED');
    expect((await act(s.id, 'resume', ctx.acmeToken)).body.status).toBe('ACTIVE');

    const renew = await act(s.id, 'renew', ctx.acmeToken);
    expect(renew.status).toBe(403);
    // a staff-only action that isn't even valid from ACTIVE is still 403, not a 400 listing staff actions
    const activate = await act(s.id, 'activate', ctx.acmeToken);
    expect(activate.status).toBe(403);
    expect(activate.body.error.details).toBeUndefined();
    // and they can't create or edit subscriptions at all
    expect((await create({ customerId: ctx.acme.id.toString(), planId: ctx.plan.id.toString(), startDate: '2026-11-01' }, ctx.acmeToken)).status).toBe(403);
  });
});

describe('list', () => {
  it('filters by status and search, paginated, with recurringTotal from the preview', async () => {
    await draftFromTemplate();
    await activeSub({ customerId: ctx.globex.id.toString() });
    const all = await request(app).get(`${api}/subscriptions`).set(bearer(ctx.staff));
    expect(all.body).toMatchObject({ page: 1, pageSize: 25, total: 2 });

    const active = await request(app).get(`${api}/subscriptions?status=ACTIVE`).set(bearer(ctx.staff));
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0]).toMatchObject({
      customer: { name: 'Globex Finance' }, plan: { billingPeriod: 'MONTHLY' }, recurringTotal: '8283.60',
    });
    const search = await request(app).get(`${api}/subscriptions?q=acme`).set(bearer(ctx.staff));
    expect(search.body.total).toBe(1);
  });
});

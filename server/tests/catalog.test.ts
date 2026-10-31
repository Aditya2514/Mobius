import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { prisma, resetDb } from './helpers/db';
import { makeAdmin, makeCustomer, makeStaff, tokenFor } from './helpers/factories';

const app = createApp();
const api = '/api/v1';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

let admin: string, staff: string, customer: string;
beforeEach(async () => {
  await resetDb();
  admin = await tokenFor(app, await makeAdmin());
  staff = await tokenFor(app, await makeStaff());
  customer = await tokenFor(app, await makeCustomer());
});
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

async function gst18() {
  const res = await request(app).post(`${api}/taxes`).set(bearer(admin)).send({ name: 'GST 18%', rate: '18' });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

async function crmPro() {
  const tax = await gst18();
  const res = await request(app)
    .post(`${api}/products`)
    .set(bearer(admin))
    .send({
      name: 'CRM Pro', salesPrice: '1000', costPrice: '400', defaultTaxId: tax.id,
      variants: [{ attribute: 'Brand', value: 'Odoo', extraPrice: '560' }],
    });
  expect(res.status).toBe(201);
  return res.body;
}

const planBody = (over: object = {}) => ({
  name: 'CRM Monthly', price: '1000', billingPeriod: 'MONTHLY', availableFrom: '2026-01-01', ...over,
});

describe('taxes', () => {
  it('validates rate, rejects duplicate names, customers see active only', async () => {
    expect((await request(app).post(`${api}/taxes`).set(bearer(admin)).send({ name: 'Bad', rate: '101' })).status).toBe(400);
    const tax = await gst18();
    const dup = await request(app).post(`${api}/taxes`).set(bearer(admin)).send({ name: 'GST 18%', rate: '18' });
    expect(dup.status).toBe(409);
    expect((await request(app).post(`${api}/taxes`).set(bearer(staff)).send({ name: 'X', rate: '5' })).status).toBe(403);

    expect((await request(app).delete(`${api}/taxes/${tax.id}`).set(bearer(admin))).status).toBe(204);
    const asCustomer = await request(app).get(`${api}/taxes`).set(bearer(customer));
    expect(asCustomer.body.total).toBe(0);
    const asStaff = await request(app).get(`${api}/taxes`).set(bearer(staff));
    expect(asStaff.body.data[0]).toMatchObject({ name: 'GST 18%', rate: '18.00', isActive: false });
  });
});

describe('products and variants', () => {
  it('returns the contract shape; only ADMIN writes', async () => {
    const p = await crmPro();
    expect(p).toMatchObject({
      name: 'CRM Pro', type: 'SERVICE', salesPrice: '1000.00', costPrice: '400.00', isActive: true,
      defaultTax: { name: 'GST 18%', rate: '18.00' },
      variants: [{ attribute: 'Brand', value: 'Odoo', extraPrice: '560.00' }],
    });
    expect(typeof p.id).toBe('string');
    expect((await request(app).post(`${api}/products`).set(bearer(staff)).send({ name: 'X', salesPrice: '1' })).status).toBe(403);
  });

  it('a deactivated product disappears for customers but not for staff', async () => {
    const p = await crmPro();
    expect((await request(app).delete(`${api}/products/${p.id}`).set(bearer(admin))).status).toBe(204);
    expect((await request(app).get(`${api}/products`).set(bearer(customer))).body.total).toBe(0);
    expect((await request(app).get(`${api}/products/${p.id}`).set(bearer(customer))).status).toBe(404);
    expect((await request(app).get(`${api}/products`).set(bearer(staff))).body.total).toBe(1);
  });

  it('PATCH a variant without extraPrice keeps the price; duplicates → 409', async () => {
    const p = await crmPro();
    const v = p.variants[0];
    const res = await request(app).patch(`${api}/variants/${v.id}`).set(bearer(admin)).send({ value: 'Odoo 17' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ value: 'Odoo 17', extraPrice: '560.00' });

    const add = (value: string) =>
      request(app).post(`${api}/products/${p.id}/variants`).set(bearer(admin)).send({ attribute: 'Brand', value, extraPrice: '300' });
    expect((await add('Zoho')).status).toBe(201);
    expect((await add('Zoho')).status).toBe(409);
  });
});

describe('plans', () => {
  it('?available=true uses the India date (00:05 IST on 1 Nov is still 31 Oct in UTC)', async () => {
    await request(app).post(`${api}/plans`).set(bearer(admin)).send(planBody({ name: 'Starts 1 Nov', availableFrom: '2026-11-01' }));
    await request(app).post(`${api}/plans`).set(bearer(admin)).send(planBody({ name: 'Ended 31 Oct', availableTo: '2026-10-31' }));
    await request(app).post(`${api}/plans`).set(bearer(admin)).send(planBody({ name: 'Inactive', isActive: false }));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T18:35:00Z')); // 00:05 IST, 1 Nov
    const token = await tokenFor(app, await makeStaff());
    const res = await request(app).get(`${api}/plans?available=true`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['Starts 1 Nov']);
  });

  it('customers only see plans available today, even without ?available', async () => {
    await request(app).post(`${api}/plans`).set(bearer(admin)).send(planBody({ name: 'Open' }));
    await request(app).post(`${api}/plans`).set(bearer(admin)).send(planBody({ name: 'Future', availableFrom: '2099-01-01' }));
    const res = await request(app).get(`${api}/plans`).set(bearer(customer));
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['Open']);
    expect((await request(app).get(`${api}/plans`).set(bearer(staff))).body.total).toBe(2);
  });

  it('contract shape; PATCH keeps omitted flags; availableTo before availableFrom → 400', async () => {
    const created = await request(app).post(`${api}/plans`).set(bearer(admin)).send(planBody({ isPausable: true }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      price: '1000.00', billingPeriod: 'MONTHLY', minQuantity: 1, availableFrom: '2026-01-01', availableTo: null,
      autoClose: false, isClosable: true, isPausable: true, isRenewable: true, isActive: true,
    });
    const renamed = await request(app).patch(`${api}/plans/${created.body.id}`).set(bearer(admin)).send({ name: 'CRM Monthly v2' });
    expect(renamed.body).toMatchObject({ name: 'CRM Monthly v2', isPausable: true, minQuantity: 1 });
    const bad = await request(app).patch(`${api}/plans/${created.body.id}`).set(bearer(admin)).send({ availableTo: '2025-12-31' });
    expect(bad.status).toBe(400);
  });
});

describe('quotation templates', () => {
  it('checks lines against the plan and products; staff read, customers blocked', async () => {
    const p = await crmPro();
    const plan = (await request(app).post(`${api}/plans`).set(bearer(admin)).send(planBody({ minQuantity: 5 }))).body;
    const other = await request(app).post(`${api}/products`).set(bearer(admin)).send({
      name: 'Helpdesk', salesPrice: '750', variants: [{ attribute: 'Tier', value: 'Gold', extraPrice: '100' }],
    });
    const body = (line: object) => ({ name: 'CRM 5 seats', planId: plan.id, validityDays: 30, lines: [line] });

    const tooFew = await request(app).post(`${api}/quotation-templates`).set(bearer(admin))
      .send(body({ productId: p.id, variantId: p.variants[0].id, quantity: 3 }));
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.error).toMatchObject({ code: 'BUSINESS_RULE', details: { field: 'lines.0.quantity' } });

    const wrongVariant = await request(app).post(`${api}/quotation-templates`).set(bearer(admin))
      .send(body({ productId: p.id, variantId: other.body.variants[0].id, quantity: 5 }));
    expect(wrongVariant.status).toBe(400);

    const ok = await request(app).post(`${api}/quotation-templates`).set(bearer(admin))
      .send(body({ productId: p.id, variantId: p.variants[0].id, quantity: 5 }));
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      name: 'CRM 5 seats', validityDays: 30, paymentTermsDays: 15,
      plan: { id: plan.id, billingPeriod: 'MONTHLY', minQuantity: 5 },
      lines: [{ product: { name: 'CRM Pro' }, variant: { value: 'Odoo' }, quantity: 5, unitPrice: null, tax: null }],
    });

    expect((await request(app).get(`${api}/quotation-templates/${ok.body.id}`).set(bearer(staff))).status).toBe(200);
    expect((await request(app).post(`${api}/quotation-templates`).set(bearer(staff)).send(body({}))).status).toBe(403);
    expect((await request(app).get(`${api}/quotation-templates`).set(bearer(customer))).status).toBe(403);

    // a variant used by a template cannot be deleted
    expect((await request(app).delete(`${api}/variants/${p.variants[0].id}`).set(bearer(admin))).status).toBe(409);
    expect((await request(app).delete(`${api}/quotation-templates/${ok.body.id}`).set(bearer(admin))).status).toBe(204);
  });
});

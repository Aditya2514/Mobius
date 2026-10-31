import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { outbox } from '../src/lib/mailer';
import { billOne } from '../src/modules/billing/engine';
import { prisma, resetDb } from './helpers/db';
import {
  makeActiveSub, makeAdmin, makeCustomer, makeDiscount, makePlan, makeProduct, makeStaff, makeTax, makeVariant, tokenFor,
} from './helpers/factories';

const app = createApp();
const api = '/api/v1';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

let c: Awaited<ReturnType<typeof setup>>;

async function setup() {
  const admin = await makeAdmin();
  const acme = await makeCustomer({ email: 'ops@acme.test', fullName: 'Acme <Ops> & Co' });
  const globex = await makeCustomer({ fullName: 'Globex Finance' });
  const gst = await makeTax(18);
  const crm = await makeProduct({ name: 'CRM Pro', price: 1000, taxId: gst.id });
  const odoo = await makeVariant(crm.id, 'Brand', 'Odoo', 560);
  const plan = await makePlan();
  await makeDiscount(admin.id, { productIds: [crm.id] });
  return {
    acme, globex, gst, crm, odoo, plan,
    staff: await tokenFor(app, await makeStaff()),
    acmeToken: await tokenFor(app, acme),
  };
}

/** a DRAFT invoice from the real engine: CRM Pro (Odoo) × 5 → ₹8,283.60 */
async function invoiceFor(customerId: bigint, day = '2026-10-01') {
  const sub = await makeActiveSub(customerId, {
    planId: c.plan.id, startDate: day,
    lines: [{ productId: c.crm.id, variantId: c.odoo.id, quantity: 5, unitPrice: '1560.00', taxId: c.gst.id }],
  });
  await prisma.$transaction((tx) => billOne(tx, sub.id, new Date(`${day}T00:00:00Z`)));
  return prisma.invoices.findFirstOrThrow({ where: { subscription_id: sub.id } });
}
const confirm = (id: bigint) => request(app).post(`${api}/invoices/${id}/confirm`).set(bearer(c.staff));

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
  c = await setup();
});
afterAll(() => prisma.$disconnect());

describe('GET /invoices/:id/print', () => {
  it('renders the invoice as HTML for its owner and staff; another customer gets 404', async () => {
    const mine = await invoiceFor(c.acme.id);
    const theirs = await invoiceFor(c.globex.id);

    const res = await request(app).get(`${api}/invoices/${mine.id}/print`).set(bearer(c.acmeToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(mine.number);
    expect(res.text).toContain('CRM Pro (Brand: Odoo)');
    expect(res.text).toContain('₹8,283.60'); // total, Indian grouping
    expect(res.text).toContain('− ₹780.00'); // the Seats 10% discount
    expect(res.text).toContain('@page { size: A4');
    // customer data is escaped, never injected as HTML
    expect(res.text).toContain('Acme &lt;Ops&gt; &amp; Co');
    expect(res.text).not.toContain('Acme <Ops>');

    expect((await request(app).get(`${api}/invoices/${theirs.id}/print`).set(bearer(c.acmeToken))).status).toBe(404);
    expect((await request(app).get(`${api}/invoices/${theirs.id}/pdf`).set(bearer(c.acmeToken))).status).toBe(404);
    expect((await request(app).get(`${api}/invoices/${theirs.id}/print`).set(bearer(c.staff))).status).toBe(200);
  });

  it('stamps OVERDUE only when the invoice is overdue', async () => {
    const late = await invoiceFor(c.acme.id, '2026-09-01'); // due 16 Sep
    const page = async () => (await request(app).get(`${api}/invoices/${late.id}/print`).set(bearer(c.staff))).text;
    expect(await page()).not.toContain('class="stamp"');
    await confirm(late.id);
    expect(await page()).toContain('<div class="stamp">OVERDUE</div>');
  });
});

describe('GET /invoices/:id/pdf', () => {
  it('answers 503 pointing to /print when Chrome is unavailable (never launched in tests)', async () => {
    const inv = await invoiceFor(c.acme.id);
    const res = await request(app).get(`${api}/invoices/${inv.id}/pdf`).set(bearer(c.staff));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PDF_UNAVAILABLE');
    expect(res.body.error.message).toContain('/print');
  });
});

describe('POST /invoices/:id/send', () => {
  it('is refused for a DRAFT invoice and sends nothing', async () => {
    const inv = await invoiceFor(c.acme.id);
    const res = await request(app).post(`${api}/invoices/${inv.id}/send`).set(bearer(c.staff));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
    expect(outbox).toHaveLength(0);
    expect((await prisma.invoices.findUniqueOrThrow({ where: { id: inv.id } })).sent_at).toBeNull();
  });

  it('emails a confirmed invoice to the bill-to address and sets sentAt (HTML fallback without a PDF)', async () => {
    const inv = await invoiceFor(c.acme.id);
    await confirm(inv.id);
    const res = await request(app).post(`${api}/invoices/${inv.id}/send`).set(bearer(c.staff));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: inv.number, pdfAttached: false });
    expect(res.body.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await prisma.invoices.findUniqueOrThrow({ where: { id: inv.id } })).sent_at).not.toBeNull();

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: 'ops@acme.test', subject: `Invoice ${inv.number} from Brightloop Software` });
    expect(outbox[0].text).toContain('Balance due: ₹8,283.60');
    expect(outbox[0].html).toContain(inv.number); // the invoice itself, since no PDF could be attached
    expect(outbox[0].attachments).toBeUndefined();
  });

  it('customers cannot send invoices', async () => {
    const inv = await invoiceFor(c.acme.id);
    await confirm(inv.id);
    expect((await request(app).post(`${api}/invoices/${inv.id}/send`).set(bearer(c.acmeToken))).status).toBe(403);
  });
});

/**
 * Demo / development seed. WIPES the database first, then loads:
 * 4 demo accounts (password Demo@12345), GST 5/12/18%, 6 products (CRM Pro with Brand variants,
 * Odoo +560), 4 plans (one per billing period), 2 quotation templates, the "Seats 10%" discount,
 * and 10 customers with one ACTIVE subscription each (not yet billed: the first billing run
 * catches them up).
 *
 *   npm run db:seed          small demo data
 *   npm run db:seed:big      + 5,000 subscriptions (Phase 3)
 */
import { PrismaClient, type billing_period } from '@prisma/client';
import bcrypt from 'bcrypt';
import { subDays } from 'date-fns';
import Decimal from 'decimal.js';
import { existsSync } from 'node:fs';
import { todayIST } from '../src/lib/dates';
import { printBigSummary, seedBig } from './seed-big';

if (existsSync('.env')) process.loadEnvFile('.env');
const prisma = new PrismaClient();

export const DEMO_PASSWORD = 'Demo@12345';
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function wipe() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE payments, discount_redemptions, invoice_lines, invoices, discount_subscriptions,
      discount_products, discounts, subscription_status_history, subscription_lines, subscriptions,
      quotation_template_lines, quotation_templates, plans, product_variants, products, taxes,
      password_reset_tokens, refresh_tokens, billing_runs, users RESTART IDENTITY CASCADE`);
  // SUB-/INV- numbers come from standalone sequences that RESTART IDENTITY does not touch
  await prisma.$executeRawUnsafe('ALTER SEQUENCE subscription_number_seq RESTART WITH 1');
  await prisma.$executeRawUnsafe('ALTER SEQUENCE invoice_number_seq RESTART WITH 1');
}

/** Accounts, catalog, plans, templates and the 10 demo customers. */
async function seedBase() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ---------- the 4 demo accounts (Backend Blueprint section 8) ----------
  const admin = await prisma.users.create({
    data: { email: 'admin@brightloop.test', password_hash: hash, full_name: 'Admin', role: 'ADMIN', company_name: 'Brightloop Software' },
  });
  const staff = await prisma.users.create({
    data: { email: 'staff@brightloop.test', password_hash: hash, full_name: 'Karan Mehta', role: 'STAFF', company_name: 'Brightloop Software', created_by: admin.id },
  });
  const acme = await prisma.users.create({
    data: {
      email: 'customer@acme.test', password_hash: hash, full_name: 'Acme Ops', role: 'CUSTOMER',
      company_name: 'Acme Operations Pvt Ltd', phone: '+91 98200 11223',
      address: '4th Floor, Prestige Tower, MG Road, Bengaluru 560001', gstin: '29AABCA1234F1Z5', created_by: staff.id,
    },
  });
  const globex = await prisma.users.create({
    data: {
      email: 'customer2@globex.test', password_hash: hash, full_name: 'Globex Finance', role: 'CUSTOMER',
      company_name: 'Globex India LLP', phone: '+91 99300 44556',
      address: 'Unit 12, Hiranandani Business Park, Powai, Mumbai 400076', gstin: '27AAGFG5678K1Z2', created_by: staff.id,
    },
  });

  // ---------- taxes ----------
  // one at a time, so ids are the same on every reseed (GST 5% = 1, 12% = 2, 18% = 3)
  const gst5 = await prisma.taxes.create({ data: { name: 'GST 5%', rate: '5' } });
  const gst12 = await prisma.taxes.create({ data: { name: 'GST 12%', rate: '12' } });
  const gst18 = await prisma.taxes.create({ data: { name: 'GST 18%', rate: '18' } });

  // ---------- products ----------
  const crm = await prisma.products.create({
    data: {
      name: 'CRM Pro', type: 'SERVICE', sales_price: '1000', cost_price: '400', default_tax_id: gst18.id,
      notes: 'Per-seat CRM licence',
      product_variants: {
        create: [
          { attribute: 'Brand', value: 'Odoo', extra_price: '560' },
          { attribute: 'Brand', value: 'Zoho', extra_price: '300' },
        ],
      },
    },
    include: { product_variants: true },
  });
  const odoo = crm.product_variants.find((v) => v.value === 'Odoo')!;
  const zoho = crm.product_variants.find((v) => v.value === 'Zoho')!;
  const helpdesk = await prisma.products.create({
    data: { name: 'Helpdesk Suite', type: 'SERVICE', sales_price: '750', cost_price: '250', default_tax_id: gst18.id },
  });
  const analytics = await prisma.products.create({
    data: { name: 'Analytics Add-on', type: 'ADDON', sales_price: '400', cost_price: '100', default_tax_id: gst18.id },
  });
  const storage = await prisma.products.create({
    data: { name: 'Cloud Storage 100 GB', type: 'SERVICE', sales_price: '250', cost_price: '90', default_tax_id: gst18.id },
  });
  const training = await prisma.products.create({
    data: { name: 'Onboarding & Training', type: 'SERVICE', sales_price: '5000', cost_price: '2000', default_tax_id: gst18.id },
  });
  const scanner = await prisma.products.create({
    data: { name: 'Barcode Scanner', type: 'GOODS', sales_price: '3500', cost_price: '2200', default_tax_id: gst12.id },
  });
  void gst5; // GST 5% exists for the admin to use; no demo product needs it

  // ---------- plans: one per billing period ----------
  const plan = (name: string, price: string, billing_period: billing_period, extra: object = {}) =>
    prisma.plans.create({ data: { name, price, billing_period, available_from: d('2026-01-01'), ...extra } });
  const daily = await plan('CRM Daily Pass', '50', 'DAILY', { is_renewable: false });
  const weekly = await plan('CRM Weekly', '300', 'WEEKLY', { is_pausable: true });
  const monthly = await plan('CRM Monthly', '1000', 'MONTHLY', { auto_close: true, is_pausable: true });
  const yearly = await plan('CRM Yearly', '10000', 'YEARLY', { is_pausable: false });

  // ---------- quotation templates ----------
  await prisma.quotation_templates.create({
    data: {
      name: 'CRM Pro: 5 seats (Odoo)', plan_id: monthly.id, validity_days: 30, payment_terms_days: 15,
      notes: 'Standard 5-seat CRM offer. Seats 10% applies automatically at 5 seats or more.',
      quotation_template_lines: {
        create: [{ product_id: crm.id, variant_id: odoo.id, quantity: 5, tax_id: gst18.id }],
      },
    },
  });
  await prisma.quotation_templates.create({
    data: {
      name: 'Support Starter (yearly)', plan_id: yearly.id, validity_days: 15, payment_terms_days: 30,
      quotation_template_lines: {
        create: [
          { product_id: helpdesk.id, quantity: 3, tax_id: gst18.id },
          { product_id: analytics.id, quantity: 1, tax_id: gst18.id },
        ],
      },
    },
  });

  // ---------- 10 demo customers (their subscriptions come last) ----------
  const more = [
    ['Priya Nair', 'Tata Bluewave Logistics', 'ops@bluewave.test'],
    ['Arjun Shah', 'Sahyadri Agro Exports', 'accounts@sahyadri.test'],
    ['Meera Iyer', 'Kaveri Health Clinics', 'it@kaverihealth.test'],
    ['Rohit Verma', 'Northstar Retail', 'finance@northstar.test'],
    ['Ananya Das', 'Hooghly Textiles', 'admin@hooghly.test'],
    ['Vikram Singh', 'Rajputana Motors', 'billing@rajputana.test'],
    ['Sneha Kulkarni', 'Deccan EdTech', 'ops@deccanedu.test'],
    ['Farhan Qureshi', 'Malabar Spice Co', 'accounts@malabarspice.test'],
  ];
  const customers = [acme, globex];
  for (const [name, company, email] of more) {
    customers.push(
      await prisma.users.create({
        data: { email, password_hash: hash, full_name: name, company_name: company, role: 'CUSTOMER', created_by: staff.id },
      }),
    );
  }

  return {
    hash, admin, staff, acme, globex, customers, gst5, gst12, gst18,
    crm, odoo, zoho, helpdesk, analytics, storage, training, scanner,
    plans: { daily, weekly, monthly, yearly },
  };
}
export type Base = Awaited<ReturnType<typeof seedBase>>;

/** "Seats 10%": PERCENTAGE 10 on CRM Pro, at least 5 seats, 100 uses. */
async function seedDiscount({ admin, crm }: Base) {
  await prisma.discounts.create({
    data: {
      name: 'Seats 10%', type: 'PERCENTAGE', value: '10', scope: 'PRODUCT', min_quantity: 5,
      start_date: d('2026-10-01'), usage_limit: 100, created_by: admin.id,
      discount_products: { create: [{ product_id: crm.id }] },
    },
  });
}

/** One ACTIVE subscription per demo customer, started 3–50 days ago and not billed yet: the first run catches them up. */
async function seedDemoSubscriptions(b: Base) {
  const { acme, globex, customers, staff, gst12, gst18, crm, odoo, zoho, helpdesk, analytics, storage, training, scanner } = b;
  const { daily, weekly, monthly, yearly } = b.plans;
  const unitPrice = (sales: Decimal.Value, extra: Decimal.Value = 0) => new Decimal(sales).plus(extra).toFixed(2);
  type Line = { product_id: bigint; variant_id?: bigint; quantity: number; unit_price: string; tax_id: bigint };
  const crmOdoo = (qty: number): Line => ({ product_id: crm.id, variant_id: odoo.id, quantity: qty, unit_price: unitPrice(1000, 560), tax_id: gst18.id });
  const crmZoho = (qty: number): Line => ({ product_id: crm.id, variant_id: zoho.id, quantity: qty, unit_price: unitPrice(1000, 300), tax_id: gst18.id });
  const simple = (p: { id: bigint; sales_price: Decimal.Value | { toString(): string } }, qty: number, tax = gst18.id): Line => ({
    product_id: p.id, quantity: qty, unit_price: unitPrice(p.sales_price.toString()), tax_id: tax,
  });

  // started 3 to 50 days ago, so the first billing run has periods to catch up on
  const today = todayIST();
  const subs: { customer: (typeof customers)[number]; planId: bigint; daysAgo: number; lines: Line[] }[] = [
    { customer: acme, planId: monthly.id, daysAgo: 30, lines: [crmOdoo(5)] }, // the ₹8,283.60 example
    { customer: globex, planId: monthly.id, daysAgo: 12, lines: [crmZoho(3), simple(storage, 2)] },
    { customer: customers[2], planId: yearly.id, daysAgo: 45, lines: [simple(helpdesk, 3), simple(analytics, 1)] },
    { customer: customers[3], planId: monthly.id, daysAgo: 20, lines: [crmOdoo(10)] },
    { customer: customers[4], planId: weekly.id, daysAgo: 16, lines: [simple(helpdesk, 2)] },
    { customer: customers[5], planId: monthly.id, daysAgo: 8, lines: [crmZoho(2), simple(analytics, 2)] },
    { customer: customers[6], planId: monthly.id, daysAgo: 50, lines: [simple(scanner, 4, gst12.id), simple(storage, 1)] },
    { customer: customers[7], planId: daily.id, daysAgo: 3, lines: [crmOdoo(1)] },
    { customer: customers[8], planId: yearly.id, daysAgo: 25, lines: [crmOdoo(6), simple(training, 1)] },
    { customer: customers[9], planId: monthly.id, daysAgo: 5, lines: [simple(storage, 4)] },
  ];
  for (const s of subs) {
    const start = subDays(today, s.daysAgo);
    await prisma.subscriptions.create({
      data: {
        customer_id: s.customer.id, plan_id: s.planId, status: 'ACTIVE', start_date: start,
        next_billing_date: start, billing_anchor: start, payment_terms_days: 15, created_by: staff.id,
        subscription_lines: { create: s.lines },
        subscription_status_history: { create: [{ from_status: null, to_status: 'ACTIVE', changed_by: staff.id }] },
      },
    });
  }

  return subs.length;
}

async function seedSmall() {
  const base = await seedBase();
  await seedDiscount(base);
  const subscriptions = await seedDemoSubscriptions(base);
  return { users: 4 + base.customers.length - 2, products: 6, plans: 4, templates: 2, subscriptions };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
    throw new Error('Refusing to wipe a production database (set SEED_FORCE=true if you really mean it)');
  }
  const big = process.env.SEED_SIZE === 'big';
  const url = new URL(process.env.DATABASE_URL ?? '');
  console.log(`Seeding ${big ? 'BIG' : 'small'} data into ${url.host}${url.pathname} (all existing data is removed)...`);
  const started = Date.now();
  await wipe();
  if (big) {
    const base = await seedBase();
    // bulk history first, so the backfill can't touch the demo subscriptions or use Seats 10% slots
    await seedBig(prisma, base);
    await seedDiscount(base);
    await seedDemoSubscriptions(base);
    await printBigSummary(prisma, started);
  } else {
    const counts = await seedSmall();
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s:`, counts);
  }
  console.log(`Log in as admin@brightloop.test / staff@brightloop.test / customer@acme.test / customer2@globex.test, password ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

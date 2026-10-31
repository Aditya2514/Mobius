/**
 * Big seed (npm run db:seed:big): ~500 customers and ~5,000 subscriptions with six months of
 * real billing history, to prove the 2-second rule.
 *  - subscriptions start across the last 6 months; plan mix ≈ 1% daily, 5% weekly, 70% monthly, 24% yearly
 *  - history comes from the real engine: runBilling() once per day, oldest first, up to YESTERDAY
 *  - every backfilled invoice is confirmed; overdue is held at ≈ 5% of invoices; everything else that
 *    is past due is paid (dated due − 5 … due + 20, never after today), some in two payments,
 *    and a share of not-yet-due invoices is paid early
 * Deterministic: the same data on every run (fixed faker seed).
 */
import { fakerEN_IN as faker } from '@faker-js/faker';
import type { PrismaClient } from '@prisma/client';
import { addDays, addMonths, differenceInCalendarDays, subDays } from 'date-fns';
import Decimal from 'decimal.js';
import { todayIST, toISODate } from '../src/lib/dates';
import { runBilling } from '../src/modules/billing/engine';
import type { Base } from './seed';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

const CUSTOMERS = 500;
const SUBSCRIPTIONS = 4990; // + the 10 demo subscriptions = 5,000
const BATCH = 1000;
const OVERDUE_SHARE = 0.05;

const chunks = <T>(xs: T[], n = BATCH) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const pick = <T>(xs: T[]) => xs[faker.number.int({ min: 0, max: xs.length - 1 })];
const chance = (p: number) => faker.number.float({ min: 0, max: 1 }) < p;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'company';
const log = (msg: string) => console.log(`  ${msg}`);

export async function seedBig(prisma: PrismaClient, b: Base) {
  faker.seed(20261031);
  const today = todayIST();
  const yesterday = subDays(today, 1);
  const windowStart = addMonths(today, -6);
  const windowDays = differenceInCalendarDays(yesterday, windowStart);

  // ---------- customers ----------
  let t = Date.now();
  const customerRows = Array.from({ length: CUSTOMERS }, (_, i) => {
    const company = faker.company.name();
    return {
      email: `accounts${i + 1}@${slug(company)}.test`,
      password_hash: b.hash,
      full_name: faker.person.fullName(),
      company_name: company,
      phone: faker.phone.number(),
      address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
      role: 'CUSTOMER' as const,
      created_by: b.staff.id,
    };
  });
  const customerIds: bigint[] = [];
  for (const batch of chunks(customerRows)) {
    const rows = await prisma.users.createManyAndReturn({ data: batch, select: { id: true } });
    customerIds.push(...rows.map((r) => r.id));
  }
  log(`${customerIds.length} customers (${Date.now() - t} ms)`);

  // ---------- subscriptions ----------
  t = Date.now();
  const { daily, weekly, monthly, yearly } = b.plans;
  const planMix: { plan: typeof daily; weight: number }[] = [
    { plan: daily, weight: 0.01 }, { plan: weekly, weight: 0.05 }, { plan: monthly, weight: 0.7 }, { plan: yearly, weight: 0.24 },
  ];
  const pickPlan = () => {
    let x = faker.number.float({ min: 0, max: 1 });
    for (const p of planMix) if ((x -= p.weight) < 0) return p.plan;
    return monthly;
  };
  const unit = (sales: Decimal.Value, extra: Decimal.Value = 0) => new Decimal(sales).plus(extra).toFixed(2);
  type Line = { product_id: bigint; variant_id: bigint | null; quantity: number; unit_price: string; tax_id: bigint };
  const lineChoices: (() => Line)[] = [
    // CRM seats stay below 5, so bulk history never uses the demo's "Seats 10%" slots
    () => ({ product_id: b.crm.id, variant_id: b.odoo.id, quantity: faker.number.int({ min: 1, max: 4 }), unit_price: unit(1000, 560), tax_id: b.gst18.id }),
    () => ({ product_id: b.crm.id, variant_id: b.zoho.id, quantity: faker.number.int({ min: 1, max: 4 }), unit_price: unit(1000, 300), tax_id: b.gst18.id }),
    () => ({ product_id: b.helpdesk.id, variant_id: null, quantity: faker.number.int({ min: 1, max: 8 }), unit_price: unit(750), tax_id: b.gst18.id }),
    () => ({ product_id: b.analytics.id, variant_id: null, quantity: faker.number.int({ min: 1, max: 3 }), unit_price: unit(400), tax_id: b.gst18.id }),
    () => ({ product_id: b.storage.id, variant_id: null, quantity: faker.number.int({ min: 1, max: 10 }), unit_price: unit(250), tax_id: b.gst18.id }),
    () => ({ product_id: b.scanner.id, variant_id: null, quantity: faker.number.int({ min: 1, max: 3 }), unit_price: unit(3500), tax_id: b.gst12.id }),
  ];

  type SubSeed = {
    row: {
      customer_id: bigint; plan_id: bigint; status: 'ACTIVE' | 'DRAFT' | 'QUOTATION' | 'CONFIRMED';
      start_date: Date; billing_anchor: Date | null; next_billing_date: Date | null; expiry_date: Date | null;
      quotation_valid_until: Date | null; payment_terms_days: number; created_by: bigint;
    };
    lines: Line[];
  };
  const seeds: SubSeed[] = [];
  for (let i = 0; i < SUBSCRIPTIONS; i++) {
    const plan = pickPlan();
    const lines = Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => pick(lineChoices)());
    const terms = chance(0.6) ? 15 : chance(0.85) ? 30 : 7;
    const r = faker.number.float({ min: 0, max: 1 });
    if (r < 0.03) {
      // a few not active yet: drafts, quotations, confirmed (not billed)
      const status = r < 0.01 ? 'DRAFT' : r < 0.025 ? 'QUOTATION' : 'CONFIRMED';
      const start = addDays(today, faker.number.int({ min: 1, max: 30 }));
      seeds.push({ lines, row: {
        customer_id: pick(customerIds), plan_id: plan.id, status, start_date: start, billing_anchor: null, next_billing_date: null,
        expiry_date: null, quotation_valid_until: status === 'QUOTATION' ? addDays(today, 20) : null,
        payment_terms_days: terms, created_by: b.staff.id,
      } });
      continue;
    }
    // more subscriptions early in the window, so most have months of history
    const offset = chance(0.55) ? faker.number.int({ min: 0, max: 30 }) : faker.number.int({ min: 0, max: windowDays });
    const start = addDays(windowStart, offset);
    // some monthly contracts have an end date; past ones are auto-closed by the backfill
    const expiry = plan.id === monthly.id && chance(0.08) ? addDays(start, faker.number.int({ min: 60, max: 150 })) : null;
    seeds.push({ lines, row: {
      customer_id: pick(customerIds), plan_id: plan.id, status: 'ACTIVE', start_date: start, billing_anchor: start,
      next_billing_date: start, expiry_date: expiry, quotation_valid_until: null, payment_terms_days: terms, created_by: b.staff.id,
    } });
  }
  for (const batch of chunks(seeds)) {
    const created = await prisma.subscriptions.createManyAndReturn({ data: batch.map((s) => s.row), select: { id: true, status: true } });
    await prisma.subscription_lines.createMany({
      data: created.flatMap((c, i) => batch[i].lines.map((l) => ({ ...l, subscription_id: c.id }))),
    });
    await prisma.subscription_status_history.createMany({
      data: created.map((c) => ({ subscription_id: c.id, from_status: null, to_status: c.status, changed_by: b.staff.id })),
    });
  }
  log(`${seeds.length} subscriptions (${Date.now() - t} ms)`);

  // ---------- backfill: the real engine, one run per day, up to yesterday ----------
  t = Date.now();
  let invoices = 0;
  let closed = 0;
  for (let day = windowStart; day <= yesterday; day = addDays(day, 1)) {
    const r = await runBilling(day);
    if (r.errors.length) throw new Error(`billing errors on ${toISODate(day)}: ${JSON.stringify(r.errors.slice(0, 3))}`);
    invoices += r.invoicesCreated;
    closed += r.closed;
    if (day.getUTCDate() === 1) log(`billed through ${toISODate(day)}: ${invoices} invoices so far`);
  }
  log(`backfill ${toISODate(windowStart)} … ${toISODate(yesterday)}: ${invoices} invoices, ${closed} auto-closed (${((Date.now() - t) / 1000).toFixed(1)} s)`);

  // ---------- confirm everything that was billed ----------
  await prisma.$executeRaw`
    UPDATE invoices SET status = 'CONFIRMED', confirmed_at = invoice_date + interval '10 hours' WHERE status = 'DRAFT'`;

  // ---------- payments ----------
  t = Date.now();
  const all = await prisma.invoices.findMany({
    select: { id: true, total: true, invoice_date: true, due_date: true },
    orderBy: { id: 'asc' },
  });
  const pastDue = all.filter((i) => i.due_date < today);
  const notDue = all.filter((i) => i.due_date >= today);
  const overdueIds = new Set(faker.helpers.arrayElements(pastDue, Math.round(all.length * OVERDUE_SHARE)).map((i) => i.id));

  const payDate = (inv: (typeof all)[number]) => {
    const lo = Math.max(addDays(inv.due_date, -5).getTime(), inv.invoice_date.getTime());
    const hi = Math.min(addDays(inv.due_date, 20).getTime(), today.getTime());
    if (hi < lo) return null;
    return new Date(lo + faker.number.int({ min: 0, max: Math.round((hi - lo) / 86_400_000) }) * 86_400_000);
  };
  const methods = ['UPI', 'UPI', 'UPI', 'BANK_TRANSFER', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'CASH'] as const;
  const payments: { invoice_id: bigint; method: (typeof methods)[number]; amount: string; paid_on: Date; reference: string; recorded_by: bigint }[] = [];
  const addPayment = (id: bigint, amount: Decimal, on: Date) =>
    payments.push({
      invoice_id: id, method: pick([...methods]), amount: amount.toFixed(2), paid_on: on,
      reference: `UTR${faker.string.numeric(10)}`, recorded_by: b.staff.id,
    });

  for (const inv of all) {
    const total = new Decimal(inv.total.toString());
    if (total.lte(0)) continue;
    const isOverdue = overdueIds.has(inv.id);
    // past due: paid unless picked as overdue; not yet due: about a third paid early
    if (!isOverdue && inv.due_date >= today && !chance(0.33)) continue;
    const date = payDate(inv);
    if (!date) continue;
    if (isOverdue) {
      // overdue: nothing paid, or part paid (still overdue)
      if (chance(0.4)) addPayment(inv.id, total.mul(faker.number.float({ min: 0.2, max: 0.7 })).toDecimalPlaces(2), date);
      continue;
    }
    if (chance(0.2) && total.gte(2)) {
      // two instalments
      const first = total.mul(faker.number.float({ min: 0.3, max: 0.7 })).toDecimalPlaces(2);
      const second = new Date(Math.min(date.getTime() + faker.number.int({ min: 1, max: 10 }) * 86_400_000, today.getTime()));
      addPayment(inv.id, first, date);
      addPayment(inv.id, total.minus(first), second);
    } else {
      addPayment(inv.id, total, date);
    }
  }
  for (const batch of chunks(payments)) await prisma.payments.createMany({ data: batch });
  // amount_paid is a cached sum of payments; PAID once it reaches the total
  await prisma.$executeRaw`
    UPDATE invoices i SET amount_paid = p.paid,
      status = CASE WHEN p.paid >= i.total THEN 'PAID'::invoice_status ELSE i.status END,
      paid_at = CASE WHEN p.paid >= i.total THEN p.last_paid::timestamptz + interval '12 hours' ELSE NULL END
    FROM (SELECT invoice_id, sum(amount) AS paid, max(paid_on) AS last_paid FROM payments GROUP BY invoice_id) p
    WHERE p.invoice_id = i.id`;
  log(`${payments.length} payments for ${all.length} invoices (${pastDue.length} past due, ${notDue.length} not yet due) (${Date.now() - t} ms)`);

  // ---------- some subscriptions paused or closed since ----------
  const active = await prisma.subscriptions.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, orderBy: { id: 'asc' } });
  const shuffled = faker.helpers.shuffle(active.map((a) => a.id));
  const toPause = shuffled.slice(0, Math.round(active.length * 0.04));
  const toClose = shuffled.slice(toPause.length, toPause.length + Math.round(active.length * 0.03));
  for (const id of toPause) {
    await prisma.subscriptions.update({ where: { id }, data: { status: 'PAUSED', paused_at: subDays(today, faker.number.int({ min: 1, max: 20 })) } });
  }
  await prisma.subscriptions.updateMany({ where: { id: { in: toClose } }, data: { status: 'CLOSED', closed_at: new Date() } });
  await prisma.subscription_status_history.createMany({
    data: [
      ...toPause.map((id) => ({ subscription_id: id, from_status: 'ACTIVE' as const, to_status: 'PAUSED' as const, changed_by: b.staff.id })),
      ...toClose.map((id) => ({ subscription_id: id, from_status: 'ACTIVE' as const, to_status: 'CLOSED' as const, changed_by: b.staff.id })),
    ],
  });
  log(`${toPause.length} paused, ${toClose.length} closed early`);
}

export async function printBigSummary(prisma: PrismaClient, started: number) {
  const [[s]] = await Promise.all([
    prisma.$queryRaw<Record<string, number>[]>`
      SELECT
        (SELECT count(*)::int FROM users WHERE role = 'CUSTOMER')                                    AS customers,
        (SELECT count(*)::int FROM subscriptions)                                                    AS subscriptions,
        (SELECT count(*)::int FROM subscriptions WHERE status = 'ACTIVE')                            AS active,
        (SELECT count(*)::int FROM subscriptions WHERE status = 'PAUSED')                            AS paused,
        (SELECT count(*)::int FROM subscriptions WHERE status = 'CLOSED')                            AS closed,
        (SELECT count(*)::int FROM subscriptions WHERE status IN ('DRAFT', 'QUOTATION', 'CONFIRMED')) AS not_started,
        (SELECT count(*)::int FROM subscriptions WHERE status = 'ACTIVE' AND next_billing_date <= CURRENT_DATE) AS due_today,
        (SELECT count(*)::int FROM invoices)                                                         AS invoices,
        (SELECT count(*)::int FROM invoices WHERE status = 'PAID')                                   AS paid,
        (SELECT count(*)::int FROM invoices WHERE status = 'CONFIRMED' AND amount_paid > 0)          AS part_paid,
        (SELECT count(*)::int FROM invoices
           WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE)           AS overdue,
        (SELECT count(*)::int FROM payments)                                                         AS payments,
        (SELECT count(*)::int FROM billing_runs)                                                     AS billing_runs`,
  ]);
  const pct = (n: number) => `${((100 * n) / s.invoices).toFixed(1)}%`;
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`  customers      ${s.customers}`);
  console.log(`  subscriptions  ${s.subscriptions}  (active ${s.active}, paused ${s.paused}, closed ${s.closed}, not started ${s.not_started})`);
  console.log(`  invoices       ${s.invoices}  (paid ${s.paid} = ${pct(s.paid)}, part-paid ${s.part_paid}, overdue ${s.overdue} = ${pct(s.overdue)})`);
  console.log(`  payments       ${s.payments}`);
  console.log(`  billing runs   ${s.billing_runs}`);
  console.log(`  due today      ${s.due_today} active subscriptions (a "Run billing now" bills them, the 10 demo ones included)`);
}

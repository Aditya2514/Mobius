// The billing engine (Backend Blueprint section 7). The ONLY code that creates invoices (AGENTS.md rule 4).
//  - safe to run twice: the header insert is ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING
//  - safe to run in parallel: each subscription is locked FOR UPDATE ... SKIP LOCKED
//  - never skips: a catch-up loop bills every missed period up to the run date
import { Prisma } from '@prisma/client';
import { addDays } from 'date-fns';
import { nextBoundary, type Period } from '../../lib/dates';
import { Decimal, toDecimal } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { loadDiscountRules, selectDiscounts, type DiscountRule } from '../discounts/discount.eligibility';
import { priceLine, type Disc } from './pricing';

type Tx = Prisma.TransactionClient;

/** subscriptions row + plan billing_period, as read under the row lock */
type LockedSub = {
  id: bigint;
  customer_id: bigint;
  start_date: Date;
  billing_anchor: Date | null;
  expiry_date: Date | null;
  next_billing_date: Date;
  payment_terms_days: number;
  billing_period: Period;
};

/** runDate must be a calendar date from todayIST() (or a date the admin picked) */
export async function runBilling(runDate: Date, triggeredBy?: bigint) {
  const run = await prisma.billing_runs.create({
    data: { run_date: runDate, triggered_by: triggeredBy ?? null },
  });
  let invoicesCreated = 0;
  const errors: { subscriptionId: string; message: string }[] = [];

  const due = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM subscriptions
    WHERE status = 'ACTIVE' AND next_billing_date <= ${runDate}::date ORDER BY id`;

  for (const { id } of due) {
    try {
      invoicesCreated += await prisma.$transaction((tx) => billOne(tx, id, runDate));
    } catch (e) {
      errors.push({ subscriptionId: id.toString(), message: (e as Error).message });
    }
  }
  const closed = await autoClose(runDate);
  await prisma.billing_runs.update({ where: { id: run.id }, data: {
    finished_at: new Date(), invoices_created: invoicesCreated, subscriptions_closed: closed, errors } });
  return { invoicesCreated, closed, errors };
}

export async function billOne(tx: Tx, id: bigint, runDate: Date): Promise<number> {
  const rows = await tx.$queryRaw<LockedSub[]>`
    SELECT s.*, p.billing_period FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.id = ${id} AND s.status = 'ACTIVE' FOR UPDATE OF s SKIP LOCKED`;
  if (rows.length === 0) return 0;                    // another run holds it, or it's no longer active
  const sub = rows[0];
  // periods count from the billing anchor: the start date, shifted by any pauses
  const anchor = sub.billing_anchor ?? sub.start_date;
  let created = 0;
  let periodStart: Date = sub.next_billing_date;
  while (periodStart <= runDate && (!sub.expiry_date || periodStart <= sub.expiry_date)) {
    const periodEnd = nextBoundary(anchor, sub.billing_period, periodStart);
    if (await createInvoice(tx, sub, periodStart, periodEnd, runDate)) created++;
    periodStart = periodEnd;                          // catch-up: nothing skipped
  }
  await tx.$executeRaw`UPDATE subscriptions SET next_billing_date = ${periodStart}::date,
                       updated_at = now() WHERE id = ${id}`;
  return created;
}

export async function createInvoice(tx: Tx, sub: LockedSub, start: Date, end: Date, invoiceDate: Date) {
  const customer = await tx.users.findUniqueOrThrow({ where: { id: sub.customer_id } });
  const due = addDays(invoiceDate, sub.payment_terms_days);
  const inserted = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO invoices (subscription_id, customer_id, period_start, period_end,
                          invoice_date, due_date, bill_to_name, bill_to_email, bill_to_address)
    VALUES (${sub.id}, ${sub.customer_id}, ${start}::date, ${end}::date, ${invoiceDate}::date,
            ${due}::date, ${customer.full_name}, ${customer.email}, ${customer.address})
    ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING RETURNING id`;
  if (inserted.length === 0) return false;           // already billed → idempotent
  const invoiceId = inserted[0].id;

  const lines = await tx.subscription_lines.findMany({
    where: { subscription_id: sub.id },
    orderBy: { id: 'asc' },
    include: { products: true, product_variants: true, taxes: true },
  });

  // same selection as the preview; then claim each chosen discount atomically
  const applied = await chooseAndClaim(tx, sub.id, lines, invoiceDate);
  const used = new Set(applied.flatMap((d) => (d ? [d.id] : [])));

  let subtotal = new Decimal(0), discountTotal = new Decimal(0), taxTotal = new Decimal(0);
  for (const [i, line] of lines.entries()) {
    const taxRate = toDecimal(line.taxes?.rate ?? 0);
    const p = priceLine(toDecimal(line.unit_price), line.quantity, taxRate, applied[i]);
    const label = line.product_variants
      ? `${line.products.name} (${line.product_variants.attribute}: ${line.product_variants.value})`
      : line.products.name;
    await tx.invoice_lines.create({ data: {
      invoice_id: invoiceId, product_id: line.product_id, description: label,
      quantity: line.quantity, unit_price: line.unit_price, line_subtotal: p.subtotal.toString(),
      discount_id: applied[i]?.id ?? null, discount_amount: p.discount.toString(),
      tax_name: line.taxes?.name ?? null, tax_rate: taxRate.toString(),
      tax_amount: p.tax.toString(), line_total: p.total.toString() } });
    subtotal = subtotal.plus(p.subtotal);
    discountTotal = discountTotal.plus(p.discount);
    taxTotal = taxTotal.plus(p.tax);
  }
  for (const discountId of used) {                   // one usage = one invoice, however many lines
    await tx.$executeRaw`
      INSERT INTO discount_redemptions (discount_id, invoice_id, amount)
      SELECT ${discountId}, ${invoiceId}, COALESCE(SUM(discount_amount), 0)
      FROM invoice_lines WHERE invoice_id = ${invoiceId} AND discount_id = ${discountId}`;
  }
  const total = subtotal.minus(discountTotal).plus(taxTotal);
  await tx.$executeRaw`
    UPDATE invoices SET subtotal = ${subtotal.toString()}::numeric,
      discount_total = ${discountTotal.toString()}::numeric,
      tax_total = ${taxTotal.toString()}::numeric, total = ${total.toString()}::numeric
      ${process.env.AUTO_CONFIRM_INVOICES === 'true'
        ? Prisma.sql`, status = 'CONFIRMED', confirmed_at = now()` : Prisma.empty}
    WHERE id = ${invoiceId}`;
  return true;
}

/**
 * Pick discounts with the shared selectDiscounts(), then claim each chosen one with the
 * conditional UPDATE. A failed claim (limit reached meanwhile) removes that discount and the
 * selection runs again. A slot claimed earlier but no longer chosen is handed back.
 */
async function chooseAndClaim(
  tx: Tx,
  subscriptionId: bigint,
  lines: { product_id: bigint; quantity: number; unit_price: Prisma.Decimal }[],
  onDate: Date,
): Promise<(Disc | undefined)[]> {
  let rules: DiscountRule[] = await loadDiscountRules(tx, [subscriptionId], onDate);
  const claimed = new Set<bigint>();
  for (;;) {
    const applied = selectDiscounts(subscriptionId, lines, rules);
    // Claim in ascending id order: every run then locks discount rows in the same order, so two
    // overlapping runs can wait on each other but never deadlock (A holds 1 wants 2, B holds 2 wants 1).
    const chosen = [...new Set(applied.flatMap((d) => (d ? [d.id] : [])))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    let lost: bigint | undefined;
    for (const id of chosen) {
      if (claimed.has(id)) continue;
      if (await claimSlot(tx, id)) claimed.add(id);
      else { lost = id; break; }
    }
    if (lost === undefined) {
      for (const id of claimed) if (!chosen.includes(id)) await releaseSlot(tx, id);
      return applied;
    }
    rules = rules.filter((r) => r.id !== lost);      // used up meanwhile: choose again without it
  }
}

/** atomic: two invoices can never both take the last slot */
async function claimSlot(tx: Tx, discountId: bigint): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE discounts SET used_count = used_count + 1
    WHERE id = ${discountId} AND (usage_limit IS NULL OR used_count < usage_limit)`;
  return n === 1;
}

/** give back a slot this same transaction claimed but ended up not using */
async function releaseSlot(tx: Tx, discountId: bigint) {
  await tx.$executeRaw`UPDATE discounts SET used_count = used_count - 1 WHERE id = ${discountId} AND used_count > 0`;
}

async function autoClose(runDate: Date): Promise<number> {
  return prisma.$executeRaw`
    WITH closed AS (
      UPDATE subscriptions s SET status = 'CLOSED', closed_at = now(), updated_at = now()
      FROM plans p
      WHERE p.id = s.plan_id AND p.auto_close AND s.status = 'ACTIVE'
        AND s.expiry_date IS NOT NULL AND s.expiry_date < ${runDate}::date
      RETURNING s.id)
    INSERT INTO subscription_status_history (subscription_id, from_status, to_status)
    SELECT id, 'ACTIVE', 'CLOSED' FROM closed`;
}

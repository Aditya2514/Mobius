import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { fromISODate } from '../../lib/dates';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mailer';
import { renderPdf } from '../../lib/pdf';
import { AppError, notFound } from '../../lib/errors';
import { toDecimal } from '../../lib/money';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { ownScope, type AuthUser } from '../../middleware/auth';
import { day, money, renderInvoiceHtml } from './invoice.render';
import type { ListInvoicesQuery } from './invoice.schema';

/** a row of v_invoice_balance (+ subscription number) */
type InvoiceRow = {
  id: bigint;
  number: string;
  subscription_id: bigint;
  subscription_number: string;
  customer_id: bigint;
  status: string;
  is_overdue: boolean;
  period_start: Date;
  period_end: Date;
  invoice_date: Date;
  due_date: Date;
  bill_to_name: string;
  bill_to_email: string;
  bill_to_address: string | null;
  subtotal: Prisma.Decimal;
  discount_total: Prisma.Decimal;
  tax_total: Prisma.Decimal;
  total: Prisma.Decimal;
  amount_paid: Prisma.Decimal;
  balance_due: Prisma.Decimal;
  sent_at: Date | null;
};

// balance_due and is_overdue come from the view: overdue is derived, never stored
const COLUMNS = Prisma.sql`
  v.id, v.number, v.subscription_id, s.number AS subscription_number, v.customer_id, v.status, v.is_overdue,
  v.period_start, v.period_end, v.invoice_date, v.due_date, v.bill_to_name, v.bill_to_email, v.bill_to_address,
  v.subtotal, v.discount_total, v.tax_total, v.total, v.amount_paid, v.balance_due, v.sent_at`;

// same rule as v_invoice_balance.is_overdue, written on the base columns so idx_invoices_status_due is used
const OVERDUE = Prisma.sql`(v.status = 'CONFIRMED' AND v.amount_paid < v.total AND v.due_date < CURRENT_DATE)`;

const toHeader = (inv: InvoiceRow) => ({
  id: inv.id,
  number: inv.number,
  subscriptionId: inv.subscription_id,
  subscriptionNumber: inv.subscription_number,
  customerId: inv.customer_id,
  status: inv.status,
  isOverdue: inv.is_overdue,
  periodStart: inv.period_start,
  periodEnd: inv.period_end,
  invoiceDate: inv.invoice_date,
  dueDate: inv.due_date,
  billTo: { name: inv.bill_to_name, email: inv.bill_to_email, address: inv.bill_to_address },
  subtotal: inv.subtotal,
  discountTotal: inv.discount_total,
  taxTotal: inv.tax_total,
  total: inv.total,
  amountPaid: inv.amount_paid,
  balanceDue: inv.balance_due,
  sentAt: inv.sent_at,
});

/** the customer a CUSTOMER user is limited to (ownScope), or null for staff */
function scopedCustomerId(user: AuthUser): bigint | null {
  const scope = ownScope(user);
  return 'customer_id' in scope ? (scope.customer_id ?? null) : null;
}

// ---------- read ----------

/** Lists read v_invoice_balance; every filter maps to an indexed column. Customers see only their own. */
export async function listInvoices(q: ListInvoicesQuery, user: AuthUser) {
  const page = toPage(
    q,
    {
      invoiceDate: 'invoice_date', dueDate: 'due_date', number: 'number', total: 'total',
      balanceDue: 'balance_due', status: 'status', createdAt: 'created_at',
    },
    '-invoiceDate',
  );
  const [[column, dir]] = Object.entries(page.orderBy); // whitelisted by toPage
  const conds: Prisma.Sql[] = [];
  const own = scopedCustomerId(user);
  if (own !== null) {
    conds.push(Prisma.sql`v.customer_id = ${own}`);
    conds.push(Prisma.sql`v.status <> 'DRAFT'`); // drafts are staff-only until confirmed
  }
  else if (q.customerId) conds.push(Prisma.sql`v.customer_id = ${BigInt(q.customerId)}`);
  if (q.subscriptionId) conds.push(Prisma.sql`v.subscription_id = ${BigInt(q.subscriptionId)}`);
  if (q.status) conds.push(Prisma.sql`v.status = ${q.status}::invoice_status`);
  if (q.overdue === true) conds.push(OVERDUE);
  if (q.overdue === false) conds.push(Prisma.sql`NOT ${OVERDUE}`);
  if (q.from) conds.push(Prisma.sql`v.invoice_date >= ${fromISODate(q.from)}::date`);
  if (q.to) conds.push(Prisma.sql`v.invoice_date <= ${fromISODate(q.to)}::date`);
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(Prisma.sql`(v.number ILIKE ${like} OR v.bill_to_name ILIKE ${like} OR v.bill_to_email ILIKE ${like})`);
  }
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
  const order = Prisma.raw(`v.${column} ${dir.toUpperCase()}, v.id ${dir.toUpperCase()}`);

  const [rows, [{ n }]] = await Promise.all([
    prisma.$queryRaw<InvoiceRow[]>`
      SELECT ${COLUMNS} FROM v_invoice_balance v JOIN subscriptions s ON s.id = v.subscription_id
      ${where} ORDER BY ${order} LIMIT ${page.take} OFFSET ${page.skip}`,
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM v_invoice_balance v ${where}`,
  ]);
  return listResult(rows.map(toHeader), n, page);
}

/** Invoice with lines and payments. A customer asking for someone else's invoice gets 404. */
export async function getInvoice(id: bigint, user: AuthUser) {
  const own = scopedCustomerId(user);
  const [inv] = await prisma.$queryRaw<InvoiceRow[]>`
    SELECT ${COLUMNS} FROM v_invoice_balance v JOIN subscriptions s ON s.id = v.subscription_id
    WHERE v.id = ${id} AND (${own}::bigint IS NULL OR (v.customer_id = ${own}::bigint AND v.status <> 'DRAFT'))`;
  if (!inv) throw notFound('Invoice');

  const [lines, payments] = await Promise.all([
    prisma.invoice_lines.findMany({
      where: { invoice_id: id },
      orderBy: { id: 'asc' },
      select: {
        id: true, description: true, quantity: true, unit_price: true, line_subtotal: true,
        discount_amount: true, tax_name: true, tax_rate: true, tax_amount: true, line_total: true,
      },
    }),
    prisma.payments.findMany({
      where: { invoice_id: id },
      orderBy: [{ paid_on: 'asc' }, { id: 'asc' }],
      select: { id: true, method: true, amount: true, paid_on: true, reference: true, note: true },
    }),
  ]);
  return { ...toHeader(inv), lines, payments };
}

// ---------- status changes ----------
// DRAFT → CONFIRMED (≥ 1 line, total > 0) · DRAFT → CANCELLED · CONFIRMED → CANCELLED (nothing paid)
// CONFIRMED → PAID happens only when a payment completes it. PAID and CANCELLED are final.

type Locked = { id: bigint; status: string; total: Prisma.Decimal; amount_paid: Prisma.Decimal; lines: number };

async function lockInvoice(tx: Prisma.TransactionClient, id: bigint): Promise<Locked> {
  const [inv] = await tx.$queryRaw<Omit<Locked, 'lines'>[]>`
    SELECT id, status, total, amount_paid FROM invoices WHERE id = ${id} FOR UPDATE`;
  if (!inv) throw notFound('Invoice');
  const lines = await tx.invoice_lines.count({ where: { invoice_id: id } });
  return { ...inv, lines };
}

const finalState = (status: string) =>
  new AppError(400, 'INVALID_TRANSITION', `A ${status.toLowerCase()} invoice cannot change`, { status });

/** why a DRAFT can't be confirmed, or null if it can */
function confirmBlocker(inv: Locked): AppError | null {
  if (inv.status !== 'DRAFT') {
    return new AppError(400, 'INVALID_TRANSITION', 'Only a draft invoice can be confirmed', { status: inv.status });
  }
  if (inv.lines === 0) return new AppError(400, 'BUSINESS_RULE', 'An invoice without lines cannot be confirmed');
  if (!toDecimal(inv.total).gt(0)) return new AppError(400, 'BUSINESS_RULE', 'An invoice with a zero total cannot be confirmed');
  return null;
}

export async function confirmInvoice(id: bigint, user: AuthUser) {
  await prisma.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, id);
    const blocker = confirmBlocker(inv);
    if (blocker) throw blocker;
    await tx.$executeRaw`UPDATE invoices SET status = 'CONFIRMED', confirmed_at = now() WHERE id = ${id}`;
  });
  return getInvoice(id, user);
}

/** Confirms every eligible draft; reports the rest with a reason. Each invoice stands alone. */
export async function bulkConfirm(ids: string[]) {
  const confirmed: bigint[] = [];
  const skipped: { id: bigint; reason: string }[] = [];
  for (const raw of [...new Set(ids)]) {
    const id = BigInt(raw);
    try {
      await prisma.$transaction(async (tx) => {
        const inv = await lockInvoice(tx, id);
        const blocker = confirmBlocker(inv);
        if (blocker) throw blocker;
        await tx.$executeRaw`UPDATE invoices SET status = 'CONFIRMED', confirmed_at = now() WHERE id = ${id}`;
      });
      confirmed.push(id);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      skipped.push({ id, reason: e.message });
    }
  }
  return { confirmed, skipped };
}

/** A cancelled invoice keeps any discount slot it used (by design: simpler and auditable). */
export async function cancelInvoice(id: bigint, user: AuthUser) {
  await prisma.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, id);
    if (inv.status === 'PAID' || inv.status === 'CANCELLED') throw finalState(inv.status);
    if (inv.status === 'CONFIRMED' && !toDecimal(inv.amount_paid).isZero()) {
      throw new AppError(400, 'BUSINESS_RULE', 'An invoice with payments recorded cannot be cancelled');
    }
    await tx.$executeRaw`UPDATE invoices SET status = 'CANCELLED', cancelled_at = now() WHERE id = ${id}`;
  });
  return getInvoice(id, user);
}

// ---------- documents: print, PDF, email ----------

/** Printable HTML (browser Save as PDF works without Puppeteer). Scoped like the detail. */
export async function invoiceHtml(id: bigint, user: AuthUser) {
  return renderInvoiceHtml(await getInvoice(id, user));
}

/** The same page as an A4 PDF via headless Chrome; 503 PDF_UNAVAILABLE if Chrome can't start. */
export async function invoicePdf(id: bigint, user: AuthUser) {
  const detail = await getInvoice(id, user);
  return { number: detail.number, pdf: await renderPdf(renderInvoiceHtml(detail)) };
}

/**
 * Email the invoice to its bill-to address, PDF attached. If the PDF can't be made, the email
 * carries the invoice as HTML plus a link to the portal instead. Sets sent_at.
 */
export async function sendInvoice(id: bigint, user: AuthUser) {
  const detail = await getInvoice(id, user);
  if (detail.status !== 'CONFIRMED' && detail.status !== 'PAID') {
    throw new AppError(400, 'BUSINESS_RULE', 'Only confirmed or paid invoices can be sent', { status: detail.status });
  }
  const html = renderInvoiceHtml(detail);
  const balance = money(String(detail.balanceDue));
  const intro =
    `Dear ${detail.billTo.name},\n\nPlease find invoice ${detail.number} dated ${day(serializeDate(detail.invoiceDate))}. ` +
    (detail.status === 'PAID' ? 'It has been paid in full. Thank you!' : `Balance due: ${balance}, by ${day(serializeDate(detail.dueDate))}.`);

  let pdf: Buffer | null = null;
  try {
    pdf = await renderPdf(html);
  } catch (err) {
    logger.warn({ err, invoiceId: id.toString() }, 'invoice PDF failed; sending the HTML version instead');
  }
  const portal = `${env.APP_URL}/portal/invoices`;
  await sendMail({
    to: detail.billTo.email,
    subject: `Invoice ${detail.number} from Brightloop Software`,
    text: pdf
      ? `${intro}\n\nThe invoice is attached as a PDF. You can also view it any time at ${portal}.\n`
      : `${intro}\n\nView or print your invoice at ${portal}.\n`,
    ...(pdf
      ? { attachments: [{ filename: `${detail.number}.pdf`, content: pdf, contentType: 'application/pdf' }] }
      : { html }),
  });
  await prisma.invoices.update({ where: { id }, data: { sent_at: new Date() } });
  return { ...(await getInvoice(id, user)), pdfAttached: pdf !== null };
}

const serializeDate = (d: Date) => d.toISOString().slice(0, 10);

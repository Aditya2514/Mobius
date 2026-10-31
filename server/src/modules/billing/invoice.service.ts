import type { Prisma } from '@prisma/client';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { ownScope, type AuthUser } from '../../middleware/auth';

type InvoiceBalanceRow = {
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

/** Invoice with lines and payments. A customer asking for someone else's invoice gets 404. */
export async function getInvoice(id: bigint, user: AuthUser) {
  const scope = ownScope(user);
  const customerId = 'customer_id' in scope ? scope.customer_id : null;

  // v_invoice_balance derives balance_due and is_overdue; overdue is never stored
  const [inv] = await prisma.$queryRaw<InvoiceBalanceRow[]>`
    SELECT v.*, s.number AS subscription_number
    FROM v_invoice_balance v JOIN subscriptions s ON s.id = v.subscription_id
    WHERE v.id = ${id} AND (${customerId}::bigint IS NULL OR v.customer_id = ${customerId}::bigint)`;
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

  return {
    id: inv.id,
    number: inv.number,
    subscriptionId: inv.subscription_id,
    subscriptionNumber: inv.subscription_number,
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
    lines,
    payments,
  };
}

import { Prisma } from '@prisma/client';
import { fromISODate } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { Decimal } from '../../lib/money';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { ownScope, type AuthUser } from '../../middleware/auth';
import type { ListPaymentsQuery, RecordPaymentBody } from './payment.schema';

/**
 * Backend Blueprint section 7, one transaction: lock the invoice, require CONFIRMED, check the
 * amount against the balance, insert the payment, add it to amount_paid, and mark PAID at full.
 */
export async function recordPayment(invoiceId: bigint, body: RecordPaymentBody, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const [inv] = await tx.$queryRaw<{ status: string; total: Prisma.Decimal; amount_paid: Prisma.Decimal }[]>`
      SELECT * FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'CONFIRMED')
      throw new AppError(400, 'BUSINESS_RULE', 'Only confirmed invoices accept payments');
    const amount = new Decimal(body.amount);
    const balance = new Decimal(inv.total.toString()).minus(inv.amount_paid.toString());
    if (amount.lte(0) || amount.gt(balance))
      throw new AppError(400, 'BUSINESS_RULE', `Amount must be between 0.01 and ${balance.toFixed(2)}`, { field: 'amount' });

    const payment = await tx.payments.create({
      data: {
        invoice_id: invoiceId,
        method: body.method,
        amount: amount.toString(),
        paid_on: fromISODate(body.paidOn),
        reference: body.reference ?? null,
        note: body.note ?? null,
        recorded_by: BigInt(user.id),
      },
      include: {
        users: { select: { id: true, full_name: true } },
      },
    });

    const paid = new Decimal(inv.amount_paid.toString()).plus(amount);
    const fullyPaid = paid.gte(inv.total.toString());
    await tx.$executeRaw`
      UPDATE invoices SET amount_paid = ${paid.toString()}::numeric
        ${fullyPaid ? Prisma.sql`, status = 'PAID', paid_at = now()` : Prisma.empty}
      WHERE id = ${invoiceId}`;
    return {
      id: payment.id,
      invoice_id: payment.invoice_id,
      method: payment.method,
      amount: payment.amount,
      paid_on: payment.paid_on,
      reference: payment.reference,
      note: payment.note,
      created_at: payment.created_at,
      recorded_by: { id: payment.users.id, name: payment.users.full_name },
    };
  });
}

/** Customers see payments on their own invoices only. */
export async function listPayments(q: ListPaymentsQuery, user: AuthUser) {
  const page = toPage(q, { paidOn: 'paid_on', amount: 'amount', createdAt: 'created_at' }, '-paidOn');
  const where: Prisma.paymentsWhereInput = {
    ...(q.method ? { method: q.method } : {}),
    ...(q.invoiceId ? { invoice_id: BigInt(q.invoiceId) } : {}),
    ...(q.from || q.to
      ? { paid_on: { ...(q.from ? { gte: fromISODate(q.from) } : {}), ...(q.to ? { lte: fromISODate(q.to) } : {}) } }
      : {}),
    invoices: ownScope(user),
  };
  const isCustomer = user.role === 'CUSTOMER';
  const [rows, total] = await prisma.$transaction([
    prisma.payments.findMany({
      where,
      include: {
        invoices: { select: { number: true } },
        users: { select: { id: true, full_name: true } },
      },
      orderBy: [page.orderBy, { id: 'desc' }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.payments.count({ where }),
  ]);
  const data = rows.map((p) => ({
    id: p.id,
    invoiceId: p.invoice_id,
    invoiceNumber: p.invoices.number,
    method: p.method,
    amount: p.amount,
    paidOn: p.paid_on,
    reference: p.reference,
    note: p.note,
    createdAt: p.created_at,
    // who recorded it is internal
    ...(isCustomer ? {} : { recordedBy: { id: p.users.id, name: p.users.full_name } }),
  }));
  return listResult(data, total, page);
}

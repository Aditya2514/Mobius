// Reports (Backend Blueprint section 9): every number is aggregated inside PostgreSQL in a few
// queries; Node only formats. CURRENT_DATE is the India date (database timezone, migration 0002).
import { Prisma } from '@prisma/client';
import { addMonths, differenceInCalendarMonths, startOfMonth } from 'date-fns';
import { fromISODate, todayIST } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { Decimal, r2, toDecimal } from '../../lib/money';
import { listResult, toPage, type PaginationQuery } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import type { RevenueQuery } from './report.schema';

type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** monthly equivalent of one billing period: yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12 */
const MONTHLY_FACTOR: Record<Period, Decimal> = {
  DAILY: new Decimal(365).div(12),
  WEEKLY: new Decimal(52).div(12),
  MONTHLY: new Decimal(1),
  YEARLY: new Decimal(1).div(12),
};

/**
 * Active subscriptions and MRR per plan. MRR = active line amounts normalised to a month,
 * before discount and tax. The summary's MRR is the sum of these rows, so the card and the
 * chart always agree to the paisa.
 */
async function mrrByPlan() {
  const rows = await prisma.$queryRaw<
    { id: bigint; name: string; billing_period: Period; active: number; line_amount: Prisma.Decimal }[]
  >`
    SELECT p.id, p.name, p.billing_period, count(DISTINCT s.id)::int AS active,
           COALESCE(sum(sl.quantity * sl.unit_price), 0) AS line_amount
    FROM plans p
    LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'ACTIVE'
    LEFT JOIN subscription_lines sl ON sl.subscription_id = s.id
    GROUP BY p.id ORDER BY active DESC, p.id`;
  return rows.map((p) => ({
    planId: p.id,
    planName: p.name,
    billingPeriod: p.billing_period,
    active: p.active,
    mrr: r2(toDecimal(p.line_amount).mul(MONTHLY_FACTOR[p.billing_period])),
  }));
}

export const subscriptionsByPlan = mrrByPlan;

/** Dashboard cards. */
export async function summary() {
  const [[cards], plans] = await Promise.all([
    prisma.$queryRaw<
      {
        active_subscriptions: number;
        revenue_this_month: Prisma.Decimal;
        outstanding: Prisma.Decimal;
        overdue_count: number;
        overdue_amount: Prisma.Decimal;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM subscriptions WHERE status = 'ACTIVE')                    AS active_subscriptions,
        (SELECT COALESCE(sum(amount), 0) FROM payments
           WHERE paid_on >= date_trunc('month', CURRENT_DATE))                               AS revenue_this_month,
        (SELECT COALESCE(sum(total - amount_paid), 0) FROM invoices WHERE status = 'CONFIRMED') AS outstanding,
        (SELECT count(*)::int FROM invoices
           WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE)    AS overdue_count,
        (SELECT COALESCE(sum(total - amount_paid), 0) FROM invoices
           WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE)    AS overdue_amount`,
    mrrByPlan(),
  ]);
  return {
    activeSubscriptions: cards.active_subscriptions,
    revenueThisMonth: cards.revenue_this_month,
    outstanding: cards.outstanding,
    overdueCount: cards.overdue_count,
    overdueAmount: cards.overdue_amount,
    mrr: plans.reduce((sum, p) => sum.plus(p.mrr), new Decimal(0)),
  };
}

/** Payments received per month (cash basis), months with no payments included as 0.00. */
export async function revenue(q: RevenueQuery) {
  const to = q.to ? fromISODate(q.to) : todayIST();
  const from = q.from ? fromISODate(q.from) : addMonths(startOfMonth(to), -11);
  if (from > to) throw new AppError(400, 'VALIDATION_ERROR', '"from" must be on or before "to"', { field: 'from' });
  if (differenceInCalendarMonths(to, from) > 36) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Pick a range of at most 36 months', { field: 'from' });
  }
  const rows = await prisma.$queryRaw<{ month: string; amount: Prisma.Decimal }[]>`
    WITH months AS (
      SELECT generate_series(date_trunc('month', ${from}::date), date_trunc('month', ${to}::date), interval '1 month')::date AS m),
    paid AS (
      SELECT date_trunc('month', paid_on)::date AS m, sum(amount) AS amount
      FROM payments WHERE paid_on BETWEEN ${from}::date AND ${to}::date GROUP BY 1)
    SELECT to_char(months.m, 'YYYY-MM') AS month, COALESCE(paid.amount, 0) AS amount
    FROM months LEFT JOIN paid ON paid.m = months.m ORDER BY months.m`;
  return rows;
}

/** Overdue invoices, oldest due date first, with days overdue. */
export async function overdue(q: PaginationQuery) {
  const page = toPage(q, { dueDate: 'due_date' }, 'dueDate');
  const dir = Prisma.raw(page.orderBy.due_date === 'desc' ? 'DESC' : 'ASC'); // whitelisted, never user text
  const [rows, [{ n }]] = await Promise.all([
    prisma.$queryRaw<
      {
        id: bigint; number: string; customer_id: bigint; subscription_number: string; bill_to_name: string;
        due_date: Date; days_overdue: number; total: Prisma.Decimal; amount_paid: Prisma.Decimal; balance_due: Prisma.Decimal;
      }[]
    >`
      SELECT i.id, i.number, i.customer_id, s.number AS subscription_number, i.bill_to_name, i.due_date,
             (CURRENT_DATE - i.due_date) AS days_overdue, i.total, i.amount_paid, (i.total - i.amount_paid) AS balance_due
      FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
      WHERE i.status = 'CONFIRMED' AND i.amount_paid < i.total AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date ${dir}, i.id
      LIMIT ${page.take} OFFSET ${page.skip}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM invoices
      WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE`,
  ]);
  return listResult(rows, n, page);
}

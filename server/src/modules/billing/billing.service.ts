import { fromISODate, todayIST, toISODate } from '../../lib/dates';
import { AppError, notFound } from '../../lib/errors';
import { listResult, toPage, type PaginationQuery } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { billOne, runBilling } from './engine';

/** POST /billing/run: bill everything due up to `date` (default: today in India). */
export async function runNow(date: string | undefined, adminId: bigint) {
  const today = todayIST();
  const runDate = date ? fromISODate(date) : today;
  if (runDate > today) {
    throw new AppError(400, 'BUSINESS_RULE', `Billing can't run for a future date (today is ${toISODate(today)})`, { field: 'date' });
  }
  return runBilling(runDate, adminId);
}

/** POST /subscriptions/:id/invoice: the same engine path for one subscription, so it is just as idempotent. */
export async function billSubscriptionNow(id: bigint) {
  const sub = await prisma.subscriptions.findUnique({ where: { id }, select: { status: true } });
  if (!sub) throw notFound('Subscription');
  if (sub.status !== 'ACTIVE') {
    throw new AppError(400, 'BUSINESS_RULE', 'Only active subscriptions are billed', { status: sub.status });
  }
  const invoicesCreated = await prisma.$transaction((tx) => billOne(tx, id, todayIST()));
  return { invoicesCreated };
}

export async function listRuns(q: PaginationQuery) {
  const page = toPage(q, { startedAt: 'started_at', runDate: 'run_date' }, '-startedAt');
  const [rows, total] = await prisma.$transaction([
    prisma.billing_runs.findMany({
      include: { users: { select: { id: true, full_name: true } } },
      orderBy: page.orderBy,
      skip: page.skip,
      take: page.take,
    }),
    prisma.billing_runs.count(),
  ]);
  const data = rows.map(({ users, triggered_by: _by, ...r }) => ({
    ...r,
    triggeredBy: users ? { id: users.id, name: users.full_name } : null, // null = scheduler
  }));
  return listResult(data, total, page);
}

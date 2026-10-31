import type { Prisma } from '@prisma/client';
import { fromISODate, todayIST, toISODate } from '../../lib/dates';
import { AppError, notFound } from '../../lib/errors';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../middleware/auth';
import type { CreatePlanBody, ListPlansQuery, UpdatePlanBody } from './plan.schema';

/** Active and today (India date, never new Date()) within available_from … available_to. */
export function availableOn(day: Date = todayIST()): Prisma.plansWhereInput {
  return {
    is_active: true,
    available_from: { lte: day },
    OR: [{ available_to: null }, { available_to: { gte: day } }],
  };
}

/** Used by subscription creation in Phase 2: 400 BUSINESS_RULE if the plan can't be chosen today. */
export async function assertPlanAvailable(planId: bigint, day: Date = todayIST()) {
  const plan = await prisma.plans.findFirst({ where: { id: planId, ...availableOn(day) } });
  if (!plan) throw new AppError(400, 'BUSINESS_RULE', 'This plan is not available today', { field: 'planId' });
  return plan;
}

function checkDates(from: string, to: string | null) {
  if (to && to < from) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Available-to must be on or after available-from', { field: 'availableTo' });
  }
}

/** Customers only ever see plans available today. */
export async function listPlans(q: ListPlansQuery, user: AuthUser) {
  const page = toPage(q, { name: 'name', price: 'price', createdAt: 'created_at', availableFrom: 'available_from' }, 'name');
  const onlyAvailable = user.role === 'CUSTOMER' || q.available === true;
  const where: Prisma.plansWhereInput = {
    ...(onlyAvailable ? availableOn() : {}),
    ...(q.active !== undefined && !onlyAvailable ? { is_active: q.active } : {}),
    ...(q.billingPeriod ? { billing_period: q.billingPeriod } : {}),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.plans.findMany({ where, orderBy: page.orderBy, skip: page.skip, take: page.take }),
    prisma.plans.count({ where }),
  ]);
  return listResult(data, total, page);
}

export async function getPlan(id: bigint, user: AuthUser) {
  const plan = await prisma.plans.findFirst({ where: { id, ...(user.role === 'CUSTOMER' ? availableOn() : {}) } });
  if (!plan) throw notFound('Plan');
  return plan;
}

export async function createPlan(body: CreatePlanBody) {
  checkDates(body.availableFrom, body.availableTo);
  return prisma.plans.create({
    data: {
      name: body.name,
      price: body.price,
      billing_period: body.billingPeriod,
      min_quantity: body.minQuantity,
      available_from: fromISODate(body.availableFrom),
      available_to: body.availableTo ? fromISODate(body.availableTo) : null,
      auto_close: body.autoClose,
      is_closable: body.isClosable,
      is_pausable: body.isPausable,
      is_renewable: body.isRenewable,
      is_active: body.isActive,
    },
  });
}

/**
 * Flag changes (pausable, closable, …) apply from now on; they never rewrite past history.
 * Changing billingPeriod on a plan with subscriptions is refused: their periods are anchored to it.
 */
export async function updatePlan(id: bigint, body: UpdatePlanBody) {
  const current = await prisma.plans.findUnique({ where: { id } });
  if (!current) throw notFound('Plan');
  checkDates(
    body.availableFrom ?? toISODate(current.available_from),
    body.availableTo !== undefined ? body.availableTo : current.available_to && toISODate(current.available_to),
  );
  if (body.billingPeriod && body.billingPeriod !== current.billing_period) {
    const used = await prisma.subscriptions.count({ where: { plan_id: id } });
    if (used > 0) {
      throw new AppError(400, 'BUSINESS_RULE', 'Billing period cannot change once subscriptions use this plan; create a new plan', {
        field: 'billingPeriod',
      });
    }
  }
  return prisma.plans.update({
    where: { id },
    data: {
      name: body.name,
      price: body.price,
      billing_period: body.billingPeriod,
      min_quantity: body.minQuantity,
      available_from: body.availableFrom ? fromISODate(body.availableFrom) : undefined,
      available_to: body.availableTo === undefined ? undefined : body.availableTo ? fromISODate(body.availableTo) : null,
      auto_close: body.autoClose,
      is_closable: body.isClosable,
      is_pausable: body.isPausable,
      is_renewable: body.isRenewable,
      is_active: body.isActive,
    },
  });
}

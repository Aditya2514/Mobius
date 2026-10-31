import type { Prisma } from '@prisma/client';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { fromISODate, todayIST, toISODate } from '../../lib/dates';
import { AppError, notFound } from '../../lib/errors';
import { toDecimal } from '../../lib/money';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { ownScope, type AuthUser } from '../../middleware/auth';
import { loadDiscountRules, previewTotals, type PreviewLine } from '../billing/preview';
import { availableOn } from '../plans/plan.service';
import { allowedActions, CUSTOMER_ACTIONS, nextStatus, type Action } from './stateMachine';
import type {
  CreateSubscriptionBody, LineBody, ListSubscriptionsQuery, UpdateLineBody, UpdateSubscriptionBody,
} from './subscription.schema';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

const DEFAULT_QUOTE_VALIDITY_DAYS = 30;
const EDITABLE = ['DRAFT', 'QUOTATION'];

// ---------- read ----------

const listInclude = {
  users_subscriptions_customer_idTousers: { select: { id: true, full_name: true } },
  plans: { select: { id: true, name: true, billing_period: true } },
  subscription_lines: { select: { product_id: true, quantity: true, unit_price: true, taxes: { select: { rate: true } } } },
} satisfies Prisma.subscriptionsInclude;

const detailInclude = {
  users_subscriptions_customer_idTousers: { select: { id: true, full_name: true, email: true, company_name: true } },
  plans: true,
  quotation_templates: { select: { id: true, name: true } },
  subscription_lines: {
    orderBy: { id: 'asc' },
    include: {
      products: { select: { id: true, name: true } },
      product_variants: { select: { id: true, attribute: true, value: true } },
      taxes: { select: { id: true, name: true, rate: true } },
    },
  },
} satisfies Prisma.subscriptionsInclude;

type ListRow = Prisma.subscriptionsGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.subscriptionsGetPayload<{ include: typeof detailInclude }>;

const previewLines = (lines: { product_id: bigint; quantity: number; unit_price: Prisma.Decimal; taxes: { rate: Prisma.Decimal } | null }[]): PreviewLine[] =>
  lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.taxes?.rate ?? null }));

function listItem(s: ListRow | DetailRow, recurringTotal: unknown) {
  const c = s.users_subscriptions_customer_idTousers;
  return {
    id: s.id,
    number: s.number,
    customer: { id: c.id, name: c.full_name },
    plan: { id: s.plans.id, name: s.plans.name, billingPeriod: s.plans.billing_period },
    status: s.status,
    startDate: s.start_date,
    expiryDate: s.expiry_date,
    nextBillingDate: s.next_billing_date,
    recurringTotal,
  };
}

/** Customers see their own subscriptions only (ownScope); filters map to indexed columns. */
export async function listSubscriptions(q: ListSubscriptionsQuery, user: AuthUser) {
  const page = toPage(
    q,
    { number: 'number', startDate: 'start_date', nextBillingDate: 'next_billing_date', createdAt: 'created_at', status: 'status' },
    '-createdAt',
  );
  const where: Prisma.subscriptionsWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.customerId ? { customer_id: BigInt(q.customerId) } : {}),
    ...(q.planId ? { plan_id: BigInt(q.planId) } : {}),
    ...(q.from || q.to
      ? { start_date: { ...(q.from ? { gte: fromISODate(q.from) } : {}), ...(q.to ? { lte: fromISODate(q.to) } : {}) } }
      : {}),
    ...(q.q
      ? {
          OR: [
            { number: { contains: q.q, mode: 'insensitive' } },
            {
              users_subscriptions_customer_idTousers: {
                OR: [
                  { full_name: { contains: q.q, mode: 'insensitive' } },
                  { company_name: { contains: q.q, mode: 'insensitive' } },
                  { email: { contains: q.q, mode: 'insensitive' } },
                ],
              },
            },
          ],
        }
      : {}),
    ...ownScope(user), // last, so a customer's customerId filter can never widen it
  };
  const [rows, total] = await prisma.$transaction([
    prisma.subscriptions.findMany({ where, include: listInclude, orderBy: page.orderBy, skip: page.skip, take: page.take }),
    prisma.subscriptions.count({ where }),
  ]);
  // one discounts query for the whole page
  const rules = await loadDiscountRules(prisma, rows.map((r) => r.id), todayIST());
  const data = rows.map((r) => listItem(r, previewTotals(r.id, previewLines(r.subscription_lines), rules).total));
  return listResult(data, total, page);
}

async function detail(db: Db, id: bigint, user: AuthUser) {
  const s = await db.subscriptions.findFirst({ where: { id, ...ownScope(user) }, include: detailInclude });
  if (!s) throw notFound('Subscription');
  const rules = await loadDiscountRules(db, [s.id], todayIST());
  const preview = previewTotals(s.id, previewLines(s.subscription_lines), rules);
  return toDetail(s, preview, user);
}

function toDetail(s: DetailRow, preview: ReturnType<typeof previewTotals>, user: AuthUser) {
  const p = s.plans;
  return {
    ...listItem(s, preview.total),
    plan: {
      id: p.id, name: p.name, billingPeriod: p.billing_period, minQuantity: p.min_quantity,
      isPausable: p.is_pausable, isClosable: p.is_closable, isRenewable: p.is_renewable, autoClose: p.auto_close,
    },
    customer: {
      id: s.users_subscriptions_customer_idTousers.id,
      name: s.users_subscriptions_customer_idTousers.full_name,
      email: s.users_subscriptions_customer_idTousers.email,
      companyName: s.users_subscriptions_customer_idTousers.company_name,
    },
    template: s.quotation_templates,
    paymentTermsDays: s.payment_terms_days,
    quotationValidUntil: s.quotation_valid_until,
    pausedAt: s.paused_at,
    closedAt: s.closed_at,
    notes: s.notes,
    createdAt: s.created_at,
    allowedActions: allowedActions(s, p, user.role),
    lines: s.subscription_lines.map((l) => ({
      id: l.id,
      product: l.products,
      variant: l.product_variants,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      tax: l.taxes,
    })),
    preview,
  };
}

export const getSubscription = (id: bigint, user: AuthUser) => detail(prisma, id, user);

export async function getHistory(id: bigint, q: { page: number; pageSize: number; sort?: string }) {
  const exists = await prisma.subscriptions.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Subscription');
  const page = toPage(q, { changedAt: 'changed_at' }, 'changedAt');
  const where = { subscription_id: id };
  const [rows, total] = await prisma.$transaction([
    prisma.subscription_status_history.findMany({
      where,
      include: { users: { select: { id: true, full_name: true } } },
      orderBy: [page.orderBy, { id: page.orderBy.changed_at }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.subscription_status_history.count({ where }),
  ]);
  const data = rows.map((h) => ({
    id: h.id,
    fromStatus: h.from_status,
    toStatus: h.to_status,
    changedBy: h.users ? { id: h.users.id, name: h.users.full_name } : null, // null = billing job
    changedAt: h.changed_at,
  }));
  return listResult(data, total, page);
}

// ---------- shared write helpers ----------

/** Lock the row for the rest of the transaction. Another customer's subscription → 404. */
async function lockSubscription(tx: Tx, id: bigint, user: AuthUser) {
  await tx.$queryRaw`SELECT id FROM subscriptions WHERE id = ${id} FOR UPDATE`;
  const s = await tx.subscriptions.findFirst({
    where: { id, ...ownScope(user) },
    include: { plans: true, quotation_templates: { select: { validity_days: true } } },
  });
  if (!s) throw notFound('Subscription');
  return s;
}

function assertEditable(status: string) {
  if (!EDITABLE.includes(status)) {
    throw new AppError(400, 'INVALID_TRANSITION', 'Only a draft or quotation can be edited', { status });
  }
}

const belowMinimum = (min: number, field: string) =>
  new AppError(400, 'BUSINESS_RULE', `Quantity must be at least the plan minimum of ${min}`, { field });

type LineInput = { productId: string; variantId?: string | null; quantity: number; unitPrice?: string; taxId?: string | null };

/** Validate a line and fix its unit price: given price, or product sales price + variant extra. */
async function resolveLine(tx: Tx, l: LineInput, minQuantity: number, field = '') {
  const bad = (f: string, message: string) => new AppError(400, 'VALIDATION_ERROR', message, { field: `${field}${f}` });
  const product = await tx.products.findUnique({ where: { id: BigInt(l.productId) } });
  if (!product) throw bad('productId', 'Product not found');
  if (!product.is_active) throw bad('productId', 'Product is inactive');
  const variant = l.variantId ? await tx.product_variants.findUnique({ where: { id: BigInt(l.variantId) } }) : null;
  if (l.variantId && (!variant || variant.product_id !== product.id)) {
    throw bad('variantId', 'Variant does not belong to this product');
  }
  if (l.quantity < minQuantity) throw belowMinimum(minQuantity, `${field}quantity`);

  // undefined = product default tax; null = no tax
  const taxId = l.taxId === undefined ? product.default_tax_id : l.taxId === null ? null : BigInt(l.taxId);
  if (taxId !== null && l.taxId) {
    const tax = await tx.taxes.findUnique({ where: { id: taxId } });
    if (!tax || !tax.is_active) throw bad('taxId', 'Tax not found or inactive');
  }
  return {
    product_id: product.id,
    variant_id: variant?.id ?? null,
    quantity: l.quantity,
    unit_price: l.unitPrice ?? toDecimal(product.sales_price).plus(variant ? toDecimal(variant.extra_price) : 0).toFixed(2),
    tax_id: taxId,
  };
}

/** expiryDate is the last day of service (inclusive), so it must come after the start date. */
function checkDates(start: string, expiry: string | null | undefined) {
  if (expiry && expiry <= start) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Expiry date (last day of service) must be after the start date', {
      field: 'expiryDate',
    });
  }
}

async function availablePlan(tx: Tx, planId: bigint) {
  const plan = await tx.plans.findFirst({ where: { id: planId, ...availableOn(todayIST()) } });
  if (!plan) throw new AppError(400, 'BUSINESS_RULE', 'This plan is not available today', { field: 'planId' });
  return plan;
}

// ---------- create / edit (DRAFT or QUOTATION only) ----------

export async function createSubscription(body: CreateSubscriptionBody, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.users.findFirst({ where: { id: BigInt(body.customerId), role: 'CUSTOMER' } });
    if (!customer) throw new AppError(400, 'VALIDATION_ERROR', 'Customer not found', { field: 'customerId' });
    if (!customer.is_active) throw new AppError(400, 'BUSINESS_RULE', 'Customer account is deactivated', { field: 'customerId' });
    const plan = await availablePlan(tx, BigInt(body.planId));
    checkDates(body.startDate, body.expiryDate);

    const template = body.templateId
      ? await tx.quotation_templates.findUnique({
          where: { id: BigInt(body.templateId) },
          include: { quotation_template_lines: { orderBy: { id: 'asc' } } },
        })
      : null;
    if (body.templateId && !template) throw new AppError(400, 'VALIDATION_ERROR', 'Template not found', { field: 'templateId' });
    if (template && template.plan_id !== plan.id) {
      throw new AppError(400, 'VALIDATION_ERROR', 'This template belongs to a different plan', { field: 'templateId' });
    }

    const inputs: LineInput[] =
      body.lines ??
      (template?.quotation_template_lines ?? []).map((l) => ({
        productId: l.product_id.toString(),
        variantId: l.variant_id?.toString() ?? null,
        quantity: l.quantity,
        unitPrice: l.unit_price?.toString(),
        taxId: l.tax_id?.toString(), // template "no tax set" = product default
      }));
    const lines = [];
    for (const [i, l] of inputs.entries()) lines.push(await resolveLine(tx, l, plan.min_quantity, `lines.${i}.`));

    const s = await tx.subscriptions.create({
      data: {
        customer_id: customer.id,
        plan_id: plan.id,
        template_id: template?.id ?? null,
        start_date: fromISODate(body.startDate),
        expiry_date: body.expiryDate ? fromISODate(body.expiryDate) : null,
        payment_terms_days: body.paymentTermsDays ?? template?.payment_terms_days ?? 15,
        notes: body.notes ?? null,
        created_by: BigInt(user.id),
        subscription_lines: { create: lines },
        subscription_status_history: { create: [{ from_status: null, to_status: 'DRAFT', changed_by: BigInt(user.id) }] },
      },
    });
    return detail(tx, s.id, user);
  });
}

export async function updateSubscription(id: bigint, body: UpdateSubscriptionBody, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const s = await lockSubscription(tx, id, user);
    assertEditable(s.status);
    checkDates(
      body.startDate ?? toISODate(s.start_date),
      body.expiryDate !== undefined ? body.expiryDate : s.expiry_date && toISODate(s.expiry_date),
    );
    if (body.planId && BigInt(body.planId) !== s.plan_id) {
      const plan = await availablePlan(tx, BigInt(body.planId));
      const tooFew = await tx.subscription_lines.findFirst({ where: { subscription_id: id, quantity: { lt: plan.min_quantity } } });
      if (tooFew) throw belowMinimum(plan.min_quantity, 'planId');
    }
    await tx.subscriptions.update({
      where: { id },
      data: {
        plan_id: body.planId ? BigInt(body.planId) : undefined,
        start_date: body.startDate ? fromISODate(body.startDate) : undefined,
        expiry_date: body.expiryDate === undefined ? undefined : body.expiryDate ? fromISODate(body.expiryDate) : null,
        payment_terms_days: body.paymentTermsDays,
        notes: body.notes,
        updated_at: new Date(),
      },
    });
    return detail(tx, id, user);
  });
}

export async function addLine(id: bigint, body: LineBody, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const s = await lockSubscription(tx, id, user);
    assertEditable(s.status);
    const line = await resolveLine(tx, body, s.plans.min_quantity);
    await tx.subscription_lines.create({ data: { ...line, subscription_id: id } });
    return detail(tx, id, user);
  });
}

export async function updateLine(id: bigint, lineId: bigint, body: UpdateLineBody, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const s = await lockSubscription(tx, id, user);
    assertEditable(s.status);
    const current = await tx.subscription_lines.findFirst({ where: { id: lineId, subscription_id: id } });
    if (!current) throw notFound('Line');
    const variantChanged = body.variantId !== undefined && (body.variantId ?? null) !== (current.variant_id?.toString() ?? null);
    const resolved = await resolveLine(
      tx,
      {
        productId: current.product_id.toString(),
        variantId: body.variantId !== undefined ? body.variantId : current.variant_id?.toString() ?? null,
        quantity: body.quantity ?? current.quantity,
        // keep the agreed price unless a new one is given or the variant changed
        unitPrice: body.unitPrice ?? (variantChanged ? undefined : current.unit_price.toString()),
        taxId: body.taxId !== undefined ? body.taxId : null,
      },
      s.plans.min_quantity,
    );
    // tax not sent: keep the line's current tax, even if it has since been deactivated for new lines
    if (body.taxId === undefined) resolved.tax_id = current.tax_id;
    await tx.subscription_lines.update({ where: { id: lineId }, data: resolved });
    return detail(tx, id, user);
  });
}

export async function deleteLine(id: bigint, lineId: bigint, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const s = await lockSubscription(tx, id, user);
    assertEditable(s.status);
    const { count } = await tx.subscription_lines.deleteMany({ where: { id: lineId, subscription_id: id } });
    if (count === 0) throw notFound('Line');
    return detail(tx, id, user);
  });
}

// ---------- status changes: the only way status ever changes ----------

/**
 * One transaction: lock the row, check the state machine, role and plan flags, apply the
 * side effects (dates), write a history row, and return the fresh detail with allowedActions.
 */
export async function transition(id: bigint, action: Action, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const s = await lockSubscription(tx, id, user);
    // role first: a customer never sees the staff-only actions listed by nextStatus()
    if (user.role === 'CUSTOMER' && !CUSTOMER_ACTIONS.includes(action)) {
      throw new AppError(403, 'FORBIDDEN', 'Customers can only pause, resume or close their subscription');
    }
    const to = nextStatus(s.status, action);
    const plan = s.plans;
    const rule = (message: string) => new AppError(400, 'BUSINESS_RULE', message, { action });
    if (action === 'pause' && !plan.is_pausable) throw rule('This plan cannot be paused');
    if (action === 'close' && !plan.is_closable) throw rule('This plan cannot be closed early');
    if (action === 'renew' && !plan.is_renewable) throw rule('This plan cannot be renewed');

    const today = todayIST();
    const data: Prisma.subscriptionsUpdateInput = { status: to, updated_at: new Date() };
    switch (action) {
      case 'send_quote': {
        const lines = await tx.subscription_lines.findMany({ where: { subscription_id: id } });
        if (lines.length === 0) throw rule('Add at least one line before sending the quotation');
        const i = lines.findIndex((l) => l.quantity < plan.min_quantity);
        if (i >= 0) throw belowMinimum(plan.min_quantity, `lines.${i}.quantity`);
        data.quotation_valid_until = addDays(today, s.quotation_templates?.validity_days ?? DEFAULT_QUOTE_VALIDITY_DAYS);
        break;
      }
      case 'confirm':
        if (!s.quotation_valid_until || today > s.quotation_valid_until) {
          throw rule('This quotation has expired; revise it and send it again');
        }
        break;
      case 'revise':
        data.quotation_valid_until = null;
        break;
      case 'activate':
        data.next_billing_date = s.start_date; // billed in advance from the start date
        data.billing_anchor = s.start_date; // periods count from here (shifted by pauses)
        break;
      case 'pause':
        data.paused_at = today;
        break;
      case 'resume': {
        // not billed while paused: shift the next billing date AND the period anchor by the days paused,
        // so later periods restart from the shifted date (paused 10–20 Jan → periods run 11th to 11th)
        const pausedDays = s.paused_at ? Math.max(0, differenceInCalendarDays(today, s.paused_at)) : 0;
        if (s.next_billing_date) data.next_billing_date = addDays(s.next_billing_date, pausedDays);
        data.billing_anchor = addDays(s.billing_anchor ?? s.start_date, pausedDays);
        data.paused_at = null;
        break;
      }
      case 'renew': {
        if (!s.expiry_date) throw rule('Only a subscription with an expiry date can be renewed');
        const term = differenceInCalendarDays(s.expiry_date, s.start_date);
        if (term <= 0) throw rule('The subscription term is empty, so there is nothing to renew');
        data.expiry_date = addDays(s.expiry_date, term);
        break;
      }
      case 'close':
      case 'cancel':
        data.closed_at = new Date();
        break;
    }

    await tx.subscriptions.update({ where: { id }, data });
    await tx.subscription_status_history.create({
      data: { subscription_id: id, from_status: s.status, to_status: to, changed_by: BigInt(user.id) },
    });
    return detail(tx, id, user);
  });
}

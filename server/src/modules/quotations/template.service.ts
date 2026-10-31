import type { Prisma } from '@prisma/client';
import { AppError, notFound, prismaCode } from '../../lib/errors';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import type { CreateTemplateBody, ListTemplatesQuery, TemplateLineBody, UpdateTemplateBody } from './template.schema';

type Tx = Prisma.TransactionClient;

const planSelect = { id: true, name: true, billing_period: true, min_quantity: true } as const;

export const templateDetailInclude = {
  plans: { select: planSelect },
  quotation_template_lines: {
    orderBy: { id: 'asc' },
    include: {
      products: { select: { id: true, name: true } },
      product_variants: { select: { id: true, attribute: true, value: true, extra_price: true } },
      taxes: { select: { id: true, name: true, rate: true } },
    },
  },
} satisfies Prisma.quotation_templatesInclude;

type TemplateRow = Prisma.quotation_templatesGetPayload<{ include: typeof templateDetailInclude }>;

function toDetail({ plans, quotation_template_lines, plan_id: _planId, ...t }: TemplateRow) {
  return {
    ...t,
    plan: plans,
    lines: quotation_template_lines.map((l) => ({
      id: l.id,
      product: l.products,
      variant: l.product_variants,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      tax: l.taxes,
    })),
  };
}

const bad = (field: string, message: string) => new AppError(400, 'VALIDATION_ERROR', message, { field });

/** Lines must point at real rows, variants must belong to their product, and quantities meet the plan minimum. */
async function checkLines(tx: Tx, planId: bigint, lines: TemplateLineBody[]) {
  const plan = await tx.plans.findUnique({ where: { id: planId }, select: { min_quantity: true } });
  if (!plan) throw bad('planId', 'Plan not found');

  const productIds = [...new Set(lines.map((l) => BigInt(l.productId)))];
  const variantIds = [...new Set(lines.flatMap((l) => (l.variantId ? [BigInt(l.variantId)] : [])))];
  const taxIds = [...new Set(lines.flatMap((l) => (l.taxId ? [BigInt(l.taxId)] : [])))];
  const [products, variants, taxes] = await Promise.all([
    tx.products.findMany({ where: { id: { in: productIds } }, select: { id: true, is_active: true } }),
    tx.product_variants.findMany({ where: { id: { in: variantIds } }, select: { id: true, product_id: true } }),
    tx.taxes.findMany({ where: { id: { in: taxIds } }, select: { id: true } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const taxSet = new Set(taxes.map((t) => t.id));

  lines.forEach((l, i) => {
    const product = productById.get(BigInt(l.productId));
    if (!product) throw bad(`lines.${i}.productId`, 'Product not found');
    if (!product.is_active) throw bad(`lines.${i}.productId`, 'Product is inactive');
    if (l.variantId) {
      const v = variantById.get(BigInt(l.variantId));
      if (!v || v.product_id !== product.id) throw bad(`lines.${i}.variantId`, 'Variant does not belong to this product');
    }
    if (l.taxId && !taxSet.has(BigInt(l.taxId))) throw bad(`lines.${i}.taxId`, 'Tax not found');
    if (l.quantity < plan.min_quantity) {
      throw new AppError(400, 'BUSINESS_RULE', `Quantity must be at least the plan minimum of ${plan.min_quantity}`, {
        field: `lines.${i}.quantity`,
      });
    }
  });
}

const lineData = (templateId: bigint, l: TemplateLineBody) => ({
  template_id: templateId,
  product_id: BigInt(l.productId),
  variant_id: l.variantId ? BigInt(l.variantId) : null,
  quantity: l.quantity,
  unit_price: l.unitPrice ?? null,
  tax_id: l.taxId ? BigInt(l.taxId) : null,
});

export async function listTemplates(q: ListTemplatesQuery) {
  const page = toPage(q, { name: 'name', createdAt: 'created_at', validityDays: 'validity_days' }, 'name');
  const where: Prisma.quotation_templatesWhereInput = {
    ...(q.planId ? { plan_id: BigInt(q.planId) } : {}),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.quotation_templates.findMany({
      where,
      include: { plans: { select: planSelect }, _count: { select: { quotation_template_lines: true } } },
      orderBy: page.orderBy,
      skip: page.skip,
      take: page.take,
    }),
    prisma.quotation_templates.count({ where }),
  ]);
  const data = rows.map(({ plans, _count, plan_id: _planId, ...t }) => ({
    ...t,
    plan: plans,
    lineCount: _count.quotation_template_lines,
  }));
  return listResult(data, total, page);
}

export async function getTemplate(id: bigint) {
  const row = await prisma.quotation_templates.findUnique({ where: { id }, include: templateDetailInclude });
  if (!row) throw notFound('Quotation template');
  return toDetail(row);
}

export async function createTemplate(body: CreateTemplateBody) {
  return prisma.$transaction(async (tx) => {
    await checkLines(tx, BigInt(body.planId), body.lines);
    const t = await tx.quotation_templates.create({
      data: {
        name: body.name,
        plan_id: BigInt(body.planId),
        validity_days: body.validityDays,
        payment_terms_days: body.paymentTermsDays,
        notes: body.notes ?? null,
      },
    });
    await tx.quotation_template_lines.createMany({ data: body.lines.map((l) => lineData(t.id, l)) });
    return toDetail(await tx.quotation_templates.findUniqueOrThrow({ where: { id: t.id }, include: templateDetailInclude }));
  });
}

export async function updateTemplate(id: bigint, body: UpdateTemplateBody) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.quotation_templates.findUnique({
      where: { id },
      include: { quotation_template_lines: true },
    });
    if (!current) throw notFound('Quotation template');

    const planId = body.planId ? BigInt(body.planId) : current.plan_id;
    // re-check whenever the plan or the lines change (a new plan may have a higher minimum)
    if (body.planId || body.lines) {
      const lines: TemplateLineBody[] =
        body.lines ??
        current.quotation_template_lines.map((l) => ({
          productId: l.product_id.toString(),
          variantId: l.variant_id?.toString() ?? null,
          quantity: l.quantity,
          unitPrice: l.unit_price?.toString() ?? null,
          taxId: l.tax_id?.toString() ?? null,
        }));
      await checkLines(tx, planId, lines);
    }

    await tx.quotation_templates.update({
      where: { id },
      data: {
        name: body.name,
        plan_id: body.planId ? planId : undefined,
        validity_days: body.validityDays,
        payment_terms_days: body.paymentTermsDays,
        notes: body.notes,
      },
    });
    if (body.lines) {
      await tx.quotation_template_lines.deleteMany({ where: { template_id: id } });
      await tx.quotation_template_lines.createMany({ data: body.lines.map((l) => lineData(id, l)) });
    }
    return toDetail(await tx.quotation_templates.findUniqueOrThrow({ where: { id }, include: templateDetailInclude }));
  });
}

/** Subscriptions remember which template they came from, so a used template can't be deleted. */
export async function deleteTemplate(id: bigint) {
  try {
    await prisma.quotation_templates.delete({ where: { id } });
  } catch (e) {
    if (prismaCode(e) === 'P2025') throw notFound('Quotation template');
    if (prismaCode(e) === 'P2003') {
      throw new AppError(409, 'CONFLICT', 'Subscriptions were created from this template, so it cannot be deleted');
    }
    throw e;
  }
}

import type { Prisma } from '@prisma/client';
import { AppError, notFound, prismaCode } from '../../lib/errors';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../middleware/auth';
import type { CreateProductBody, ListProductsQuery, UpdateProductBody } from './products.schema';

export const productInclude = {
  taxes: { select: { id: true, name: true, rate: true } },
  product_variants: {
    select: { id: true, attribute: true, value: true, extra_price: true },
    orderBy: [{ attribute: 'asc' }, { value: 'asc' }],
  },
} satisfies Prisma.productsInclude;

type ProductRow = Prisma.productsGetPayload<{ include: typeof productInclude }>;

/** Contract shape: defaultTax object and variants list. */
function toDto({ taxes, product_variants, default_tax_id: _taxId, ...p }: ProductRow) {
  return { ...p, defaultTax: taxes, variants: product_variants };
}

const variantTaken = (e: unknown) =>
  prismaCode(e) === 'P2002'
    ? new AppError(409, 'CONFLICT', 'This product already has a variant with that attribute and value')
    : e;

async function assertTaxExists(taxId: string | null | undefined) {
  if (!taxId) return;
  const tax = await prisma.taxes.findUnique({ where: { id: BigInt(taxId) }, select: { id: true } });
  if (!tax) throw new AppError(400, 'VALIDATION_ERROR', 'Tax not found', { field: 'defaultTaxId' });
}

/** Customers see active products only. */
export async function listProducts(q: ListProductsQuery, user: AuthUser) {
  const page = toPage(q, { name: 'name', salesPrice: 'sales_price', createdAt: 'created_at', type: 'type' }, 'name');
  const active = user.role === 'CUSTOMER' ? true : q.active;
  const where: Prisma.productsWhereInput = {
    ...(active !== undefined ? { is_active: active } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.products.findMany({ where, include: productInclude, orderBy: page.orderBy, skip: page.skip, take: page.take }),
    prisma.products.count({ where }),
  ]);
  return listResult(rows.map(toDto), total, page);
}

export async function getProduct(id: bigint, user: AuthUser) {
  const row = await prisma.products.findFirst({
    where: { id, ...(user.role === 'CUSTOMER' ? { is_active: true } : {}) },
    include: productInclude,
  });
  if (!row) throw notFound('Product');
  return toDto(row);
}

export async function createProduct(body: CreateProductBody) {
  await assertTaxExists(body.defaultTaxId);
  try {
    const row = await prisma.products.create({
      data: {
        name: body.name,
        type: body.type,
        sales_price: body.salesPrice,
        cost_price: body.costPrice,
        default_tax_id: body.defaultTaxId ? BigInt(body.defaultTaxId) : null,
        notes: body.notes ?? null,
        is_active: body.isActive,
        product_variants: {
          create: body.variants.map((v) => ({ attribute: v.attribute, value: v.value, extra_price: v.extraPrice })),
        },
      },
      include: productInclude,
    });
    return toDto(row);
  } catch (e) {
    throw variantTaken(e);
  }
}

/** Price changes affect new subscription lines only; existing lines keep their stored unit price. */
export async function updateProduct(id: bigint, body: UpdateProductBody) {
  await assertTaxExists(body.defaultTaxId);
  try {
    const row = await prisma.products.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        sales_price: body.salesPrice,
        cost_price: body.costPrice,
        default_tax_id: body.defaultTaxId === undefined ? undefined : body.defaultTaxId ? BigInt(body.defaultTaxId) : null,
        notes: body.notes,
        is_active: body.isActive,
        updated_at: new Date(),
      },
      include: productInclude,
    });
    return toDto(row);
  } catch (e) {
    if (prismaCode(e) === 'P2025') throw notFound('Product');
    throw e;
  }
}

/** DELETE deactivates: products are referenced by subscriptions and invoices. */
export async function deactivateProduct(id: bigint) {
  await updateProduct(id, { isActive: false });
}

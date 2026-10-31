import { AppError, notFound, prismaCode } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import type { VariantBody } from './products.schema';

const variantSelect = { id: true, product_id: true, attribute: true, value: true, extra_price: true } as const;

const taken = (e: unknown) =>
  prismaCode(e) === 'P2002'
    ? new AppError(409, 'CONFLICT', 'This product already has a variant with that attribute and value')
    : e;

export async function addVariant(productId: bigint, body: VariantBody) {
  const product = await prisma.products.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw notFound('Product');
  try {
    return await prisma.product_variants.create({
      data: { product_id: productId, attribute: body.attribute, value: body.value, extra_price: body.extraPrice },
      select: variantSelect,
    });
  } catch (e) {
    throw taken(e);
  }
}

/** A new extra price applies to new subscription lines only; existing lines keep their stored unit price. */
export async function updateVariant(id: bigint, body: Partial<VariantBody>) {
  try {
    return await prisma.product_variants.update({
      where: { id },
      data: { attribute: body.attribute, value: body.value, extra_price: body.extraPrice },
      select: variantSelect,
    });
  } catch (e) {
    if (prismaCode(e) === 'P2025') throw notFound('Variant');
    throw taken(e);
  }
}

export async function deleteVariant(id: bigint) {
  try {
    await prisma.product_variants.delete({ where: { id } });
  } catch (e) {
    if (prismaCode(e) === 'P2025') throw notFound('Variant');
    if (prismaCode(e) === 'P2003') {
      throw new AppError(409, 'CONFLICT', 'This variant is used by subscriptions or templates, so it cannot be deleted');
    }
    throw e;
  }
}

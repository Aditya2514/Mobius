import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { boolQuery, moneyString, optionalText } from '../../lib/validation';

const idString = z.string().regex(/^[1-9]\d{0,18}$/, 'Invalid id');
const productType = z.enum(['SERVICE', 'GOODS', 'ADDON']);

export const variantBody = z.object({
  attribute: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(100),
  extraPrice: moneyString.default('0'),
});

/** PATCH: no defaults, so omitted fields stay unchanged */
export const updateVariantBody = z.object({
  attribute: z.string().trim().min(1).max(100).optional(),
  value: z.string().trim().min(1).max(100).optional(),
  extraPrice: moneyString.optional(),
});

export const listProductsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  type: productType.optional(),
  active: boolQuery.optional(),
});

export const createProductBody = z.object({
  name: z.string().trim().min(1).max(200),
  type: productType.default('SERVICE'),
  salesPrice: moneyString,
  costPrice: moneyString.default('0'),
  defaultTaxId: idString.nullable().optional(),
  notes: optionalText(2000),
  isActive: z.boolean().default(true),
  /** optional: create variants together with the product */
  variants: z.array(variantBody).max(100).default([]),
});

export const updateProductBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: productType.optional(),
  salesPrice: moneyString.optional(),
  costPrice: moneyString.optional(),
  defaultTaxId: idString.nullable().optional(),
  notes: optionalText(2000),
  isActive: z.boolean().optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type CreateProductBody = z.infer<typeof createProductBody>;
export type UpdateProductBody = z.infer<typeof updateProductBody>;
export type VariantBody = z.infer<typeof variantBody>;

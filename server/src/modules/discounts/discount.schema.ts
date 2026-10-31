import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { boolQuery, isoDate, moneyString } from '../../lib/validation';

const idString = z.string().regex(/^[1-9]\d{0,18}$/, 'Invalid id');

const fields = {
  name: z.string().trim().min(1).max(200),
  type: z.enum(['FIXED', 'PERCENTAGE']),
  value: moneyString,
  scope: z.enum(['PRODUCT', 'SUBSCRIPTION']),
  minPurchase: moneyString,
  minQuantity: z.number().int().min(0),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  usageLimit: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  productIds: z.array(idString).max(500),
  subscriptionIds: z.array(idString).max(5000),
};

/** Cross-field rules (percentage ≤ 100, dates, targets) are checked in the service on the merged values. */
export const createDiscountBody = z.object({
  ...fields,
  minPurchase: fields.minPurchase.default('0'),
  minQuantity: fields.minQuantity.default(0),
  endDate: fields.endDate.optional().default(null),
  usageLimit: fields.usageLimit.optional().default(null),
  isActive: fields.isActive.default(true),
  productIds: fields.productIds.default([]),
  subscriptionIds: fields.subscriptionIds.default([]),
});

export const updateDiscountBody = z.object(fields).partial();

export const listDiscountsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  scope: z.enum(['PRODUCT', 'SUBSCRIPTION']).optional(),
  active: boolQuery.optional(),
});

export type CreateDiscountBody = z.infer<typeof createDiscountBody>;
export type UpdateDiscountBody = z.infer<typeof updateDiscountBody>;
export type ListDiscountsQuery = z.infer<typeof listDiscountsQuery>;

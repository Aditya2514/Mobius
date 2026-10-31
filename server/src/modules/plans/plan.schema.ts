import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { boolQuery, isoDate, moneyString } from '../../lib/validation';

const period = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

export const listPlansQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  billingPeriod: period.optional(),
  active: boolQuery.optional(),
  /** true = active and today (India date) is within availableFrom … availableTo */
  available: boolQuery.optional(),
});

const fields = {
  name: z.string().trim().min(1).max(200),
  price: moneyString,
  billingPeriod: period,
  minQuantity: z.number().int().min(1),
  availableFrom: isoDate,
  availableTo: isoDate.nullable(),
  autoClose: z.boolean(),
  isClosable: z.boolean(),
  isPausable: z.boolean(),
  isRenewable: z.boolean(),
  isActive: z.boolean(),
};

// defaults match the schema.sql column defaults
export const createPlanBody = z.object({
  ...fields,
  minQuantity: fields.minQuantity.default(1),
  availableTo: fields.availableTo.optional().default(null),
  autoClose: fields.autoClose.default(false),
  isClosable: fields.isClosable.default(true),
  isPausable: fields.isPausable.default(false),
  isRenewable: fields.isRenewable.default(true),
  isActive: fields.isActive.default(true),
});

/** PATCH: built from the default-free fields, so omitted fields stay unchanged */
export const updatePlanBody = z.object(fields).partial();

export type ListPlansQuery = z.infer<typeof listPlansQuery>;
export type CreatePlanBody = z.infer<typeof createPlanBody>;
export type UpdatePlanBody = z.infer<typeof updatePlanBody>;

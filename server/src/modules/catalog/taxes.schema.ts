import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { boolQuery, percentString } from '../../lib/validation';

export const listTaxesQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  active: boolQuery.optional(),
});

export const createTaxBody = z.object({
  name: z.string().trim().min(1).max(100),
  rate: percentString,
  isActive: z.boolean().default(true),
});

export const updateTaxBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  rate: percentString.optional(),
  isActive: z.boolean().optional(),
});

export type ListTaxesQuery = z.infer<typeof listTaxesQuery>;
export type CreateTaxBody = z.infer<typeof createTaxBody>;
export type UpdateTaxBody = z.infer<typeof updateTaxBody>;

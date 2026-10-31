import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { moneyString, optionalText } from '../../lib/validation';

const idString = z.string().regex(/^[1-9]\d{0,18}$/, 'Invalid id');

export const templateLineBody = z.object({
  productId: idString,
  variantId: idString.nullable().optional(),
  quantity: z.number().int().positive(),
  /** null/omitted = use the product price (+ variant extra) when the subscription line is created */
  unitPrice: moneyString.nullable().optional(),
  /** null/omitted = the product's default tax */
  taxId: idString.nullable().optional(),
});

export const listTemplatesQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  planId: idString.optional(),
});

export const createTemplateBody = z.object({
  name: z.string().trim().min(1).max(200),
  planId: idString,
  validityDays: z.number().int().positive().max(365),
  paymentTermsDays: z.number().int().min(0).max(365).default(15),
  notes: optionalText(2000),
  lines: z.array(templateLineBody).max(100).default([]),
});

/** PATCH: lines, when sent, replace all existing lines */
export const updateTemplateBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  planId: idString.optional(),
  validityDays: z.number().int().positive().max(365).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  notes: optionalText(2000),
  lines: z.array(templateLineBody).max(100).optional(),
});

export type TemplateLineBody = z.infer<typeof templateLineBody>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuery>;
export type CreateTemplateBody = z.infer<typeof createTemplateBody>;
export type UpdateTemplateBody = z.infer<typeof updateTemplateBody>;

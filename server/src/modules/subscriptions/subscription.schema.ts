import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { isoDate, moneyString, optionalText } from '../../lib/validation';
import { ACTIONS } from './stateMachine';

const idString = z.string().regex(/^[1-9]\d{0,18}$/, 'Invalid id');
const status = z.enum(['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED']);

export const subLineParams = z.object({ id: idString, lineId: idString });

export const lineBody = z.object({
  productId: idString,
  variantId: idString.nullable().optional(),
  quantity: z.number().int().positive(),
  /** omitted = product sales price + variant extra price, fixed when the line is created */
  unitPrice: moneyString.optional(),
  /** omitted = the product's default tax; null = no tax */
  taxId: idString.nullable().optional(),
});

/** PATCH a line: no defaults, omitted fields stay as they are */
export const updateLineBody = z.object({
  variantId: idString.nullable().optional(),
  quantity: z.number().int().positive().optional(),
  unitPrice: moneyString.optional(),
  taxId: idString.nullable().optional(),
});

export const listSubscriptionsQuery = paginationQuery.extend({
  status: status.optional(),
  customerId: idString.optional(),
  planId: idString.optional(),
  /** start date range */
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** subscription number or customer name / company / email */
  q: z.string().trim().max(100).optional(),
});

export const createSubscriptionBody = z.object({
  customerId: idString,
  planId: idString,
  startDate: isoDate,
  expiryDate: isoDate.nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  /** copy lines (and payment terms) from this template when no lines are given */
  templateId: idString.optional(),
  lines: z.array(lineBody).max(100).optional(),
  notes: optionalText(2000),
});

/** Header fields only, and only in DRAFT or QUOTATION. Status is never set here (AGENTS.md rule 7). */
export const updateSubscriptionBody = z.object({
  planId: idString.optional(),
  startDate: isoDate.optional(),
  expiryDate: isoDate.nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  notes: optionalText(2000),
});

export const transitionBody = z.object({ action: z.enum(ACTIONS) });

export const historyQuery = paginationQuery;

export type LineBody = z.infer<typeof lineBody>;
export type UpdateLineBody = z.infer<typeof updateLineBody>;
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuery>;
export type CreateSubscriptionBody = z.infer<typeof createSubscriptionBody>;
export type UpdateSubscriptionBody = z.infer<typeof updateSubscriptionBody>;

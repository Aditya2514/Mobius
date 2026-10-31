import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { boolQuery, isoDate } from '../../lib/validation';

const idString = z.string().regex(/^[1-9]\d{0,18}$/, 'Invalid id');

export const listInvoicesQuery = paginationQuery.extend({
  status: z.enum(['DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED']).optional(),
  /** true = CONFIRMED, not fully paid, due date before today (India date); false = everything else */
  overdue: boolQuery.optional(),
  customerId: idString.optional(),
  subscriptionId: idString.optional(),
  /** invoice date range */
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** invoice number or bill-to name / email */
  q: z.string().trim().max(100).optional(),
});

export const bulkConfirmBody = z.object({ ids: z.array(idString).min(1).max(500) });

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>;

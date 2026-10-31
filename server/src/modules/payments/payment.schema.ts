import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { isoDate, moneyString, optionalText } from '../../lib/validation';

const method = z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER']);

export const recordPaymentBody = z.object({
  method,
  amount: moneyString,
  paidOn: isoDate,
  reference: optionalText(100),
  note: optionalText(500),
});

export const listPaymentsQuery = paginationQuery.extend({
  method: method.optional(),
  /** paid-on date range */
  from: isoDate.optional(),
  to: isoDate.optional(),
  invoiceId: z.string().regex(/^[1-9]\d{0,18}$/, 'Invalid id').optional(),
});

export type RecordPaymentBody = z.infer<typeof recordPaymentBody>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuery>;

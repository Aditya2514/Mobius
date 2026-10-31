import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { boolQuery, emailSchema, optionalText } from '../../lib/validation';
import { passwordSchema } from '../auth/auth.schema';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
/** optional 15-char GSTIN; empty string becomes null */
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === '' || GSTIN.test(v), 'Enter a valid 15-character GSTIN')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const listCustomersQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  active: boolQuery.optional(),
});

/** Staff create the account. Without a password, the customer gets a "set your password" email. */
export const createCustomerBody = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(200),
  password: passwordSchema.optional(),
  companyName: optionalText(200),
  phone: optionalText(30),
  address: optionalText(500),
  gstin: gstin,
});

export const updateCustomerBody = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  companyName: optionalText(200),
  phone: optionalText(30),
  address: optionalText(500),
  gstin: gstin,
  isActive: z.boolean().optional(),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;
export type CreateCustomerBody = z.infer<typeof createCustomerBody>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerBody>;

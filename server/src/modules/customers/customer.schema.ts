import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { boolQuery, emailSchema, optionalText } from '../../lib/validation';
import { passwordSchema } from '../auth/auth.schema';

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
  gstin: optionalText(15),
});

export const updateCustomerBody = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  companyName: optionalText(200),
  phone: optionalText(30),
  address: optionalText(500),
  gstin: optionalText(15),
  isActive: z.boolean().optional(),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;
export type CreateCustomerBody = z.infer<typeof createCustomerBody>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerBody>;

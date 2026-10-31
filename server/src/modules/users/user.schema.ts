import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { emailSchema, optionalText } from '../../lib/validation';
import { passwordSchema } from '../auth/auth.schema';

/** Fields any user may change on their own profile. Email and role are not among them. */
export const updateMeBody = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  companyName: optionalText(200),
  phone: optionalText(30),
  address: optionalText(500),
  gstin: optionalText(15),
});

export const listUsersQuery = paginationQuery.extend({
  role: z.enum(['ADMIN', 'STAFF', 'CUSTOMER']).optional(),
  q: z.string().trim().max(100).optional(),
});

/** POST /users always creates STAFF. */
export const createStaffBody = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1).max(200),
  password: passwordSchema,
  phone: optionalText(30),
});

export const updateUserBody = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phone: optionalText(30),
  isActive: z.boolean().optional(),
});

export type UpdateMeBody = z.infer<typeof updateMeBody>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type CreateStaffBody = z.infer<typeof createStaffBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;

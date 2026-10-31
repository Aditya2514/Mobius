import { z } from 'zod';
import { emailSchema, optionalText } from '../../lib/validation';

/** Password rule, shared with the frontend: more than 8 characters, upper, lower, special. */
export const passwordSchema = z.string()
  .min(9, 'Must be more than 8 characters')
  .regex(/[a-z]/, 'Needs a lowercase letter')
  .regex(/[A-Z]/, 'Needs an uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Needs a special character');

// Unknown keys (e.g. "role") are stripped: sign-up always creates a CUSTOMER.
export const signupBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1, 'Full name is required').max(200),
  companyName: optionalText(200),
});

export const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});

export const forgotPasswordBody = z.object({ email: emailSchema });

export const resetPasswordBody = z.object({
  token: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export type SignupBody = z.infer<typeof signupBody>;
export type LoginBody = z.infer<typeof loginBody>;

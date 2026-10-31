import { z } from 'zod';

export const PASSWORD_CHECKS = [
  { id: 'len', label: 'More than 8 characters', test: (p) => p.length >= 9 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'special', label: 'A special character (!@#$%^&*...)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const passwordSchema = z
  .string()
  .min(9, 'Must be more than 8 characters')
  .regex(/[a-z]/, 'Needs a lowercase letter')
  .regex(/[A-Z]/, 'Needs an uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Needs a special character');

export const signupSchema = z
  .object({
    fullName: z.string().min(2, 'Enter your name'),
    companyName: z.string().optional(),
    email: z.string().email('Enter a valid email'),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });


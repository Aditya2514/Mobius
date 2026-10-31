import { z } from 'zod';

/** :id path param. IDs are BIGINT, sent as digit strings. Convert with BigInt() in the controller. */
export const idParam = z.object({ id: z.string().regex(/^[1-9]\d{0,18}$/, 'Invalid id') });

/** Email as typed (trimmed). The users.email column is CITEXT, so case never matters. */
export const emailSchema = z.string().trim().max(254).pipe(z.email('Enter a valid email'));

/** Optional free text; "" from a form becomes null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** "YYYY-MM-DD" */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(
  (s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s),
  'Not a real date',
);

/** Money as a string or number with at most 2 decimals, ≥ 0. Kept as a string; services use Decimal. */
export const moneyString = z
  .union([z.string().trim(), z.number()])
  .transform((v) => String(v))
  .refine((s) => /^\d{1,10}(\.\d{1,2})?$/.test(s), 'Must be an amount with at most 2 decimals');

/** ?flag=true|false */
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

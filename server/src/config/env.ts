import { existsSync } from 'node:fs';
import { z } from 'zod';

// Load server/.env when present (tests and Docker set real env vars instead).
if (existsSync('.env')) process.loadEnvFile('.env');

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    TEST_DATABASE_URL: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
    APP_URL: z.string().url().default('http://localhost:5173'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default('Billing <billing@brightloop.test>'),
    AUTO_CONFIRM_INVOICES: bool,
    BILLING_CRON: z.string().default('5 0 * * *'),
    // requests per minute per IP on login, forgot-password and reset-password (each counted separately).
    // Keep 5 in production; raise for dev and demos where everyone logs in from one laptop.
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    // run the daily billing cron in this process; unset = only when NODE_ENV=production
    ENABLE_SCHEDULER: z.enum(['true', 'false']).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      const checkSecret = (field: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET') => {
        const s = val[field];
        if (s.length < 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} must be at least 32 characters in production`,
            path: [field],
          });
        }
        if (s.includes('change-me')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} cannot contain "change-me" in production`,
            path: [field],
          });
        }
      };
      checkSecret('JWT_ACCESS_SECRET');
      checkSecret('JWT_REFRESH_SECRET');
    }
  });

export function parseEnv(raw: Record<string, unknown> = process.env) {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    // Crash early: a server with missing config fails in confusing ways later.
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  const { ENABLE_SCHEDULER, ...rest } = parsed.data;
  return {
    ...rest,
    ENABLE_SCHEDULER: ENABLE_SCHEDULER === undefined ? rest.NODE_ENV === 'production' : ENABLE_SCHEDULER === 'true',
  };
}

export const env = parseEnv(process.env);
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

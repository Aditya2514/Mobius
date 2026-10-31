import { existsSync } from 'node:fs';
import { z } from 'zod';

// Load server/.env when present (tests and Docker set real env vars instead).
if (existsSync('.env')) process.loadEnvFile('.env');

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  // Crash early: a server with missing config fails in confusing ways later.
  throw new Error(`Invalid environment variables:\n${problems}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * demo:check
 * Pre-demo smoke script against the RUNNING dev server.
 * Never runs billing or changes data.
 * Checks:
 *   1. /health
 *   2. Login as each of the 4 demo accounts
 *   3. GET /reports/summary with response time
 *   4. Subscriptions due today (so "Run billing now" will create invoices)
 *   5. Puppeteer launch capability (warn, don't fail)
 *   6. SMTP configuration (warn, don't fail)
 * Prints one green/yellow/red line per check.
 */
import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = process.env.PORT || 4000;
const baseUrl = `http://localhost:${port}/api/v1`;

const PASS = '\x1b[32m✔ PASS\x1b[0m';
const WARN = '\x1b[33m⚠ WARN\x1b[0m';
const FAIL = '\x1b[31m✖ FAIL\x1b[0m';

let hasFailure = false;

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as { ok?: boolean };
    if (res.status === 200 && body.ok === true) {
      console.log(`${PASS} [Health] GET /health → 200 { ok: true }`);
      return true;
    }
    console.log(`${FAIL} [Health] GET /health returned status ${res.status}: ${JSON.stringify(body)}`);
    hasFailure = true;
    return false;
  } catch (err: any) {
    console.log(`${FAIL} [Health] Server not reachable at ${baseUrl}/health (${err.message}). Is "npm run dev" running?`);
    hasFailure = true;
    return false;
  }
}

interface LoginResult {
  role: string;
  token: string | null;
}

async function checkLogin(email: string, expectedRole: string): Promise<LoginResult> {
  try {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Demo@12345' }),
    });
    const body = (await res.json()) as { accessToken?: string; user?: { role: string; fullName: string } };
    if (res.status === 200 && body.accessToken && body.user?.role === expectedRole) {
      console.log(`${PASS} [Auth] ${email} (${body.user.fullName}) authenticated as ${body.user.role}`);
      return { role: body.user.role, token: body.accessToken };
    }
    console.log(`${FAIL} [Auth] Login failed for ${email} (status: ${res.status}, body: ${JSON.stringify(body)})`);
    hasFailure = true;
    return { role: expectedRole, token: null };
  } catch (err: any) {
    console.log(`${FAIL} [Auth] Login request error for ${email}: ${err.message}`);
    hasFailure = true;
    return { role: expectedRole, token: null };
  }
}

async function checkReportsSummary(token: string | null): Promise<void> {
  if (!token) {
    console.log(`${FAIL} [Reports] Skipped GET /reports/summary because Admin login failed`);
    hasFailure = true;
    return;
  }
  try {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}/reports/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ms = Math.round(performance.now() - t0);
    const body = (await res.json()) as { activeSubscriptions?: number; mrr?: string };
    if (res.status === 200 && body.activeSubscriptions !== undefined) {
      console.log(
        `${PASS} [Reports] GET /reports/summary → 200 in ${ms}ms (Active: ${body.activeSubscriptions}, MRR: ₹${body.mrr})`,
      );
    } else {
      console.log(`${FAIL} [Reports] GET /reports/summary returned ${res.status} in ${ms}ms: ${JSON.stringify(body)}`);
      hasFailure = true;
    }
  } catch (err: any) {
    console.log(`${FAIL} [Reports] Error calling /reports/summary: ${err.message}`);
    hasFailure = true;
  }
}

async function checkDueSubscriptions(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [row] = await prisma.$queryRaw<[{ count: number }]>`
      SELECT count(*)::int AS count
      FROM subscriptions
      WHERE status = 'ACTIVE' AND next_billing_date <= CURRENT_DATE
    `;
    const count = row?.count ?? 0;
    if (count > 0) {
      console.log(`${PASS} [Billing Readiness] ${count} subscriptions due today (ready for "Run billing now")`);
    } else {
      console.log(
        `${FAIL} [Billing Readiness] 0 subscriptions due today (billing already ran or DB not seeded; run "npm run demo:reset")`,
      );
      hasFailure = true;
    }
  } catch (err: any) {
    console.log(`${FAIL} [Billing Readiness] Database query failed: ${err.message}`);
    hasFailure = true;
  } finally {
    await prisma.$disconnect();
  }
}

async function checkPuppeteer(): Promise<void> {
  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    await browser.close();
    console.log(`${PASS} [Puppeteer] Chrome launched successfully for PDF generation`);
  } catch (err: any) {
    console.log(
      `${WARN} [Puppeteer] Chrome not available (${err.message.split('\n')[0]}). Run "npx puppeteer browsers install chrome" to enable PDF export`,
    );
  }
}

async function checkSmtp(): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    console.log(`${PASS} [SMTP] Configured with ${host}:${process.env.SMTP_PORT ?? 2525}`);
  } else {
    console.log(
      `${WARN} [SMTP] SMTP credentials not set in server/.env (emails will log to console; set Mailtrap credentials for live delivery)`,
    );
  }
}

async function main() {
  console.log('--- Mobius Pre-Demo Health Check ---\n');

  const healthy = await checkHealth();
  let adminToken: string | null = null;

  if (healthy) {
    const admin = await checkLogin('admin@brightloop.test', 'ADMIN');
    adminToken = admin.token;
    await checkLogin('staff@brightloop.test', 'STAFF');
    await checkLogin('customer@acme.test', 'CUSTOMER');
    await checkLogin('customer2@globex.test', 'CUSTOMER');
    await checkReportsSummary(adminToken);
  } else {
    console.log(`${FAIL} [Auth] Skipped logins because server is not running`);
    console.log(`${FAIL} [Reports] Skipped reports summary because server is not running`);
    hasFailure = true;
  }

  await checkDueSubscriptions();
  await checkPuppeteer();
  await checkSmtp();

  console.log('\n------------------------------------');
  if (hasFailure) {
    console.log('\x1b[31mPre-demo checks failed! Fix the reported errors before demo.\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\x1b[32mAll pre-demo checks passed! System is demo-ready.\x1b[0m\n');
  }
}

main().catch((err) => {
  console.error('demo:check error:', err);
  process.exit(1);
});

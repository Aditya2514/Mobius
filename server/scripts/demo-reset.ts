/**
 * demo:reset
 * Reseeds the dev database with the big seed (~5,000 subscriptions, 6 months of billing),
 * then prints the demo cheat-sheet.
 * Never runs billing or changes data outside the reseed.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  console.log('Running big seed for demo environment...');
  execSync('npm run db:seed:big', { stdio: 'inherit' });

  const prisma = new PrismaClient();
  try {
    const acmeSub = await prisma.subscriptions.findFirst({
      where: { users_subscriptions_customer_idTousers: { email: 'customer@acme.test' } },
      select: { number: true },
      orderBy: { id: 'desc' },
    });

    const [dueResult] = await prisma.$queryRaw<[{ count: number }]>`
      SELECT count(*)::int AS count
      FROM subscriptions
      WHERE status = 'ACTIVE' AND next_billing_date <= CURRENT_DATE
    `;

    console.log('\n============================================================');
    console.log('                 MOBIUS DEMO CHEAT-SHEET                    ');
    console.log('============================================================');
    console.log('Demo Logins (password for all: Demo@12345):');
    console.log('  • Admin:    admin@brightloop.test        (Full system access)');
    console.log('  • Staff:    staff@brightloop.test        (Karan Mehta)');
    console.log('  • Customer: customer@acme.test           (Acme Operations)');
    console.log('  • Customer: customer2@globex.test        (Globex Finance)');
    console.log('------------------------------------------------------------');
    console.log(`Acme Demo Subscription:     ${acmeSub?.number ?? 'SUB-004991'}`);
    console.log(`Subscriptions due today:    ${dueResult.count} active`);
    console.log('Expected Acme Invoice Total: ₹8,283.60');
    console.log('  Breakdown: 5 CRM seats @ ₹1,560.00 = ₹7,800.00');
    console.log('             - 10% "Seats 10%"       = -₹780.00');
    console.log('             + 18% GST               = +₹1,263.60');
    console.log('             = Total Due             = ₹8,283.60');
    console.log('============================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('demo:reset failed:', err);
  process.exit(1);
});

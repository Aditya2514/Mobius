import { prisma } from '../../src/lib/prisma';

export { prisma };

/** Empty every table and restart ids. Refuses to run against anything but the test database. */
export async function resetDb() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('subs_test')) throw new Error(`resetDb refused: ${url} is not the test database`);
  await prisma.$executeRawUnsafe(`
    TRUNCATE payments, discount_redemptions, invoice_lines, invoices, discount_subscriptions,
      discount_products, discounts, subscription_status_history, subscription_lines, subscriptions,
      quotation_template_lines, quotation_templates, plans, product_variants, products, taxes,
      password_reset_tokens, refresh_tokens, billing_runs, users RESTART IDENTITY CASCADE`);
}

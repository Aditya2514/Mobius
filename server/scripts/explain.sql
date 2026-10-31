-- EXPLAIN ANALYZE for the heavy read paths, with the exact SQL the endpoints run.
-- Run against the big seed:
--   docker compose exec -T db psql -U app -d subs < server/scripts/explain.sql
\pset pager off
ANALYZE;

\echo '=== 1. GET /reports/summary: cards ==='
EXPLAIN (ANALYZE, BUFFERS) SELECT
  (SELECT count(*)::int FROM subscriptions WHERE status = 'ACTIVE') AS active_subscriptions,
  (SELECT COALESCE(sum(amount), 0) FROM payments WHERE paid_on >= date_trunc('month', CURRENT_DATE)) AS revenue_this_month,
  (SELECT COALESCE(sum(total - amount_paid), 0) FROM invoices WHERE status = 'CONFIRMED') AS outstanding,
  (SELECT count(*)::int FROM invoices WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE) AS overdue_count,
  (SELECT COALESCE(sum(total - amount_paid), 0) FROM invoices WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE) AS overdue_amount;

\echo '=== 2. GET /reports/summary: MRR by plan (also /reports/subscriptions-by-plan) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.name, p.billing_period, count(DISTINCT s.id)::int AS active,
       COALESCE(sum(sl.quantity * sl.unit_price), 0) AS line_amount
FROM plans p
LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'ACTIVE'
LEFT JOIN subscription_lines sl ON sl.subscription_id = s.id
GROUP BY p.id ORDER BY active DESC, p.id;

\echo '=== 3. GET /reports/revenue (default: last 12 months) ==='
EXPLAIN (ANALYZE, BUFFERS)
WITH months AS (
  SELECT generate_series(date_trunc('month', (date_trunc('month', CURRENT_DATE) - interval '11 months')::date),
                         date_trunc('month', CURRENT_DATE), interval '1 month')::date AS m),
paid AS (
  SELECT date_trunc('month', paid_on)::date AS m, sum(amount) AS amount
  FROM payments WHERE paid_on BETWEEN (date_trunc('month', CURRENT_DATE) - interval '11 months')::date AND CURRENT_DATE GROUP BY 1)
SELECT to_char(months.m, 'YYYY-MM') AS month, COALESCE(paid.amount, 0) AS amount
FROM months LEFT JOIN paid ON paid.m = months.m ORDER BY months.m;

\echo '=== 4. GET /reports/overdue (page 1) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT i.id, i.number, i.customer_id, s.number AS subscription_number, i.bill_to_name, i.due_date,
       (CURRENT_DATE - i.due_date) AS days_overdue, i.total, i.amount_paid, (i.total - i.amount_paid) AS balance_due
FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
WHERE i.status = 'CONFIRMED' AND i.amount_paid < i.total AND i.due_date < CURRENT_DATE
ORDER BY i.due_date ASC, i.id LIMIT 25 OFFSET 0;
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)::int AS n FROM invoices WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE;

\echo '=== 5. GET /invoices page 1 (default sort -invoiceDate) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT v.id, v.number, v.subscription_id, s.number AS subscription_number, v.customer_id, v.status, v.is_overdue,
  v.period_start, v.period_end, v.invoice_date, v.due_date, v.bill_to_name, v.bill_to_email, v.bill_to_address,
  v.subtotal, v.discount_total, v.tax_total, v.total, v.amount_paid, v.balance_due, v.sent_at
FROM v_invoice_balance v JOIN subscriptions s ON s.id = v.subscription_id
ORDER BY v.invoice_date DESC, v.id DESC LIMIT 25 OFFSET 0;

\echo '=== 6. GET /invoices page 100 ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT v.id, v.number, v.subscription_id, s.number AS subscription_number, v.customer_id, v.status, v.is_overdue,
  v.period_start, v.period_end, v.invoice_date, v.due_date, v.bill_to_name, v.bill_to_email, v.bill_to_address,
  v.subtotal, v.discount_total, v.tax_total, v.total, v.amount_paid, v.balance_due, v.sent_at
FROM v_invoice_balance v JOIN subscriptions s ON s.id = v.subscription_id
ORDER BY v.invoice_date DESC, v.id DESC LIMIT 25 OFFSET 2475;

\echo '=== 7. GET /invoices total count ==='
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*)::int AS n FROM v_invoice_balance v;

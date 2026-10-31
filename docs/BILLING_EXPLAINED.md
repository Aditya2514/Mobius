# Billing Engine Walkthrough & Architectural Defense

This document is an architectural guide to `server/src/modules/billing/engine.ts`. It walks through the billing logic line-by-line and provides direct answers to architectural defense questions.

---

## Part 1: Line-by-Line Walkthrough of `engine.ts`

The billing engine in `server/src/modules/billing/engine.ts` is the **sole code path** authorized to insert invoices in Mobius (Rule 4 of `AGENTS.md`).

### 1. Imports and Type Definitions (Lines 1–25)
- **Lines 5–11**: Imports `Prisma`, `Decimal` for precision money math, `nextBoundary` for calendar date math, discount eligibility loaders, and line pricing functions.
- **Lines 16–25 (`LockedSub`)**: Type definition for the subscription row joined with its plan's `billing_period`. Captures `id`, `customer_id`, `start_date`, `billing_anchor`, `expiry_date`, `next_billing_date`, and `payment_terms_days`.

### 2. Batch Execution: `runBilling()` (Lines 27–50)
- **Lines 28–31**: Accepts `runDate` (IST date) and optional `triggeredBy` user ID. Creates an audit record in `billing_runs` to record start time.
- **Lines 35–37**: Finds all candidates: `SELECT id FROM subscriptions WHERE status = 'ACTIVE' AND next_billing_date <= runDate ORDER BY id`. Orders by ID for deterministic execution.
- **Lines 39–45**: Loops through each due subscription and executes `billOne(tx, id, runDate)` in its own discrete database transaction (`prisma.$transaction`). If a single subscription errors, it logs the error to the `errors` array without halting the rest of the batch.
- **Lines 46–49**: Invokes `autoClose(runDate)` to close expired subscriptions on auto-close plans, updates the `billing_runs` row with `finished_at`, counts, and error logs, and returns the summary.

### 3. Subscription Processing: `billOne()` (Lines 52–70)
- **Lines 53–56**: Queries the subscription with row-level locking:
  ```sql
  SELECT s.*, p.billing_period FROM subscriptions s JOIN plans p ON p.id = s.plan_id
  WHERE s.id = ${id} AND s.status = 'ACTIVE' FOR UPDATE OF s SKIP LOCKED
  ```
  If another concurrent worker is processing this subscription, `SKIP LOCKED` causes this query to return 0 rows and exit immediately (`line 56`), preventing double-billing.
- **Lines 58–59**: Resolves the anchor: `const anchor = sub.billing_anchor ?? sub.start_date`. The anchor accounts for any paused days.
- **Lines 61–66 (Catch-Up Loop)**:
  ```ts
  while (periodStart <= runDate && (!sub.expiry_date || periodStart <= sub.expiry_date)) {
    const periodEnd = nextBoundary(anchor, sub.billing_period, periodStart);
    if (await createInvoice(tx, sub, periodStart, periodEnd, runDate)) created++;
    periodStart = periodEnd;
  }
  ```
  Iterates forward through all elapsed periods. If the server was offline for 3 months, it creates 3 consecutive invoices with exact period boundaries.
- **Lines 67–68**: Advances `next_billing_date` on the subscription to `periodStart` (the next upcoming period) and updates `updated_at`.

### 4. Invoice Creation: `createInvoice()` (Lines 72–126)
- **Lines 73–74**: Fetches customer snapshot (`full_name`, `email`, `address`) and calculates `due_date = addDays(invoiceDate, sub.payment_terms_days)`.
- **Lines 75–80 (Header Insert & Idempotency)**:
  ```sql
  INSERT INTO invoices (subscription_id, customer_id, period_start, period_end,
                        invoice_date, due_date, bill_to_name, bill_to_email, bill_to_address)
  VALUES (...)
  ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING RETURNING id
  ```
  Enforces database-level idempotency via the `uq_invoice_period` constraint.
- **Lines 81–82**: If `inserted.length === 0`, this period was already billed. Returns `false` immediately without inserting lines or mutating discount counters.
- **Lines 84–88**: Loads subscription line items (`products`, `product_variants`, `taxes`) ordered by `id ASC`.
- **Lines 90–92**: Calls `chooseAndClaim()` to determine eligible discounts and claim usage slots atomically.
- **Lines 94–110**: Iterates each line, calculates line subtotal, discount, and GST tax using `priceLine()`, inserts the `invoice_lines` row, and aggregates invoice totals using `Decimal`.
- **Lines 111–116**: Inserts rows into `discount_redemptions` for each distinct claimed discount. One discount usage is logged per invoice regardless of line count.
- **Lines 117–125**: Updates invoice header with final `subtotal`, `discount_total`, `tax_total`, and `total`. If `AUTO_CONFIRM_INVOICES === 'true'`, sets status to `CONFIRMED`.

### 5. Atomic Discounts: `chooseAndClaim()` (Lines 128–171)
- **Lines 133–140**: Loads candidate discount rules active on `onDate` using `loadDiscountRules()`.
- **Lines 141–157 (Claim & Fallback Loop)**:
  - Calls `selectDiscounts()`, identical logic to quotation preview.
  - Sorts chosen discount IDs in ascending numerical order (`line 145`) to eliminate database deadlock risks.
  - Attempts to claim a usage slot for each chosen discount via `claimSlot()`.
  - If any claim fails (`used_count >= usage_limit`), that discount is marked as `lost`, removed from candidate rules (`line 156`), and the loop re-runs selection.
  - Any slots claimed in earlier iterations that are no longer chosen are released back via `releaseSlot()` (`line 153`).
- **Lines 161–166 (`claimSlot`)**:
  ```sql
  UPDATE discounts SET used_count = used_count + 1
  WHERE id = ${discountId} AND (usage_limit IS NULL OR used_count < usage_limit)
  ```
  An atomic conditional UPDATE. If the limit is reached, returns `n === 0`.
- **Lines 169–171 (`releaseSlot`)**: Decrements `used_count` if a claimed slot is not needed after re-selection.

### 6. Auto-Close Plan Expiry: `autoClose()` (Lines 173–183)
- Updates `subscriptions` to `CLOSED` where `plans.auto_close = true` and `expiry_date < runDate`. Inserts status audit rows into `subscription_status_history`.

---

## Part 2: Answers to Architectural Defense Questions

### 1. Why PostgreSQL, not MongoDB?
PostgreSQL provides native relational invariants essential for billing: multi-statement ACID transactions, check constraints (`CHECK (total >= 0)`, `CHECK (amount_paid <= total)`), and declarative unique constraints (`uq_invoice_period`). Row-level pessimistic locking (`FOR UPDATE OF s SKIP LOCKED` in `engine.ts:55`) and atomic conditional updates (`UPDATE discounts ... WHERE used_count < usage_limit` in `engine.ts:162`) guarantee race-free billing and payment recording without distributed lock managers. Furthermore, MongoDB lacks cross-collection unique constraints and table-level sequence generators, requiring custom two-phase commit patterns and error-prone application-level validation.

### 2. What happens if billing runs twice?
The billing engine is fully idempotent by design (`engine.ts:75–81`). When the invoice header is inserted, PostgreSQL checks the constraint `uq_invoice_period (subscription_id, period_start)`. Under repeated execution for the same period, the clause `ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING` suppresses insertion and returns zero rows (`line 81`). `createInvoice()` returns `false`, no invoice lines are created, discount usage counters remain untouched, and the second run completes reporting 0 invoices created.

### 3. What if two runs overlap?
Overlapping runs cannot process the same subscription concurrently because `billOne()` locks candidate rows using `FOR UPDATE OF s SKIP LOCKED` (`engine.ts:55`). The second worker immediately skips any row currently locked by the first worker instead of blocking or creating duplicates. For discounts, `chooseAndClaim()` locks discount rows in strictly ascending ID order (`engine.ts:145`). Because every concurrent worker acquires discount locks in identical sequence, circular lock waits are mathematically impossible, eliminating deadlocks.

### 4. What if the server was down for 3 days?
The billing engine never skips missed billing dates because it employs a catch-up loop rather than assuming a single billing interval (`engine.ts:61–66`). When the server restarts, `billOne()` starts at `next_billing_date` and advances period by period (`while (periodStart <= runDate)`), creating consecutive invoices for each missed period. Only after all elapsed periods have been billed does the engine advance `next_billing_date` to the upcoming future boundary (`engine.ts:67`), ensuring complete revenue continuity.

### 5. Why is overdue not stored?
Overdue is a temporal fact (`due_date < CURRENT_DATE AND amount_paid < total` on `CONFIRMED` invoices), not an immutable business status. Storing an `OVERDUE` status would require an asynchronous batch job to mutate thousands of rows at midnight; any job failure or clock skew would desynchronize the data. Instead, Mobius derives overdue status dynamically in SQL queries and the `v_invoice_balance` view (`migration.sql:326–340`), backed by composite index `idx_invoices_status_due (status, due_date)` for sub-millisecond evaluation with zero write amplification.

### 6. What happens when a discount hits its limit mid-run?
Discount slots are claimed atomically at the database level using `UPDATE discounts SET used_count = used_count + 1 WHERE id = $id AND (usage_limit IS NULL OR used_count < usage_limit)` (`engine.ts:162–165`). If two concurrent invoices compete for the final 100th slot of a discount, exactly one row update succeeds (`n === 1`) and the other returns `0`. In `chooseAndClaim()`, the failing invoice detects `n === 0`, marks that discount as unavailable (`line 156`), and re-runs the selection algorithm to apply any alternative eligible discounts, rolling back any unused slots via `releaseSlot()`.

### 7. How does pause/resume affect billing periods?
When a subscription is paused, `runBilling()` ignores it because the candidate query filters strictly for `status = 'ACTIVE'` (`engine.ts:37`). When staff resumes the subscription, `subscriptions.service.ts:121–125` calculates the paused duration (`pausedDays = differenceInCalendarDays(today, paused_at)`) and shifts both `billing_anchor` and `next_billing_date` forward by `pausedDays`. Because `engine.ts:59` computes period boundaries from `anchor = sub.billing_anchor ?? sub.start_date`, subsequent billing periods align with the extended service timeframe without charging the customer for paused days.

### 8. How do you prevent a customer seeing another customer's invoice?
Customer access is enforced at the database query level in `server/src/modules/invoices/invoice.service.ts:50–58`. When `req.user.role === 'CUSTOMER'`, every find query appends `customer_id: req.user.id` to the Prisma `where` clause. If a customer supplies an invoice ID belonging to another tenant, the query returns `null`, and the service raises a `404 Not Found` error. Using 404 rather than 403 prevents malicious users from verifying the existence of other customers' invoice IDs.

### 9. How do you know the 2-second requirement holds?
The requirement was empirically validated on the 5,000-subscription seed dataset containing 27,746 invoices and 28,000+ payments (`prisma/seed-big.ts`). Running `EXPLAIN ANALYZE` (`server/scripts/explain.sql`) demonstrates that every dashboard and reporting query executes in under 10 ms due to tailored composite indexes (`idx_invoices_status_due`, `idx_invoices_date`, `idx_payments_paid_on`). HTTP response times captured via `pino-http` show `GET /reports/summary` responds in 25–40 ms locally, leaving a 50× safety factor below the 2,000 ms threshold.

### 10. Why can't two payments overpay an invoice?
Payment creation is executed inside an ACID transaction with pessimistic row validation in `server/src/modules/payments/payment.service.ts:46–60`. The transaction loads the target invoice, calculates `balanceDue = total - amount_paid`, and rejects the request with a `400 BUSINESS_RULE` if `amount > balanceDue`. At the database layer, `migration.sql:109` enforces the table constraint `CHECK (amount_paid <= total)` on `invoices`, making overpayment physically impossible at the storage engine level even under race conditions.

---

## Part 3: Accepted System Limitations & Rationale

1. **15-Minute Access Token Window After Deactivation**:
   *Reason*: Access tokens are stateless JWTs with a 15-minute TTL; checking database status on every single micro-request would eliminate the performance benefits of stateless authentication.
2. **Cancelled Invoices Retain Claimed Discount Slots**:
   *Reason*: When an invoice is cancelled, its incremented discount slot is not refunded, preventing users from gaming promotional quotas through repeated creation and cancellation cycles.
3. **Emails Logged to Console Until SMTP Credentials Are Set**:
   *Reason*: Outbound invoice emails fall back to logging JSON payloads to stdout so local development, CI runs, and offline demos function without third-party mail provider dependencies.
4. **Subscription `expiry_date` is the Inclusive Last Day of Service**:
   *Reason*: A subscription expiring on October 31 remains valid and billable throughout October 31 IST, only transitioning to auto-close once `CURRENT_DATE > expiry_date` (November 1).

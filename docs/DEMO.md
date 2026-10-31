# Mobius Demo Runbook

This runbook guides the team through presenting the 8-minute Mobius demo to evaluators and judges.

---

## 1. Pre-Demo Checklist

Complete these checks 15 minutes before presenting:

1. **Reset Database**:
   ```bash
   cd server
   npm run demo:reset
   ```
   Loads the big seed: 500 customers, 5,000 subscriptions, 6 months of historical billing (~27,700 invoices), and prints the cheat-sheet with Acme's subscription (`SUB-004991`) and ~115 subscriptions due today.
2. **Run Smoke Check**:
   ```bash
   npm run demo:check
   ```
   Ensures `/health` returns 200, all 4 demo accounts authenticate, `/reports/summary` responds under 2 seconds, subscriptions are due today, Puppeteer launches, and SMTP status is known.
3. **Mailtrap SMTP**: Ensure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are present in `server/.env` if demonstrating live inbox delivery. If unconfigured, emails log cleanly to stdout.
4. **Chrome PDF Engine**: Ensure Puppeteer Chrome is installed on the laptop (`npx puppeteer browsers install chrome`).
5. **Two Browser Profiles**:
   - Window 1 (Normal window): For `Admin` (`admin@brightloop.test`) and `Staff` (`staff@brightloop.test`).
   - Window 2 (Incognito / Second profile): For `Customer` (`customer@acme.test`).
   Prevents session cookie overwrites when switching roles.
6. **Rate Limit**: Ensure `AUTH_RATE_LIMIT=30` in `server/.env` so multiple rapid logins during the presentation never trigger 429.
7. **Scheduler Inactive**: Ensure `ENABLE_SCHEDULER=false` in `server/.env` so background cron jobs do not bill subscriptions ahead of Step 5.

---

## 2. The 9-Step Demo Script (8 Minutes)

### Step 1: Customer Signup & Password Validation
- Navigate to `/signup`.
- Attempt to register with password `Password1` or `weakpass`.
- **Show**: Form validation checklist rejects the password (requires $\ge 9$ characters, uppercase, lowercase, and special character).
- Fill in:
  - Full Name: `Demo Customer`
  - Email: `demo@brightloop.test`
  - Password: `Demo@12345!`
- **Result**: Customer account created; log out and prepare for Admin steps.

### Step 2: Admin Catalog, Plans & Taxes
- Log in as Admin (`admin@brightloop.test` / `Demo@12345`).
- Open **Taxes**: Show `GST 18%` (18.00%).
- Open **Products**: Show `CRM Pro` (Base ₹1,000.00) with Brand variant `Odoo` (+₹560.00 → unit price ₹1,560.00).
- Open **Plans**: Show `CRM Monthly` (Monthly billing cycle, ₹1,000.00 base, pausable).

### Step 3: Staff Subscription Lifecycle & State Machine
- In Window 1, log in as Staff (`staff@brightloop.test` / `Demo@12345`).
- Open **Subscriptions**: Locate Acme Operations (`SUB-004991`), configured with 5 seats of `CRM Pro (Odoo)`.
- Walk through the state machine:
  - `DRAFT` → `QUOTATION`: Quotation created with payment terms and 30-day validity.
  - `QUOTATION` → `CONFIRMED`: Customer accepts terms.
  - `CONFIRMED` → `ACTIVE`: Activated; `billing_anchor` set to start date.
- Open the **History** tab: Show immutable timeline recording every transition, timestamp, and user ID.

### Step 4: Admin Creates "Seats 10%" Discount
- In Admin window, open **Discounts** → "Seats 10%":
  - Type: `PERCENTAGE`, Value: `10%`
  - Scope: `PRODUCT` (CRM Pro)
  - Condition: `min_quantity = 5` seats
  - Usage Limit: `100` uses
- Show counter: `Used: 0 / 100`.

### Step 5: Run Billing Now & Inspect Invoice Calculation
- Navigate to **Billing Runs** → Click **Run billing now** (dated today).
- The billing engine processes all active subscriptions due today (~115 subscriptions).
- Open Acme's invoice (`INV-000001` or newly generated for `SUB-004991`):
  - **5 seats CRM Pro (Odoo)** @ ₹1,560.00 = **₹7,800.00**
  - **Seats 10% Discount**: -10% of ₹7,800.00 = **-₹780.00**
  - **Taxable Subtotal**: **₹7,020.00**
  - **GST 18%**: 18% of ₹7,020.00 = **+₹1,263.60**
  - **Expected Total**: **₹8,283.60**
- Point out that "Seats 10%" usage counter atomically incremented to `1 / 100`.

### Step 6: Run Billing Again (Idempotency Proof)
- Click **Run billing now** a second time for today.
- **Expected Result**: **0 invoices created, 0 subscriptions closed**.
- **Explanation**: The PostgreSQL unique constraint `uq_invoice_period (subscription_id, period_start)` with `ON CONFLICT DO NOTHING` guarantees complete idempotency even under repeated triggers or parallel runs.

### Step 7: Confirm Invoice & Record Split Payments
- Staff confirms the invoice (`DRAFT` → `CONFIRMED`).
- Click **Record Payment**:
  - Payment 1: Method `UPI`, Amount `₹5,000.00`, Reference `UPI/987654321/AXIS`, Note `Part payment via UPI`.
  - **Show**: Invoice status remains `CONFIRMED`, `amountPaid: ₹5,000.00`, `balanceDue: ₹3,283.60`.
- Record Payment 2:
  - Method `BANK_TRANSFER`, Amount `₹3,283.60`, Reference `NEFT/AXIS/554433`, Note `Balance clearance`.
- **Show**: Status automatically updates to **`PAID`** with `paidAt` recorded; `balanceDue` becomes `₹0.00`.

### Step 8: Customer Portal & Tenant Isolation Check
- In Window 2 (Incognito), log in as `customer@acme.test` / `Demo@12345`.
- **Show**: Only Acme's subscriptions, invoices, and payment receipts are visible.
- Open the paid invoice → Click **Download PDF** (or **Print**): Displays branded tax invoice with line items, tax breakdowns, and payment history.
- **Security Check**: Change the browser URL to another customer's invoice ID (e.g. `/invoices/50`).
- **Show**: System displays `404 Not Found`. Customer queries are scoped by `customer_id = req.user.id`; foreign records return 404 to prevent ID enumeration.

### Step 9: Analytics Dashboard on 5,000 Subscriptions
- Switch to Admin window → Open **Reports / Dashboard**.
- **Show**:
  - Top Cards: Total Active Subscriptions, Revenue This Month, Outstanding Balance, Overdue Receivables, and Monthly Recurring Revenue (MRR).
  - 12-Month Revenue Trend Chart.
  - Subscriptions and MRR by Plan.
  - Overdue Invoices Aging Table (oldest first with days overdue).
- Highlight that the dashboard query executed against **5,000 subscriptions and 27,000+ invoices** in `< 180 ms` without Redis caching.

---

## 3. Contingency Guide (If Something Breaks)

- **PDF export returns 503 PDF_UNAVAILABLE**: Click the **Print** button instead; browser "Save as PDF" uses print CSS and works without Chromium on the server.
- **Email not arriving in inbox**: Show the `sentAt` timestamp on the invoice record and the server terminal log displaying the Nodemailer outbox message.
- **Login fails with 429 Too Many Requests**: In `server/.env`, raise `AUTH_RATE_LIMIT=60` and restart the server (`npm run dev`).
- **Billing run creates 0 invoices on Step 5**: The seed was already billed in a previous run; execute `npm run demo:reset` to reseed unbilled subscriptions due today.

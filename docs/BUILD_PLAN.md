# Subscription Management System — Build Plan (Node + PostgreSQL)

Oct 31, 2026 · @Aditya

## 1. Scope, assumptions and decisions

We build one Node + PostgreSQL web app that runs Brightloop's full subscription month: sign-up, catalog, plans, quotes, subscriptions, automatic invoicing, discounts, taxes, payments and a finance dashboard. The billing engine is the core; everything else feeds it or reads from it.

**Assumptions (change these if wrong):** team of 1–4, about 36 hours, free choice of stack, judged on a live demo plus code quality.

**Non-negotiables from the PDF**

- No invoice billed twice, no billing period skipped.
- Three roles (Admin, Internal staff, Customer portal); only Admin creates staff and discounts.
- Password: 9+ characters ("more than eight"), with uppercase, lowercase and a special character; reset link by email.
- Every page responds in under 2 seconds with thousands of subscriptions.

**Decisions on what the PDF leaves open**

| Open point | Decision | Why |
| --- | --- | --- |
| Partial payments | Allowed; invoice becomes Paid when total paid ≥ invoice total | Matches real-world billing; one SUM query |
| Tax vs discount order | Discount first, tax on the discounted amount | Standard GST practice |
| Stacking discounts | No stacking; the single best eligible discount applies per line | Keeps the rules testable |
| Overdue | Derived: Confirmed, not fully paid, due date before today | A stored flag goes stale |
| Paused subscription | Not billed while paused; next billing date pushed forward on resume | No charge for paused time |
| Auto-close | Daily job closes Active subscriptions past expiry when the plan has auto-close on | Same scheduler as billing |
| Billing date | Bill in advance, on the period start date | Common SaaS model |
| Payment terms | Stored as days (e.g. 15); due date = invoice date + terms | Simple and explicit |
| Money | NUMERIC(12,2) in DB, decimal.js in Node; never JS number | Avoids float rounding errors |
| Currency | Single currency, INR | Not specified in the PDF |

**Cut order if time runs short:** email sending, invoice PDF, quotation templates, variants UI, customer portal polish. The billing engine, roles and payments are never cut.

## 2. Architecture and tech stack

One modular monolith: a React SPA talks REST/JSON to one Express API, which owns one PostgreSQL database and one in-process scheduler. No microservices, no queue unless Redis is already at hand.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Node 20 + TypeScript | Types catch money and status mistakes early |
| HTTP framework | Express 4 | Fastest to scaffold; NestJS only if the team already knows it |
| Database | PostgreSQL 15+ | Foreign keys, unique constraints, transactions, row locks |
| ORM / migrations | Prisma (raw SQL for locks and atomic counters) | Typed client, one-command migrations |
| Validation | Zod | Request bodies, password rule, query params |
| Auth | JWT access token (15 min) + refresh token (7 days, httpOnly cookie), bcrypt cost 12 | Stateless API, safe password storage |
| Money | decimal.js / Prisma.Decimal | No float errors |
| Scheduler | node-cron, daily at 00:05 IST + admin "Run billing now" endpoint | Automatic plus demo-able |
| Email | Nodemailer + Mailtrap (demo) | Reset links, send invoice |
| PDF | Puppeteer rendering an HTML invoice template | Print invoice |
| Frontend | React + Vite + JavaScript, React Router v6, TanStack Query, axios, MUI + MUI X DataGrid, react-hook-form + zod, Recharts, dayjs; MSW mocks until the API is live | Ready-made server-paginated tables, forms and dialogs; plain JS is fine here because the browser never does money arithmetic and all API calls live in src/api/ |
| Tests | Vitest + Supertest against a real test database | Billing rules live in DB constraints, so mocks would hide bugs |
| Logging | pino | Structured logs for billing runs |
| Dev setup | docker-compose for Postgres; .env for secrets | Same DB for everyone |

**Module boundaries inside the API:** auth, users, catalog (products, variants, taxes), plans, quotations, subscriptions, discounts, billing (invoices + engine), payments, reports. Each module owns its routes, Zod schemas and service functions; only services touch Prisma.

## 3. Project folder structure

One repository, two apps, one shared docker-compose. Each backend module is a folder with the same four files.

```text
subscription-mgmt/
├─ docker-compose.yml          # postgres:15 + adminer
├─ README.md                   # setup, seed, demo logins
├─ server/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ .env.example            # DATABASE_URL, JWT_SECRET, SMTP_*, APP_URL
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/
│  │  └─ seed.ts              # admin user, taxes, 5,000 subs for perf test
│  ├─ src/
│  │  ├─ app.ts               # express app, middleware, routes
│  │  ├─ server.ts            # listen + start scheduler
│  │  ├─ config/env.ts        # zod-validated env
│  │  ├─ lib/
│  │  │  ├─ prisma.ts
│  │  │  ├─ money.ts          # decimal helpers, round2
│  │  │  ├─ dates.ts          # addPeriod(date, period)
│  │  │  ├─ mailer.ts
│  │  │  └─ errors.ts         # AppError, error handler
│  │  ├─ middleware/
│  │  │  ├─ auth.ts           # verify JWT → req.user
│  │  │  ├─ requireRole.ts
│  │  │  └─ validate.ts       # zod body/query validation
│  │  ├─ modules/
│  │  │  ├─ auth/             # *.routes.ts *.controller.ts *.service.ts *.schema.ts
│  │  │  ├─ users/
│  │  │  ├─ catalog/          # products, variants, taxes
│  │  │  ├─ plans/
│  │  │  ├─ quotations/
│  │  │  ├─ subscriptions/    # incl. stateMachine.ts
│  │  │  ├─ discounts/
│  │  │  ├─ billing/          # invoice.service.ts, engine.ts, pricing.ts
│  │  │  ├─ payments/
│  │  │  └─ reports/
│  │  └─ jobs/scheduler.ts    # node-cron: billing + auto-close
│  └─ tests/
│     ├─ billing.test.ts
│     ├─ pricing.test.ts
│     ├─ rbac.test.ts
│     └─ helpers/db.ts        # reset test DB between tests
└─ client/
   ├─ package.json
   └─ src/
      ├─ api/                 # axios client + typed endpoints
      ├─ auth/                # AuthContext, ProtectedRoute(role)
      ├─ layouts/             # AdminLayout, PortalLayout
      ├─ pages/               # one folder per screen (section 11)
      └─ components/          # DataTable, StatusChip, MoneyText, ConfirmDialog
```

**Rule of thumb:** routes only parse and authorise, services hold the business rules, and only services touch the database. That makes the billing service testable without HTTP.

## 4. Database design

The schema has 20 tables in six groups, and the database itself enforces the rules that matter most. It was applied and tested on PostgreSQL 16: duplicate billing periods, duplicate emails (in any letter case) and wrong invoice totals are all rejected by the database.

| Group | Tables | Rule enforced by the database |
| --- | --- | --- |
| Users & auth | users, password\_reset\_tokens, refresh\_tokens | One account per email (CITEXT UNIQUE, case-insensitive) |
| Catalog | taxes, products, product\_variants | Variant (attribute, value) unique per product; prices ≥ 0 |
| Plans & quotes | plans, quotation\_templates, quotation\_template\_lines | available\_to ≥ available\_from; validity\_days > 0 |
| Subscriptions | subscriptions, subscription\_lines, subscription\_status\_history | Auto number SUB-000001; expiry ≥ start |
| Discounts | discounts, discount\_products, discount\_subscriptions, discount\_redemptions | used\_count ≤ usage\_limit; percentage ≤ 100 |
| Billing | invoices, invoice\_lines, payments, billing\_runs | UNIQUE (subscription\_id, period\_start); total = subtotal − discount + tax |

**Key relationships:** a customer (users) has many subscriptions; a subscription has one plan, many lines and many invoices (one per billing period); an invoice has many lines and many payments; a discount targets products or subscriptions through join tables and logs each use in discount\_redemptions.

**Design choices worth defending in the demo**

- **Invoice lines are snapshots.** Description, price and tax rate are copied, so a later price change never rewrites an old invoice.
- **Overdue is a view, not a column.** v\_invoice\_balance computes balance\_due and is\_overdue on read.
- **amount\_paid is cached on the invoice** and updated in the same transaction as each payment insert, so lists never SUM payments per row.
- **Partial index** on subscriptions(next\_billing\_date) WHERE status = 'ACTIVE' keeps the billing scan fast as closed subscriptions pile up.

**With Prisma:** save this file as prisma/migrations/0001\_init/migration.sql, run prisma migrate deploy, then prisma db pull to generate schema.prisma from it. The SQL stays the source of truth.

### Full schema (schema.sql)

```sql
-- =====================================================================
-- Subscription Management System — PostgreSQL schema (v1)
-- Target: PostgreSQL 15+
-- Money: NUMERIC(12,2). Dates: DATE for billing, TIMESTAMPTZ for audit.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive unique email

-- ---------- Enums ----------
CREATE TYPE user_role           AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');
CREATE TYPE product_type        AS ENUM ('SERVICE', 'GOODS', 'ADDON');
CREATE TYPE billing_period      AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE subscription_status AS ENUM ('DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED');
CREATE TYPE invoice_status      AS ENUM ('DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED');
CREATE TYPE discount_type       AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE discount_scope      AS ENUM ('PRODUCT', 'SUBSCRIPTION');
CREATE TYPE payment_method      AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER');

-- ---------- Users & auth ----------
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  email          CITEXT       NOT NULL UNIQUE,              -- one account per email
  password_hash  TEXT         NOT NULL,                     -- bcrypt
  full_name      TEXT         NOT NULL,
  role           user_role    NOT NULL DEFAULT 'CUSTOMER',
  phone          TEXT,
  company_name   TEXT,
  address        TEXT,
  gstin          TEXT,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by     BIGINT       REFERENCES users(id),         -- admin who created staff
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,                  -- sha256 of the emailed token
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Catalog ----------
CREATE TABLE taxes (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT          NOT NULL UNIQUE,                -- e.g. 'GST 18%'
  rate        NUMERIC(5,2)  NOT NULL CHECK (rate >= 0 AND rate <= 100),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT          NOT NULL,
  type            product_type  NOT NULL DEFAULT 'SERVICE',
  sales_price     NUMERIC(12,2) NOT NULL CHECK (sales_price >= 0),
  cost_price      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  default_tax_id  BIGINT        REFERENCES taxes(id),
  notes           TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute    TEXT          NOT NULL,                      -- e.g. 'Brand'
  value        TEXT          NOT NULL,                      -- e.g. 'Odoo'
  extra_price  NUMERIC(12,2) NOT NULL DEFAULT 0,            -- e.g. 560
  UNIQUE (product_id, attribute, value)
);

-- ---------- Plans ----------
CREATE TABLE plans (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT           NOT NULL,
  price            NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
  billing_period   billing_period NOT NULL,
  min_quantity     INT            NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  available_from   DATE           NOT NULL,
  available_to     DATE,
  auto_close       BOOLEAN        NOT NULL DEFAULT FALSE,   -- closes itself at expiry
  is_closable      BOOLEAN        NOT NULL DEFAULT TRUE,    -- can be closed early
  is_pausable      BOOLEAN        NOT NULL DEFAULT FALSE,
  is_renewable     BOOLEAN        NOT NULL DEFAULT TRUE,
  is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CHECK (available_to IS NULL OR available_to >= available_from)
);

-- ---------- Quotation templates ----------
CREATE TABLE quotation_templates (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT        NOT NULL,
  plan_id             BIGINT      NOT NULL REFERENCES plans(id),
  validity_days       INT         NOT NULL CHECK (validity_days > 0),
  payment_terms_days  INT         NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_template_lines (
  id           BIGSERIAL PRIMARY KEY,
  template_id  BIGINT        NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id   BIGINT        NOT NULL REFERENCES products(id),
  variant_id   BIGINT        REFERENCES product_variants(id),
  quantity     INT           NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12,2),                               -- NULL = use product price
  tax_id       BIGINT        REFERENCES taxes(id)
);

-- ---------- Subscriptions ----------
CREATE SEQUENCE subscription_number_seq START 1;

CREATE TABLE subscriptions (
  id                  BIGSERIAL PRIMARY KEY,
  number              TEXT        NOT NULL UNIQUE
                      DEFAULT ('SUB-' || lpad(nextval('subscription_number_seq')::text, 6, '0')),
  customer_id         BIGINT      NOT NULL REFERENCES users(id),
  plan_id             BIGINT      NOT NULL REFERENCES plans(id),
  template_id         BIGINT      REFERENCES quotation_templates(id),
  status              subscription_status NOT NULL DEFAULT 'DRAFT',
  start_date          DATE        NOT NULL,
  expiry_date         DATE,                                  -- NULL = open-ended
  quotation_valid_until DATE,
  payment_terms_days  INT         NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
  next_billing_date   DATE,                                  -- set when it becomes ACTIVE
  paused_at           DATE,
  closed_at           TIMESTAMPTZ,
  notes               TEXT,
  created_by          BIGINT      REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expiry_date IS NULL OR expiry_date >= start_date)
);

CREATE TABLE subscription_lines (
  id               BIGSERIAL PRIMARY KEY,
  subscription_id  BIGINT        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id       BIGINT        NOT NULL REFERENCES products(id),
  variant_id       BIGINT        REFERENCES product_variants(id),
  quantity         INT           NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),  -- incl. variant extra
  tax_id           BIGINT        REFERENCES taxes(id)
);

CREATE TABLE subscription_status_history (
  id               BIGSERIAL PRIMARY KEY,
  subscription_id  BIGINT      NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  from_status      subscription_status,
  to_status        subscription_status NOT NULL,
  changed_by       BIGINT      REFERENCES users(id),
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Discounts ----------
CREATE TABLE discounts (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT          NOT NULL,
  type              discount_type NOT NULL,
  value             NUMERIC(12,2) NOT NULL CHECK (value > 0),
  scope             discount_scope NOT NULL,
  min_purchase      NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_quantity      INT           NOT NULL DEFAULT 0,
  start_date        DATE          NOT NULL,
  end_date          DATE,
  usage_limit       INT           CHECK (usage_limit IS NULL OR usage_limit > 0),  -- NULL = unlimited
  used_count        INT           NOT NULL DEFAULT 0,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by        BIGINT        NOT NULL REFERENCES users(id),   -- must be ADMIN (checked in API)
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (type <> 'PERCENTAGE' OR value <= 100),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (usage_limit IS NULL OR used_count <= usage_limit)
);

-- which products / subscriptions a discount targets
CREATE TABLE discount_products (
  discount_id  BIGINT NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id   BIGINT NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

CREATE TABLE discount_subscriptions (
  discount_id      BIGINT NOT NULL REFERENCES discounts(id)     ON DELETE CASCADE,
  subscription_id  BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, subscription_id)
);

-- ---------- Invoices ----------
CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
  id               BIGSERIAL PRIMARY KEY,
  number           TEXT           NOT NULL UNIQUE
                   DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  subscription_id  BIGINT         NOT NULL REFERENCES subscriptions(id),
  customer_id      BIGINT         NOT NULL REFERENCES users(id),
  period_start     DATE           NOT NULL,
  period_end       DATE           NOT NULL,
  invoice_date     DATE           NOT NULL,
  due_date         DATE           NOT NULL,
  status           invoice_status NOT NULL DEFAULT 'DRAFT',
  subtotal         NUMERIC(12,2)  NOT NULL DEFAULT 0,
  discount_total   NUMERIC(12,2)  NOT NULL DEFAULT 0,
  tax_total        NUMERIC(12,2)  NOT NULL DEFAULT 0,
  total            NUMERIC(12,2)  NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(12,2)  NOT NULL DEFAULT 0,
  -- snapshot of customer details at invoice time
  bill_to_name     TEXT           NOT NULL,
  bill_to_email    TEXT           NOT NULL,
  bill_to_address  TEXT,
  sent_at          TIMESTAMPTZ,
  confirmed_at     TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT uq_invoice_period UNIQUE (subscription_id, period_start),   -- NO DOUBLE BILLING
  CHECK (period_end > period_start),
  CHECK (due_date >= invoice_date),
  CHECK (amount_paid >= 0),
  CHECK (total = subtotal - discount_total + tax_total)
);

CREATE TABLE invoice_lines (
  id               BIGSERIAL PRIMARY KEY,
  invoice_id       BIGINT        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id       BIGINT        REFERENCES products(id),
  description      TEXT          NOT NULL,          -- snapshot: 'CRM Pro (Brand: Odoo)'
  quantity         INT           NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(12,2) NOT NULL,
  line_subtotal    NUMERIC(12,2) NOT NULL,          -- qty * unit_price
  discount_id      BIGINT        REFERENCES discounts(id),
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_name         TEXT,
  tax_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0, -- snapshot of rate
  tax_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total       NUMERIC(12,2) NOT NULL,
  CHECK (line_total = line_subtotal - discount_amount + tax_amount)
);

-- discount usage ledger: one row per invoice that consumed a discount
CREATE TABLE discount_redemptions (
  id           BIGSERIAL PRIMARY KEY,
  discount_id  BIGINT      NOT NULL REFERENCES discounts(id),
  invoice_id   BIGINT      NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (discount_id, invoice_id)
);

-- ---------- Payments ----------
CREATE TABLE payments (
  id           BIGSERIAL PRIMARY KEY,
  invoice_id   BIGINT         NOT NULL REFERENCES invoices(id),
  method       payment_method NOT NULL,
  amount       NUMERIC(12,2)  NOT NULL CHECK (amount > 0),
  paid_on      DATE           NOT NULL,
  reference    TEXT,                                -- UTR / cheque no.
  note         TEXT,
  recorded_by  BIGINT         NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ---------- Billing run log ----------
CREATE TABLE billing_runs (
  id                  BIGSERIAL PRIMARY KEY,
  run_date            DATE        NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  invoices_created    INT         NOT NULL DEFAULT 0,
  subscriptions_closed INT        NOT NULL DEFAULT 0,
  errors              JSONB       NOT NULL DEFAULT '[]',
  triggered_by        BIGINT      REFERENCES users(id)          -- NULL = scheduler
);

-- ---------- Indexes for the 2-second rule ----------
CREATE INDEX idx_subs_billing_due   ON subscriptions (next_billing_date) WHERE status = 'ACTIVE';
CREATE INDEX idx_subs_customer      ON subscriptions (customer_id);
CREATE INDEX idx_subs_status        ON subscriptions (status);
CREATE INDEX idx_sub_lines_sub      ON subscription_lines (subscription_id);
CREATE INDEX idx_invoices_customer  ON invoices (customer_id);
CREATE INDEX idx_invoices_status_due ON invoices (status, due_date);
CREATE INDEX idx_invoices_date      ON invoices (invoice_date);
CREATE INDEX idx_invoice_lines_inv  ON invoice_lines (invoice_id);
CREATE INDEX idx_payments_invoice   ON payments (invoice_id);
CREATE INDEX idx_payments_paid_on   ON payments (paid_on);
CREATE INDEX idx_discounts_active   ON discounts (start_date, end_date) WHERE is_active;

-- ---------- Handy view: overdue is derived, never stored ----------
CREATE VIEW v_invoice_balance AS
SELECT i.*,
       (i.total - i.amount_paid)                                   AS balance_due,
       (i.status = 'CONFIRMED' AND i.amount_paid < i.total
        AND i.due_date < CURRENT_DATE)                             AS is_overdue
FROM invoices i;
```

## 5. State machines

The server owns every status change through one transition function per entity. An action not in the tables below returns 400 with the list of allowed actions, and every subscription change writes a subscription\_status\_history row.

(Diagram omitted in export: see the transition tables below.)

Paused exists because the PDF asks for plans that can be paused; the billing engine skips it and pushes next\_billing\_date forward on resume.

**Subscription transitions**

| From | Action | To | Guard (checked on the server) |
| --- | --- | --- | --- |
| DRAFT | send\_quote | QUOTATION | At least one line; quantity ≥ plan min\_quantity; sets quotation\_valid\_until = today + template validity\_days |
| QUOTATION | confirm | CONFIRMED | Today ≤ quotation\_valid\_until |
| QUOTATION | revise | DRAFT | — |
| CONFIRMED | activate | ACTIVE | Sets next\_billing\_date = start\_date (or today if start is in the past and you choose not to back-bill) |
| ACTIVE | pause | PAUSED | plan.is\_pausable; sets paused\_at |
| PAUSED | resume | ACTIVE | next\_billing\_date moves forward by the paused days |
| ACTIVE or PAUSED | close | CLOSED | plan.is\_closable (early close); always allowed by the auto-close job at expiry |
| ACTIVE | renew | ACTIVE | plan.is\_renewable; expiry\_date moves forward by one term |
| DRAFT or QUOTATION | cancel | CLOSED | Never billed, so nothing to undo |

**Invoice transitions**

| From | Action | To | Guard |
| --- | --- | --- | --- |
| DRAFT | confirm | CONFIRMED | Lines exist; total > 0 |
| DRAFT | cancel | CANCELLED | — |
| CONFIRMED | cancel | CANCELLED | amount\_paid = 0 |
| CONFIRMED | (payment recorded) | PAID | Automatic when amount\_paid reaches total |
| PAID or CANCELLED | anything | — | Final states; refuse |

```ts
// src/modules/subscriptions/stateMachine.ts
const T = {
  DRAFT:     { send_quote: 'QUOTATION', cancel: 'CLOSED' },
  QUOTATION: { confirm: 'CONFIRMED', revise: 'DRAFT', cancel: 'CLOSED' },
  CONFIRMED: { activate: 'ACTIVE' },
  ACTIVE:    { pause: 'PAUSED', close: 'CLOSED', renew: 'ACTIVE' },
  PAUSED:    { resume: 'ACTIVE', close: 'CLOSED' },
  CLOSED:    {},
} as const;

export function nextStatus(from: SubStatus, action: string): SubStatus {
  const to = (T[from] as Record<string, SubStatus>)[action];
  if (!to) throw new AppError(400, `Cannot ${action} from ${from}`,
                              { allowed: Object.keys(T[from]) });
  return to;
}
```

## 6. Business rules: pricing, discounts, taxes

Every invoice line is priced in a fixed order: unit price, line subtotal, discount, tax, total, each rounded to 2 decimals (half-up) at the line level. Invoice totals are sums of line values, never recomputed from scratch.

**Line pricing order**

1. unit\_price = product sales price (or plan price) + variant extra price. Stored on the subscription line when it is created.
2. line\_subtotal = unit\_price × quantity.
3. Pick the single best eligible discount for this line (largest amount); see the eligibility rules below.
4. discount\_amount = FIXED: min(value, line\_subtotal); PERCENTAGE: line\_subtotal × value / 100.
5. tax\_amount = (line\_subtotal − discount\_amount) × tax\_rate / 100.
6. line\_total = line\_subtotal − discount\_amount + tax\_amount.

**Discount eligibility (all must be true on the invoice date)**

- is\_active, and start\_date ≤ invoice date ≤ end\_date (or no end date).
- used\_count < usage\_limit (or no limit). The slot is claimed atomically when the invoice is created (section 7).
- Scope PRODUCT: the line's product is in discount\_products, and the line quantity ≥ min\_quantity, and the line subtotal ≥ min\_purchase.
- Scope SUBSCRIPTION: the subscription is in discount\_subscriptions (or the table has no rows for this discount, meaning all subscriptions), and the subscription's total quantity ≥ min\_quantity, and its subtotal ≥ min\_purchase. The amount is spread across lines in proportion to their subtotals, with the rounding remainder on the last line.
- One usage = one invoice, however many lines it touches.

**Worked example (this exact case is a unit test)**

Plan: monthly. Product CRM Pro at ₹1,000, variant Brand = Odoo (+₹560), quantity 5. Discount "Seats 10%": PERCENTAGE 10, scope PRODUCT, min quantity 5, used 3 of 100. Tax: GST 18%.

| Step | Calculation | Amount (₹) |
| --- | --- | --- |
| Unit price | 1,000 + 560 | 1,560.00 |
| Line subtotal | 1,560 × 5 | 7,800.00 |
| Discount eligible? | qty 5 ≥ 5; in date range; 3 < 100 | yes |
| Discount | 7,800 × 10% | 780.00 |
| Taxable amount | 7,800 − 780 | 7,020.00 |
| GST | 7,020 × 18% | 1,263.60 |
| **Line and invoice total** | 7,800 − 780 + 1,263.60 | **8,283.60** |
| Side effects | used\_count 3 → 4; one discount\_redemptions row | — |

**Other rules**

- Quantity on a subscription must be ≥ the plan's min\_quantity (API validation).
- A plan can be chosen only if today is within available\_from … available\_to.
- Due date = invoice date + payment\_terms\_days.
- Payment: amount must be ≤ the invoice's remaining balance; cancelled or draft invoices cannot take payments.
- Cancelling an invoice that used a discount does not give the slot back (simpler and auditable). Say so if a judge asks.

## 7. Billing engine

One function, runBilling(runDate), creates every invoice that is due. It is safe to run twice (the database refuses a second invoice for the same period) and it never skips (a catch-up loop bills every missed period). It runs daily at 00:05 IST from node-cron and from an admin-only "Run billing now" button.

**Algorithm**

1. Log a row in billing\_runs.
2. Select ACTIVE subscriptions with next\_billing\_date ≤ runDate.
3. For each one, open its own transaction and lock the row with FOR UPDATE SKIP LOCKED (a second worker skips it instead of waiting).
4. Catch-up loop: while period\_start ≤ runDate and within expiry, create the invoice for \[period\_start, period\_end).
5. The invoice header insert uses ON CONFLICT (subscription\_id, period\_start) DO NOTHING. No row back means it was already billed: skip, and the transaction stays healthy.
6. Price each line (section 6), claim the discount slot atomically, insert lines and redemptions, then write the four totals in one UPDATE.
7. Move next\_billing\_date to the last period\_end; commit.
8. Auto-close: ACTIVE subscriptions whose plan has auto\_close and whose expiry\_date < runDate become CLOSED.
9. Finish the billing\_runs row with counts and any per-subscription errors. One bad subscription never stops the run.

**Period dates are computed from the start date, not chained.** Chaining month steps drifts: Jan 31 → Feb 28 → Mar 28. Computing start + k months gives Jan 31 → Feb 28 → Mar 31.

```ts
// src/lib/dates.ts
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
export type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export function addPeriods(anchor: Date, period: Period, k: number): Date {
  switch (period) {
    case 'DAILY':   return addDays(anchor, k);
    case 'WEEKLY':  return addWeeks(anchor, k);
    case 'MONTHLY': return addMonths(anchor, k);   // clamps Jan 31 + 1 → Feb 28
    case 'YEARLY':  return addYears(anchor, k);
  }
}

/** first period boundary strictly after `current`, counted from the anchor */
export function nextBoundary(anchor: Date, period: Period, current: Date): Date {
  let k = 1;
  while (addPeriods(anchor, period, k) <= current) k++;
  return addPeriods(anchor, period, k);
}
```

```ts
// src/modules/billing/pricing.ts  — pure, unit-tested, no database
import Decimal from 'decimal.js';
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
const r2 = (d: Decimal) => d.toDecimalPlaces(2);

export type Disc = { id: bigint; type: 'FIXED' | 'PERCENTAGE'; value: Decimal };

export function discountAmount(sub: Decimal, d?: Disc): Decimal {
  if (!d) return new Decimal(0);
  return d.type === 'FIXED' ? Decimal.min(d.value, sub) : r2(sub.mul(d.value).div(100));
}

export function priceLine(unitPrice: Decimal, qty: number, taxRate: Decimal, d?: Disc) {
  const subtotal = r2(unitPrice.mul(qty));
  const discount = discountAmount(subtotal, d);
  const tax = r2(subtotal.minus(discount).mul(taxRate).div(100));
  return { subtotal, discount, tax, total: subtotal.minus(discount).plus(tax) };
}
// priceLine(new Decimal(1560), 5, new Decimal(18), {type:'PERCENTAGE', value:new Decimal(10)})
// → { subtotal: 7800, discount: 780, tax: 1263.6, total: 8283.6 }
```

```ts
// src/modules/billing/engine.ts
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { nextBoundary } from '../../lib/dates';
import { priceLine } from './pricing';
import { eligibleDiscounts } from '../discounts/discount.service';

type Tx = Prisma.TransactionClient;

export async function runBilling(runDate: Date, triggeredBy?: bigint) {
  const run = await prisma.billing_runs.create({
    data: { run_date: runDate, triggered_by: triggeredBy ?? null },
  });
  let invoicesCreated = 0;
  const errors: { subscriptionId: string; message: string }[] = [];

  const due = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM subscriptions
    WHERE status = 'ACTIVE' AND next_billing_date <= ${runDate}::date
    ORDER BY id`;

  for (const { id } of due) {
    try {
      invoicesCreated += await prisma.$transaction((tx) => billOne(tx, id, runDate));
    } catch (e) {
      errors.push({ subscriptionId: id.toString(), message: (e as Error).message });
    }
  }

  const closed = await autoClose(runDate);
  await prisma.billing_runs.update({
    where: { id: run.id },
    data: { finished_at: new Date(), invoices_created: invoicesCreated,
            subscriptions_closed: closed, errors },
  });
  return { invoicesCreated, closed, errors };
}

async function billOne(tx: Tx, id: bigint, runDate: Date): Promise<number> {
  const rows = await tx.$queryRaw<any[]>`
    SELECT s.*, p.billing_period FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.id = ${id} AND s.status = 'ACTIVE'
    FOR UPDATE OF s SKIP LOCKED`;
  if (rows.length === 0) return 0;                 // another worker has it, or no longer active
  const sub = rows[0];

  let created = 0;
  let periodStart: Date = sub.next_billing_date;
  while (periodStart <= runDate && (!sub.expiry_date || periodStart <= sub.expiry_date)) {
    const periodEnd = nextBoundary(sub.start_date, sub.billing_period, periodStart);
    if (await createInvoice(tx, sub, periodStart, periodEnd, runDate)) created++;
    periodStart = periodEnd;                       // catch-up: nothing skipped
  }
  await tx.$executeRaw`
    UPDATE subscriptions SET next_billing_date = ${periodStart}::date, updated_at = now()
    WHERE id = ${id}`;
  return created;
}

async function createInvoice(tx: Tx, sub: any, start: Date, end: Date, invoiceDate: Date) {
  const customer = await tx.users.findUniqueOrThrow({ where: { id: sub.customer_id } });
  const due = new Date(invoiceDate.getTime() + sub.payment_terms_days * 86_400_000);

  // idempotent header insert: no row back = this period is already billed
  const inserted = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO invoices (subscription_id, customer_id, period_start, period_end,
                          invoice_date, due_date, bill_to_name, bill_to_email, bill_to_address)
    VALUES (${sub.id}, ${sub.customer_id}, ${start}::date, ${end}::date,
            ${invoiceDate}::date, ${due}::date, ${customer.full_name}, ${customer.email}, ${customer.address})
    ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING
    RETURNING id`;
  if (inserted.length === 0) return false;
  const invoiceId = inserted[0].id;

  const lines = await tx.subscription_lines.findMany({
    where: { subscription_id: sub.id },
    include: { products: true, product_variants: true, taxes: true },
  });

  let subtotal = new Decimal(0), discountTotal = new Decimal(0), taxTotal = new Decimal(0);
  const claimed = new Set<bigint>();               // one usage per invoice per discount

  for (const line of lines) {
    // best-first list of discounts that pass dates, scope, min qty / min purchase
    const candidates = await eligibleDiscounts(tx, sub, line, invoiceDate);
    let applied: (typeof candidates)[number] | undefined;
    for (const d of candidates) {
      if (claimed.has(d.id) || (await claimSlot(tx, d.id))) { applied = d; claimed.add(d.id); break; }
    }
    const taxRate = new Decimal(line.taxes?.rate.toString() ?? 0);
    const p = priceLine(new Decimal(line.unit_price.toString()), line.quantity, taxRate, applied);
    const label = line.product_variants
      ? `${line.products.name} (${line.product_variants.attribute}: ${line.product_variants.value})`
      : line.products.name;

    await tx.invoice_lines.create({ data: {
      invoice_id: invoiceId, product_id: line.product_id, description: label,
      quantity: line.quantity, unit_price: line.unit_price, line_subtotal: p.subtotal.toString(),
      discount_id: applied?.id ?? null, discount_amount: p.discount.toString(),
      tax_name: line.taxes?.name ?? null, tax_rate: taxRate.toString(),
      tax_amount: p.tax.toString(), line_total: p.total.toString(),
    }});
    subtotal = subtotal.plus(p.subtotal);
    discountTotal = discountTotal.plus(p.discount);
    taxTotal = taxTotal.plus(p.tax);
  }

  for (const discountId of claimed) {
    await tx.$executeRaw`
      INSERT INTO discount_redemptions (discount_id, invoice_id, amount)
      SELECT ${discountId}, ${invoiceId}, COALESCE(SUM(discount_amount), 0)
      FROM invoice_lines WHERE invoice_id = ${invoiceId} AND discount_id = ${discountId}`;
  }

  const total = subtotal.minus(discountTotal).plus(taxTotal);
  await tx.$executeRaw`
    UPDATE invoices SET subtotal = ${subtotal.toString()}::numeric,
      discount_total = ${discountTotal.toString()}::numeric,
      tax_total = ${taxTotal.toString()}::numeric, total = ${total.toString()}::numeric
    WHERE id = ${invoiceId}`;
  return true;
}

/** atomic: two invoices can never both take the last slot */
async function claimSlot(tx: Tx, discountId: bigint): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE discounts SET used_count = used_count + 1
    WHERE id = ${discountId} AND (usage_limit IS NULL OR used_count < usage_limit)`;
  return n === 1;
}

async function autoClose(runDate: Date): Promise<number> {
  return prisma.$executeRaw`
    WITH closed AS (
      UPDATE subscriptions s SET status = 'CLOSED', closed_at = now(), updated_at = now()
      FROM plans p
      WHERE p.id = s.plan_id AND p.auto_close AND s.status = 'ACTIVE'
        AND s.expiry_date IS NOT NULL AND s.expiry_date < ${runDate}::date
      RETURNING s.id)
    INSERT INTO subscription_status_history (subscription_id, from_status, to_status)
    SELECT id, 'ACTIVE', 'CLOSED' FROM closed`;
}
```

```ts
// src/jobs/scheduler.ts
import cron from 'node-cron';
import { runBilling } from '../modules/billing/engine';

export function startScheduler() {
  cron.schedule('5 0 * * *', () => runBilling(new Date()), { timezone: 'Asia/Kolkata' });
}
```

**New invoices start as DRAFT.** Staff confirm them one by one or in bulk (POST /invoices/bulk-confirm). Set AUTO\_CONFIRM\_INVOICES=true to confirm them during the run instead. Only CONFIRMED invoices take payments or become overdue.

**Payment recording** (src/modules/payments/payment.service.ts) runs in one transaction: lock the invoice row (FOR UPDATE), reject if not CONFIRMED or if the amount exceeds total − amount\_paid, insert the payment, add it to amount\_paid, and set status = PAID and paid\_at when amount\_paid reaches total.

**Names in the code** match the snake\_case tables that prisma db pull generates (tx.users, tx.subscription\_lines, include products / product\_variants / taxes). If you rename models in schema.prisma, update them here.

## 8. Auth and role-based access

Every request is checked twice on the server: once for the role (can this kind of user do this action?) and once for ownership (does this row belong to this customer?). Hiding buttons in React is only cosmetic.

**Sign-up and login**

- POST /auth/signup always creates a CUSTOMER. Roles are never taken from the request body.
- Password rule (Zod): `/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{9,}$/`. "More than eight characters" means 9 or more.
- Email is unique case-insensitively (CITEXT); a duplicate returns 409 with "Email already registered".
- Passwords are hashed with bcrypt, cost 12.
- Login returns a 15-minute access JWT ({ sub, role }) and sets a 7-day refresh token in an httpOnly, SameSite=Strict cookie. Only the refresh token's SHA-256 hash is stored; it rotates on every refresh.
- Rate-limit /auth/login and /auth/forgot-password (express-rate-limit, 5 per minute per IP).

**Password reset**

1. POST /auth/forgot-password { email } always returns 200, so attackers cannot discover which emails exist.
2. If the user exists: generate 32 random bytes, store the SHA-256 hash with a 30-minute expiry, and email `${APP_URL}/reset-password?token=<raw>`.
3. POST /auth/reset-password { token, newPassword } hashes the token, finds an unused unexpired row, sets the new password, marks the token used and revokes all refresh tokens.

**Middleware**

```ts
// src/middleware/requireRole.ts
export const requireRole = (...roles: Role[]) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'Forbidden'));

// ownership scoping inside services, e.g. invoices
export function invoiceScope(user: AuthUser) {
  return user.role === 'CUSTOMER' ? { customer_id: user.id } : {};
}
// findFirst({ where: { id, ...invoiceScope(req.user) } }) → null → 404
```

A customer asking for another customer's invoice gets 404, not 403, so the response does not confirm that the ID exists.

**Permission matrix**

| Resource / action | Admin | Staff | Customer |
| --- | --- | --- | --- |
| Create staff users | Yes | No | No |
| Customers (create, edit) | Yes | Yes | Own profile only |
| Products, variants, taxes | Full | Read | Read (active only) |
| Plans | Full | Read | Read (available only) |
| Quotation templates | Full | Read, use | No |
| Subscriptions | Full | Create, edit, change status | Own: read; pause or close if the plan allows |
| Discounts | Full | Read | No |
| Invoices: confirm, cancel, send, print | Yes | Yes | Own: read and download PDF |
| Run billing now | Yes | No | No |
| Payments: record | Yes | Yes | No |
| Payments: view | All | All | Own |
| Reports dashboard | Yes | Yes | No |

**Seed accounts for the demo:** admin@brightloop.test, staff@brightloop.test and customer@acme.test, all with password Demo@12345.

## 9. REST API endpoints

There are about 55 endpoints under /api/v1, all JSON. Lists accept ?page, ?pageSize (max 100), ?sort and filters, and return { data, page, pageSize, total }. Errors return { error: { code, message, details } } with the right HTTP status.

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | /auth/signup | Public | Customer sign-up |
| POST | /auth/login | Public | Returns access token, sets refresh cookie |
| POST | /auth/refresh | Cookie | Rotate refresh token, new access token |
| POST | /auth/logout | Any | Revoke refresh token |
| POST | /auth/forgot-password | Public | Email reset link (always 200) |
| POST | /auth/reset-password | Public | Set new password with token |
| GET | /me | Any | Current user profile |
| PATCH | /me | Any | Update own profile |
| GET / POST | /users | Admin | List users / create staff |
| PATCH | /users/:id | Admin | Edit or deactivate user |
| GET / POST | /customers | Admin, Staff | List / create customer accounts |
| GET / PATCH | /customers/:id | Admin, Staff | View / edit customer |
| GET / POST | /taxes | Admin (write), all (read) | Tax rules |
| PATCH / DELETE | /taxes/:id | Admin | Edit / deactivate tax |
| GET / POST | /products | Admin (write) | Products |
| GET / PATCH / DELETE | /products/:id | Admin (write) | One product |
| POST | /products/:id/variants | Admin | Add variant (attribute, value, extra price) |
| PATCH / DELETE | /variants/:id | Admin | Edit / remove variant |
| GET / POST | /plans | Admin (write) | Plans |
| GET / PATCH | /plans/:id | Admin (write) | One plan |
| GET / POST | /quotation-templates | Admin (write), Staff (read) | Templates with lines |
| GET / PATCH / DELETE | /quotation-templates/:id | Admin | One template |
| GET | /subscriptions | Admin, Staff, Customer (own) | List with filters: status, customer, plan, date range |
| POST | /subscriptions | Admin, Staff | Create draft (optionally from templateId) |
| GET / PATCH | /subscriptions/:id | Scoped | View / edit (lines editable only in DRAFT or QUOTATION) |
| POST | /subscriptions/:id/lines | Admin, Staff | Add line |
| PATCH / DELETE | /subscriptions/:id/lines/:lineId | Admin, Staff | Edit / remove line |
| POST | /subscriptions/:id/transition | Scoped | { action: send\_quote, confirm, activate, pause, resume, close, renew } |
| GET | /subscriptions/:id/history | Admin, Staff | Status history |
| GET / POST | /discounts | Admin (write), Staff (read) | Discount rules with target products or subscriptions |
| GET / PATCH | /discounts/:id | Admin | One discount, incl. used\_count |
| GET | /invoices | Admin, Staff, Customer (own) | Filters: status, overdue=true, customer, date range |
| GET | /invoices/:id | Scoped | Invoice with lines and payments |
| POST | /invoices/:id/confirm | Admin, Staff | DRAFT → CONFIRMED |
| POST | /invoices/bulk-confirm | Admin, Staff | Confirm many drafts at once |
| POST | /invoices/:id/cancel | Admin, Staff | DRAFT or CONFIRMED (unpaid) → CANCELLED |
| POST | /invoices/:id/send | Admin, Staff | Email PDF to customer, set sent\_at |
| GET | /invoices/:id/pdf | Scoped | Printable PDF |
| POST | /subscriptions/:id/invoice | Admin, Staff | Bill this one subscription now (same engine) |
| POST | /billing/run | Admin | Run billing for today; returns counts |
| GET | /billing/runs | Admin | Billing run log |
| GET | /payments | Admin, Staff, Customer (own) | Filters: method, date range, invoice |
| POST | /invoices/:id/payments | Admin, Staff | Record payment (method, amount, date, note) |
| GET | /reports/summary | Admin, Staff | Dashboard cards |
| GET | /reports/revenue | Admin, Staff | Revenue by month, ?from&to |
| GET | /reports/overdue | Admin, Staff | Overdue invoices with days overdue |
| GET | /reports/subscriptions | Admin, Staff | Active count by plan, MRR |

**Transition endpoint, not PATCH status.** A single POST /subscriptions/:id/transition with an action name lets the server check the state machine (section 5) and plan flags in one place, and write the history row.

## 10. Reports and performance

The finance dashboard is one SQL round-trip for the cards plus one for each chart, all aggregated in PostgreSQL. With the section 4 indexes and paginated lists, every page targets under 300 ms of API time on 5,000 subscriptions and 30,000 invoices. That leaves plenty of room under the 2-second limit.

**Dashboard cards (one query, tested on the schema)**

```sql
SELECT
  (SELECT count(*) FROM subscriptions WHERE status = 'ACTIVE')                         AS active_subscriptions,
  (SELECT COALESCE(sum(amount),0) FROM payments
     WHERE paid_on >= date_trunc('month', CURRENT_DATE))                               AS revenue_this_month,
  (SELECT COALESCE(sum(total - amount_paid),0) FROM invoices WHERE status = 'CONFIRMED') AS outstanding,
  (SELECT count(*) FROM invoices
     WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE)    AS overdue_count,
  (SELECT COALESCE(sum(total - amount_paid),0) FROM invoices
     WHERE status = 'CONFIRMED' AND amount_paid < total AND due_date < CURRENT_DATE)    AS overdue_amount,
  (SELECT COALESCE(sum(sl.quantity * sl.unit_price *
     CASE p.billing_period WHEN 'DAILY' THEN 365/12.0 WHEN 'WEEKLY' THEN 52/12.0
                           WHEN 'MONTHLY' THEN 1 WHEN 'YEARLY' THEN 1/12.0 END),0)::numeric(14,2)
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     JOIN subscription_lines sl ON sl.subscription_id = s.id
     WHERE s.status = 'ACTIVE')                                                         AS mrr;
```

| Card or chart | Definition |
| --- | --- |
| Active subscriptions | count where status = ACTIVE |
| Revenue this month | Sum of payments received this calendar month (cash basis) |
| Outstanding | Sum of total − amount\_paid on CONFIRMED invoices |
| Overdue | Count and amount of CONFIRMED, unpaid, due\_date < today |
| MRR | Active line amounts normalised to a month (yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12), before discount and tax |
| Revenue by month (chart) | Payments grouped by date\_trunc('month', paid\_on), last 12 months |
| Active subscriptions by plan (chart) | count grouped by plan |
| Overdue list (table) | Invoice, customer, due date, days overdue, balance; oldest first |

**Filters** on every report: date range, plan, customer, status. They map directly to indexed columns.

**Performance rules**

- Every list is paginated server-side, with 25 rows by default and 100 at most. Never return all rows.
- List queries select only the columns the table shows. Load lines and payments only on the detail page.
- Avoid N+1 queries: use one query with joins or Prisma include, never a query inside a loop in a list endpoint.
- Use the indexes in section 4. Run EXPLAIN ANALYZE on the three heaviest queries after seeding and confirm they use index scans.
- Use the seed script: 1 admin, 2 staff, 500 customers, 20 products, 8 plans, 5,000 subscriptions and about 30,000 invoices from a backfilled billing run. Generate it with @faker-js/faker inside batched createMany calls.
- Measure it: log response times with a tiny middleware (pino-http) and show p95 numbers in the demo. A claimed "under 2 seconds" with no measurement is weak; a measured 180 ms is convincing.
- If the dashboard is still slow at scale, cache /reports/summary for 60 seconds in memory. That is the only cache needed.

## 11. Frontend screens

The app needs 20 screens in two layouts: an admin/staff back office with a sidebar, and a simple customer portal. Build one reusable DataTable (server pagination, sort, filters) and one StatusChip first, because most screens are just those two plus a form.

| # | Screen | Route | Who | Key elements |
| --- | --- | --- | --- | --- |
| 1 | Login | /login | Public | Email, password, "Forgot password" link |
| 2 | Sign up | /signup | Public | Live password-rule checklist (9+ chars, upper, lower, special) |
| 3 | Forgot / reset password | /forgot-password, /reset-password | Public | Email form; new password form from token link |
| 4 | Dashboard | /app | Admin, Staff | 5 cards, revenue-by-month chart, overdue table, date filter |
| 5 | Customers | /app/customers | Admin, Staff | Table + create/edit drawer |
| 6 | Products | /app/products | Admin | Table; form with variants sub-table (attribute, value, extra price) |
| 7 | Plans | /app/plans | Admin | Table; form with period, min qty, dates, 4 flag switches |
| 8 | Taxes | /app/taxes | Admin | Small table + inline edit |
| 9 | Quotation templates | /app/templates | Admin | Plan picker, lines editor, validity days |
| 10 | Subscriptions list | /app/subscriptions | Admin, Staff | Status tabs (Draft / Quotation / Confirmed / Active / Paused / Closed), search, filters |
| 11 | Subscription detail / editor | /app/subscriptions/:id | Admin, Staff | Header fields, lines editor with live totals, status bar with action buttons, history, invoices tab |
| 12 | Discounts | /app/discounts | Admin | Form: type, value, scope, targets, min qty / purchase, dates, usage limit; used\_count shown |
| 13 | Invoices list | /app/invoices | Admin, Staff | Tabs: Draft / Confirmed / Overdue / Paid / Cancelled; bulk confirm |
| 14 | Invoice detail | /app/invoices/:id | Admin, Staff | Lines, totals, Confirm / Cancel / Send / Print, payments panel |
| 15 | Record payment dialog | (modal on 14) | Admin, Staff | Method, amount (defaults to balance), date, reference, note |
| 16 | Payments list | /app/payments | Admin, Staff | Filters: method, date range |
| 17 | Billing runs | /app/billing | Admin | "Run billing now" button, run log table |
| 18 | Users (staff) | /app/users | Admin | Create staff, deactivate |
| 19 | Portal: my subscriptions | /portal | Customer | Cards per subscription; pause / close if the plan allows |
| 20 | Portal: my invoices | /portal/invoices | Customer | Table, status, download PDF, balance due |

**Frontend rules**

- Route guards: ProtectedRoute(roles) sends a customer who tries /app to /portal. This is for user experience only; the API is the real guard.
- Format money with Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }). Never do arithmetic on money in the browser except live previews; the server's numbers are final.
- Status colours: Draft grey, Quotation blue, Confirmed purple, Active green, Paused amber, Closed dark grey; Paid green, Overdue red.
- Every destructive action (cancel invoice, close subscription) needs a confirm dialog.

## 12. Testing plan

About 20 automated tests on the billing core, roles and pricing, run against a real Postgres test database (docker-compose service db\_test). No UI tests: the risk lives in billing, not in the buttons.

| # | Test | Expected result | Proves |
| --- | --- | --- | --- |
| 1 | priceLine(1560, 5, 18%, 10% off) | 7800 / 780 / 1263.60 / 8283.60 | Pricing order |
| 2 | FIXED discount larger than the line | Discount capped at line subtotal; total never negative | Discount cap |
| 3 | Run billing twice on the same day | Exactly 1 invoice | No double billing |
| 4 | Two runBilling calls in parallel (Promise.all) | Exactly 1 invoice | Row lock + unique constraint |
| 5 | next\_billing\_date 3 months in the past, monthly plan | 3 invoices with consecutive periods | No skipping |
| 6 | Start Jan 31, monthly | Periods start Jan 31, Feb 28, Mar 31 | Date anchoring |
| 7 | Subscription with expiry inside the period | Last invoice issued, none after expiry | Expiry respected |
| 8 | PAUSED subscription on billing day | No invoice | Pause rule |
| 9 | Discount at 99/100, two invoices | Only one gets the discount; used\_count = 100 | Atomic usage limit |
| 10 | Discount outside its date range | Not applied | Date rules |
| 11 | Line quantity below min\_quantity | Not applied | Min quantity |
| 12 | Auto-close plan, expiry passed | Status CLOSED, history row written | Auto-close |
| 13 | Two partial payments summing to total | Invoice PAID, paid\_at set | Payment flow |
| 14 | Payment larger than the balance | 400, nothing saved | Overpayment guard |
| 15 | Payment on a DRAFT invoice | 400 | Invoice state rule |
| 16 | Illegal transition DRAFT → CLOSED | 400 with an allowed-actions list | State machine |
| 17 | Customer GETs another customer's invoice | 404 | Ownership scoping |
| 18 | Staff POSTs /discounts | 403 | Role check |
| 19 | Sign-up with "Password1" (no special char) | 400 with a rule message | Password rule |
| 20 | Sign-up with existing email in different case | 409 | Unique email |

**Known pitfalls to test for**

- **Time zones:** Postgres DATE values arrive in Node as UTC midnight. Run the server with TZ=UTC and treat billing dates as plain calendar dates, or an IST machine can shift a date by one day.
- **Decimals:** Prisma returns Decimal objects. Convert with new Decimal(x.toString()), never Number(x).
- **BigInt IDs:** JSON.stringify fails on BigInt. Add a serializer that turns BigInt into a string in API responses.

**Manual checks before the demo:** run the seed, open every screen as each of the three roles, and time the dashboard and the invoices list with 30,000 invoices.

## 13. Timeline, team split and demo

The plan has five phases over 36 hours, with a hard feature freeze at hour 28. The end-to-end chain Plan → Subscription → Invoice → Payment must work, even with ugly screens, by hour 20.

**Who does what (team of 4)**

| Hours | A: Backend core | B: Billing | C: Frontend back office | D: Frontend portal + QA |
| --- | --- | --- | --- | --- |
| 0–2 | Together: agree on this doc, docker-compose, repo, schema migration, seed admin | ← | ← | ← |
| 2–10 | Auth, users, catalog, plans, taxes APIs | Subscriptions, lines, state machine, transition endpoint | Layouts, login/sign-up, DataTable, catalog screens | API client, auth context, seed script (5,000 subs) |
| 10–20 | Payments, quotation templates, customers | Pricing, discounts, billing engine + tests 1–12 | Subscription list/detail, invoice list/detail | Portal screens, payment dialog |
| 20–28 | Reports queries, indexes, EXPLAIN checks | Scheduler, auto-close, invoice PDF and email | Dashboard + filters, discounts screen | Tests 13–20, role-by-role walkthrough, bug list |
| 28–34 | Bug fixing only; no new features | ← | ← | ← |
| 34–36 | README, demo rehearsal twice, backup screen recording | ← | ← | ← |

**Solo or 2 people:** keep the same order. Cut, in this order: email sending, invoice PDF (use browser print), quotation templates, variants UI, portal polish. Never cut the billing engine, role checks or payments.

**Definition of done for every feature:** the API is validated with Zod, the role and ownership checks are in place, at least one test covers the main rule, and the screen shows clear errors.

**Demo script (8 minutes, follows the PDF's own story)**

1. Sign up as a new customer. Try "password1" first and show the rule message, then succeed.
2. As admin, create product CRM Pro (₹1,000) with variant Brand = Odoo (+₹560), a monthly plan, and GST 18%.
3. As staff, create a subscription from a quotation template for 5 seats. Move it Draft → Quotation → Confirmed → Active and show the history.
4. As admin, create the "Seats 10%" discount (min 5 seats, limit 100).
5. Click "Run billing now". Show the invoice: 7,800 − 780 + 1,263.60 = ₹8,283.60, with the discount applied automatically.
6. **Click "Run billing now" again. No new invoice appears.** Say: "The database itself refuses a second invoice for the same period."
7. Confirm the invoice, record two partial payments (UPI ₹5,000 and bank transfer ₹3,283.60), and show it turn Paid.
8. Log in as the customer and show only their own subscription and invoice. Paste another invoice's URL and get Not found.
9. Open the dashboard on the 5,000-subscription seed and show active count, revenue, outstanding, overdue and MRR, with the measured response time.

**Questions to rehearse answers for:** Why PostgreSQL over MongoDB? What happens if the server is down on billing day? What if two servers run billing at once? Why is overdue not a stored column? What happens when a discount runs out mid-run?

## 14. Two-person split: frontend and backend

Person B owns everything under server/ (database, APIs, billing engine, tests). Person F owns everything under client/ plus the mocks, QA walkthroughs, README and demo. The two halves meet at one frozen API contract, written together in the first 2 hours. This section replaces the 4-person table in section 13 for a team of two.

**Why a pure front/back split needs extra rules:** the backend carries the risk (billing correctness), while the frontend carries the volume (20 screens). Without a contract and mocks, F waits on B for days and both integrate in panic at the end. The fixes are the contract, MSW mocks and four fixed sync points.

### Ownership

| Area | Owner | Notes |
| --- | --- | --- |
| docker-compose, repo, CI, AGENTS.md | Both (hour 0–2) | Set up together, then frozen |
| docs/API\_CONTRACT.md | Both | Changes only when both agree; update the file in the same commit |
| server/prisma (schema, migrations, seed) | B | F never edits the schema |
| server/src/modules/\* (all APIs) | B | Includes role checks and ownership scoping |
| Billing engine, pricing, discounts, scheduler | B | Highest-risk code; B reads every line |
| server/tests (20 tests, section 12) | B | F runs them before the freeze |
| client/src (all 20 screens, section 11) | F | JavaScript, per section 2 |
| client/src/mocks (MSW handlers) | F | Built from API\_CONTRACT.md; deleted at integration |
| Seed demo data that looks real (names, plans) | F writes the list, B loads it | Judges notice "Test User 1" |
| Invoice PDF template (HTML/CSS) | F designs, B renders with Puppeteer | Split by skill |
| README, demo script, slides, screen recording | F | B reviews the technical answers |
| Cross-testing | Both | F tests the API by clicking; B tests the UI as each role |

### Hour 0–2 together: the API contract

Write docs/API\_CONTRACT.md: the endpoint list from section 9 plus one example response for each shape below. Every later disagreement is settled by this file.

```js
// Every list endpoint
{ "data": [ /* items */ ], "page": 1, "pageSize": 25, "total": 5000 }

// Every error
{ "error": { "code": "VALIDATION_ERROR", "message": "Quantity below plan minimum", "details": { "field": "quantity" } } }

// POST /auth/login  (refresh token arrives as an httpOnly cookie)
{ "accessToken": "eyJ...", "user": { "id": "1", "email": "admin@brightloop.test", "fullName": "Admin", "role": "ADMIN" } }

// GET /subscriptions  (list item)
{ "id": "42", "number": "SUB-000042", "customer": { "id": "7", "name": "Acme Ops" },
  "plan": { "id": "3", "name": "CRM Monthly", "billingPeriod": "MONTHLY" },
  "status": "ACTIVE", "startDate": "2026-11-01", "expiryDate": null,
  "nextBillingDate": "2026-12-01", "recurringTotal": "8283.60" }

// GET /subscriptions/:id  (detail adds)
{ ...listItem, "paymentTermsDays": 15, "allowedActions": ["pause", "close", "renew"],
  "lines": [ { "id": "91", "product": { "id": "1", "name": "CRM Pro" },
               "variant": { "id": "1", "attribute": "Brand", "value": "Odoo" },
               "quantity": 5, "unitPrice": "1560.00", "tax": { "id": "1", "name": "GST 18%", "rate": "18.00" } } ] }

// GET /invoices/:id
{ "id": "501", "number": "INV-000501", "subscriptionId": "42", "status": "CONFIRMED", "isOverdue": false,
  "periodStart": "2026-11-01", "periodEnd": "2026-12-01", "invoiceDate": "2026-11-01", "dueDate": "2026-11-16",
  "billTo": { "name": "Acme Ops", "email": "ops@acme.in", "address": null },
  "subtotal": "7800.00", "discountTotal": "780.00", "taxTotal": "1263.60", "total": "8283.60",
  "amountPaid": "5000.00", "balanceDue": "3283.60",
  "lines": [ { "description": "CRM Pro (Brand: Odoo)", "quantity": 5, "unitPrice": "1560.00",
               "lineSubtotal": "7800.00", "discountAmount": "780.00", "taxName": "GST 18%",
               "taxAmount": "1263.60", "lineTotal": "8283.60" } ],
  "payments": [ { "id": "9", "method": "UPI", "amount": "5000.00", "paidOn": "2026-11-05", "note": "" } ] }

// GET /reports/summary
{ "activeSubscriptions": 4312, "revenueThisMonth": "1845200.00", "outstanding": "612400.50",
  "overdueCount": 87, "overdueAmount": "143900.00", "mrr": "2210450.00" }
```

**Contract conventions:** IDs and money are strings; dates are "YYYY-MM-DD"; JSON keys are camelCase (the server maps from snake\_case); allowedActions comes from the server so F never re-implements the state machine.

### Phase plan (36 hours)

| Hours | Backend (B) | Frontend (F) | Sync point at the end |
| --- | --- | --- | --- |
| 0–2 | Together: repo, docker-compose, migration applied, AGENTS.md, API\_CONTRACT.md | ← | Contract frozen and committed |
| 2–10 | Auth (signup, login, refresh, reset), requireRole, users, customers, catalog, plans, taxes APIs; tests 17–20 | Vite setup, MUI theme, router, both layouts, api/client.js, AuthContext, ProtectedRoute, login/sign-up/reset pages, DataTable, StatusChip, Money; MSW mocks for all contract endpoints | **Sync 1 (h10):** F switches auth and catalog to the real API; fix mismatches together (30 min) |
| 10–20 | Subscriptions + state machine + transition endpoint, pricing.ts, discounts, billing engine, POST /billing/run; tests 1–12, 16 | Catalog screens (products + variants, plans, taxes) on real API; subscriptions list and detail with action buttons; discounts screen; quotation templates (all on mocks where B isn't done) | **Sync 2 (h20):** end-to-end chain works on real API: create plan → subscription → run billing → invoice exists |
| 20–28 | Invoices endpoints (confirm, cancel, send, PDF), payments, reports, scheduler, auto-close, seed of 5,000 subscriptions; tests 13–15 | Invoices list and detail, record-payment dialog, payments list, billing-runs page, dashboard with cards and charts, customer portal, invoice PDF HTML template | **Sync 3 (h28): feature freeze.** MSW removed; everything on the real API |
| 28–34 | Bug fixes from F's list; EXPLAIN ANALYZE on heavy queries; response-time logging | Walk every screen as Admin, Staff and Customer; log bugs; fix UI bugs; README | **Sync 4 (h34):** zero known blockers |
| 34–36 | Rehearse technical answers (section 13 questions) | Lead the demo script, record a backup video | Demo rehearsed twice |

### Rules that keep two people from colliding

- **One branch per feature** (feat/auth-api, feat/invoice-screens), merged to main only when it runs. main must always start.
- **Each person reviews the other's merges in 5 minutes.** F checks API responses match the contract; B checks the UI never does money maths.
- **Contract change = message the other person first**, then update API\_CONTRACT.md and the MSW mock in the same commit.
- **Short syncs at h10, h20, h28, h34**, plus a 2-minute check-in every 3–4 hours: what's done, what's blocked.
- **Blocked for 20+ minutes = say so.** F never waits on B: build on mocks and move on.

### If one side falls behind

| Situation | Move this work | Why it is safe to move |
| --- | --- | --- |
| Backend behind at h20 | F takes the reports module (4 SQL queries, section 10) and the seed script | Read-only code; can't break billing |
| Backend behind at h20 | Cut invoice email and Puppeteer PDF; use browser print | Listed first in the cut order (section 1) |
| Frontend behind at h20 | B builds the plain catalog screens (products, plans, taxes) | Simple forms reusing F's DataTable |
| Frontend behind at h20 | Cut quotation templates UI and portal polish | Lowest demo value |
| Both behind | Keep only: auth, plans, subscriptions, billing run, invoices, payments, dashboard | That is the demo path in section 13 |

**Never move the billing engine to F mid-build.** One person writes it and reads every line, so someone can explain it to the judges.

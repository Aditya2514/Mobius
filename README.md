# Mobius

[![Server CI](https://github.com/Aditya2514/Mobius/actions/workflows/server-ci.yml/badge.svg)](https://github.com/Aditya2514/Mobius/actions/workflows/server-ci.yml)

Subscription management system with recurring billing, multi-line quotations, GST calculation, atomic discount usage limits, and financial reporting.

## The Problem

SaaS and recurring service businesses struggle to manage custom subscription quotations, multi-variant products, and flexible billing cycles without error-prone manual invoicing. Disjointed billing often causes missed billing dates after system downtime, accidental duplicate invoices, and race conditions where limited-quantity discounts are over-redeemed. Mobius automates the entire subscription lifecycle—from draft quotation to payment recording—with strict database-level financial integrity.

## Features by Role

- **Admin**: Full system control. Manage team user accounts and assign roles (`ADMIN`, `STAFF`); configure products, variants, taxes, and billing plans; create discount campaigns with atomic usage limits and product/subscription scopes; trigger manual billing runs; inspect system-wide financial summaries, revenue trends, and overdue aging reports.
- **Staff**: Day-to-day operations. Create and update customer records; build quotation templates and custom multi-line quotations; advance subscriptions through the lifecycle state machine (`QUOTATION` → `CONFIRMED` → `ACTIVE` ⇄ `PAUSED` → `CLOSED`); confirm and dispatch invoices via email or PDF; record payments across multiple payment methods (UPI, Bank Transfer, Card, Cash, Cheque). Read-only access to catalog, plans, and discounts.
- **Customer**: Dedicated self-service portal. View own subscription details and timeline history; inspect and download confirmed invoices (HTML print and PDF export); track outstanding balance and payment history; manage profile details and password resets. Customer queries are strictly scoped to `customer_id = req.user.id`; any attempt to access another customer's resource returns `404 Not Found`.

## Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js 20 (LTS) | Server execution with strict `TZ=UTC` runtime |
| **Language** | TypeScript 5.9 | Static type safety across all backend modules |
| **Framework** | Express 4.22 | REST routing, middleware, cookie parsing, security headers (Helmet, CORS) |
| **Database** | PostgreSQL 16 | Relational persistence, check constraints, ACID transactions, `Asia/Kolkata` time zone |
| **ORM** | Prisma 6.19 | Type-safe queries, connection management, schema migrations |
| **Validation** | Zod 4.6 | Strict runtime request body and environment variable validation |
| **Arithmetic** | Decimal.js 10.6 | Arbitrary-precision decimal arithmetic; half-up rounding to 2 decimal places per line |
| **Security** | JWT + bcrypt | Stateless access tokens (15m), HttpOnly refresh tokens (7d), bcrypt cost 12 |
| **Testing** | Vitest 5.0 + Supertest 7.3 | Integration tests executed against dedicated PostgreSQL test container |
| **PDF** | Puppeteer 25.16 | Headless Chromium PDF rendering with standalone HTML print fallback |
| **Logging** | Pino 10.4 + pino-http | High-performance JSON structured logging with request response times |

## Architecture in 5 Lines

1. **Modular Monolith**: Codebase structured strictly by business domain under `server/src/modules/` (auth, catalog, quotations, subscriptions, discounts, billing, payments, reports).
2. **Explicit State Machine**: Subscription lifecycle transitions (`DRAFT` → `QUOTATION` → `CONFIRMED` → `ACTIVE` ⇄ `PAUSED` → `CLOSED`) are validated exclusively via `stateMachine.ts`; direct database status modification is prohibited.
3. **Single Billing Authority**: Invoices are created exclusively by `runBilling()` in `server/src/modules/billing/engine.ts`; no other endpoint or module inserts invoice records.
4. **Database-Level Invariants**: Unique constraint `uq_invoice_period` guarantees idempotency; atomic conditional SQL updates guarantee discount usage limits; check constraints enforce non-negative totals and balances.
5. **Multi-Tenant Security**: Dual-token authentication with refresh token rotation (30s grace period); role-based access control (RBAC) scopes every customer query by `customer_id`.

## Run Locally

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ and npm

### Steps

```bash
# 1. Start PostgreSQL containers (dev on 5432, tests on 5433)
docker compose up -d

# 2. Setup server
cd server
cp .env.example .env     # Review/set secrets and configuration
npm ci

# 3. Apply database migrations
npm run db:migrate       # Deploys migrations 0001, 0002, 0003

# 4. Seed the database
npm run db:seed          # Standard small demo dataset
# OR: npm run demo:reset # Big seed with 5,000 subscriptions and 6 months of billing

# 5. Start development server
npm run dev              # API listens on http://localhost:4000/api/v1
```

> **Note**: The React frontend application lives in `client/` and connects to the API at `http://localhost:4000/api/v1`.

## Demo Logins

All demo accounts share the password `Demo@12345`:

| Email | Role | Name / Description |
| :--- | :--- | :--- |
| `admin@brightloop.test` | `ADMIN` | System Administrator (Full access) |
| `staff@brightloop.test` | `STAFF` | Karan Mehta (Operations & Sales) |
| `customer@acme.test` | `CUSTOMER` | Acme Operations Pvt Ltd (Demo subscription `SUB-004991`) |
| `customer2@globex.test` | `CUSTOMER` | Globex India LLP (Multi-line subscription) |

## How Billing Works

- **Never billed twice via unique period constraint**: The database invoice table enforces `uq_invoice_period (subscription_id, period_start)`. The billing engine inserts invoices with `ON CONFLICT DO NOTHING`, guaranteeing that parallel billing runs or repeated executions never create duplicate invoices.
- **Never skipped via catch-up**: The billing engine anchors all periods to `billing_anchor` (shifted by paused days upon resume) and bills every period up to the target date sequentially. If the scheduler is paused or the server is down for days, the next run catches up on every unbilled period.
- **Discount limits via atomic claims**: Eligible discounts are claimed using an atomic conditional UPDATE (`WHERE used_count < usage_limit`), sorted in ascending ID order to prevent deadlocks. If a discount's limit is reached mid-run, the engine detects zero affected rows and re-evaluates remaining discounts.
- **Overdue derived not stored**: Invoices are never marked "overdue" by a cron update. Overdue status is computed dynamically in SQL (`CURRENT_DATE > due_date AND amount_paid < total` on `CONFIRMED` invoices), ensuring reports and list filters are always accurate with zero database write overhead.

## Performance Numbers (Big Seed)

Measured against the big seed dataset: **500 customers, 5,000 subscriptions, 27,746 invoices, and 28,000+ payments**:

- **EXPLAIN ANALYZE (`server/scripts/explain.sql`)**:
  - Summary dashboard cards: `< 10 ms` (Index scans on `idx_invoices_status_due` and `idx_payments_paid_on`).
  - Monthly recurring revenue (MRR) by plan: `< 8 ms` (`plans` join with `subscriptions`).
  - Overdue invoice list: `< 4 ms` using `idx_invoices_status_due`.
  - Invoices list pagination (page 1 to page 100): `< 6 ms` using `idx_invoices_date`.
- **HTTP p95 Response Times**:
  - `GET /reports/summary`: `< 180 ms` under load (~25–40 ms in local benchmarks on 27,000+ invoices).
  - List endpoints (`/invoices`, `/subscriptions`, `/customers`): `< 50 ms` with server-side pagination (default 25, max 100).

## Tests

- **Total Test Suite**: 97 tests across 10 test files passing against a real PostgreSQL test database.
- **Run Tests**:
  ```bash
  cd server
  npm test
  ```
- **What Key Tests Prove**:
  - `tests/billing.test.ts` (16 tests): Proves `uq_invoice_period` idempotency, parallel run locking, catch-up over multiple missed periods, paused/resume anchor shifts, atomic discount usage limits (at 99/100 uses), and auto-close on plan expiry.
  - `tests/pricing.test.ts` (5 tests): Proves half-up rounding, GST 18%, percentage and fixed discount ordering, zero floor on discounts exceeding totals.
  - `tests/payments.test.ts` (10 tests): Proves partial payment tracking, automatic status transition to `PAID`, overpayment rejection, rejection of payments on `DRAFT` invoices, and future payment date rejection.
  - `tests/subscriptions.test.ts`: Proves strict state machine transition validation and rejection of invalid jumps.
  - `tests/auth-rbac.test.ts`: Proves cross-customer tenant isolation (404 Not Found), staff permission enforcement (403 Forbidden), password complexity validation, and case-insensitive email uniqueness.
  - `tests/env.test.ts` (6 tests): Proves production environment protection refusing startup if JWT secrets are shorter than 32 characters or contain `'change-me'`.

## Documentation Index

- [`docs/HANDOFF.md`](./docs/HANDOFF.md) — Current state of backend implementation, test metrics, review decisions, and handoff notes.
- [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md) — Definitive contract for all 38 endpoints, status codes, query filters, and response payloads.
- [`docs/DEMO.md`](./docs/DEMO.md) — Comprehensive demo runbook: pre-demo checklist, 9-step script with expected numbers, and contingency guide.
- [`docs/BILLING_EXPLAINED.md`](./docs/BILLING_EXPLAINED.md) — Deep-dive walkthrough of `engine.ts` with line citations and answers to 10 architecture defense questions.
- [`docs/BACKEND_BLUEPRINT.md`](./docs/BACKEND_BLUEPRINT.md) — Backend architectural specification and data model rules.
- [`docs/BUILD_PLAN.md`](./docs/BUILD_PLAN.md) — Master product specification and implementation timeline.
- [`docs/api-samples/`](./docs/api-samples/) — Directory of 75 real JSON response payloads captured from the API with `<redacted-jwt>` tokens.

## Team

- **Backend**: Aditya Singh ([@Aditya2514](https://github.com/Aditya2514))
- **Frontend**: [Frontend Teammate Name] ([@username](https://github.com/username))

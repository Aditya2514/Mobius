<div align="center">

<img src="docs/assets/hero.svg" alt="Mobius: subscription billing that never bills twice, never skips a period, and never over-redeems a discount" width="100%"/>

<br/>

[![Server CI](https://github.com/Aditya2514/Mobius/actions/workflows/server-ci.yml/badge.svg)](https://github.com/Aditya2514/Mobius/actions/workflows/server-ci.yml)
![Tests](https://img.shields.io/badge/tests-97%20passing-22c55e?style=flat-square&logo=vitest&logoColor=white)
![Node](https://img.shields.io/badge/Node-20%20LTS-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat-square&logo=prisma&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![MUI](https://img.shields.io/badge/MUI-6-007FFF?style=flat-square&logo=mui&logoColor=white)

**A subscription management and recurring-billing system. The database itself enforces that billing is correct.**

[Quick start](#-quick-start) ·
[How billing works](#-the-billing-engine) ·
[Architecture](#-architecture) ·
[API](#-api-at-a-glance) ·
[Testing](#-testing) ·
[Docs](#-documentation)

</div>

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## ✨ What is Mobius?

Mobius runs the whole life of a subscription: **quotation → confirmation → activation → recurring invoices → payments → reports**. It handles multi-line quotations, product variants, GST, discount campaigns and four billing cadences (daily, weekly, monthly, yearly). It has three role-scoped experiences:

- an **admin console** to configure the catalogue, plans, taxes, discounts and staff,
- a **staff workspace** to run subscriptions, invoices and payments,
- a **customer portal** for self-service.

Billing systems usually fail in quiet ways. A server restart skips a billing date. A retried cron job sends the same invoice twice. Two checkouts take the last slot of a limited discount. Mobius guards against each of these with a **database constraint or an atomic statement**, not just application code. Each guarantee has an integration test against a real PostgreSQL database.

<table>
<tr>
<td width="33%" valign="top">

### 🛡️ Never bills twice
`UNIQUE (subscription_id, period_start)` plus `INSERT … ON CONFLICT DO NOTHING`. Re-runs and parallel runs cannot create a duplicate. The constraint makes it impossible.

</td>
<td width="33%" valign="top">

### ⏱️ Never skips a period
A catch-up loop bills **every** missed period up to the run date. If the server is down for a week, the next run creates every invoice it missed.

</td>
<td width="33%" valign="top">

### 🎟️ Never over-redeems
Discount slots are claimed with one conditional `UPDATE … WHERE used_count < usage_limit`. Two invoices cannot both take the last slot.

</td>
</tr>
</table>

<details>
<summary><b>📑 Table of contents</b></summary>

- [What is Mobius?](#-what-is-mobius)
- [Features by role](#-features-by-role)
- [Subscription lifecycle](#-subscription-lifecycle)
- [The billing engine](#-the-billing-engine)
- [Money, to the paisa](#-money-to-the-paisa)
- [Architecture](#-architecture)
- [Data model](#-data-model)
- [Security model](#-security-model)
- [API at a glance](#-api-at-a-glance)
- [Frontend](#-frontend)
- [Quick start](#-quick-start)
- [Configuration](#-configuration)
- [Scripts](#-scripts)
- [Testing](#-testing)
- [Performance](#-performance)
- [Project structure](#-project-structure)
- [Engineering rules](#-engineering-rules)
- [Known limitations](#-known-limitations)
- [Documentation](#-documentation)
- [Team](#-team)

</details>

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 👥 Features by role

| | 🛠️ Admin | 💼 Staff | 🙋 Customer |
| :--- | :---: | :---: | :---: |
| Manage staff accounts and roles | ✅ | | |
| Products, variants, taxes, plans | ✅ create & edit | 👁️ read | 👁️ read |
| Quotation templates | ✅ create & edit | 👁️ read | |
| Discount campaigns (limits, scopes, dates) | ✅ | 👁️ read | |
| Trigger a billing run · view run history | ✅ | | |
| Customers | ✅ | ✅ | |
| Build quotations and subscriptions | ✅ | ✅ | |
| Move subscriptions through the lifecycle | ✅ | ✅ | ⏸️ pause / resume / close *(if the plan allows it)* |
| Confirm, cancel, email invoices | ✅ | ✅ | |
| Record payments (UPI, card, bank, cash, cheque) | ✅ | ✅ | |
| Dashboard: MRR, revenue, overdue aging | ✅ | ✅ | |
| View own subscriptions, invoices, payments | | | ✅ |
| Print / download invoice PDF | ✅ | ✅ | ✅ *(own only)* |

> [!IMPORTANT]
> Every query a customer can reach is scoped by `customer_id = req.user.id`. If a customer requests another customer's row, the API returns **`404 Not Found`**, not `403`. This way the API never confirms that the row exists.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🔄 Subscription lifecycle

<div align="center">
<img src="docs/assets/lifecycle.svg" alt="Animated subscription state machine" width="100%"/>
</div>

Status changes go through **one** endpoint: `POST /subscriptions/:id/transition { action }`. A transition table in [`stateMachine.ts`](server/src/modules/subscriptions/stateMachine.ts) checks every change. No `PATCH` can set `status` directly.

| From | Allowed actions → To |
| :--- | :--- |
| `DRAFT` | `send_quote` → `QUOTATION` · `cancel` → `CLOSED` |
| `QUOTATION` | `confirm` → `CONFIRMED` · `revise` → `DRAFT` · `cancel` → `CLOSED` |
| `CONFIRMED` | `activate` → `ACTIVE` |
| `ACTIVE` | `pause` → `PAUSED` · `close` → `CLOSED` · `renew` → `ACTIVE` |
| `PAUSED` | `resume` → `ACTIVE` · `close` → `CLOSED` |
| `CLOSED` | *(terminal)* |

The UI shows only the actions in **state machine ∩ plan flags ∩ role**:

- `pause` needs `is_pausable`; `close` needs `is_closable`.
- `renew` needs `is_renewable` *and* an expiry date.
- Customers only get `pause`, `resume` and `close`.

Every transition is written to `subscription_status_history`. Plans with `auto_close` are closed by the billing run once `expiry_date` has passed.

> [!TIP]
> **Pausing shifts the billing anchor.** If a subscription pauses for 10 days in January, its later periods run from the 11th to the 11th, not the 1st to the 1st. The customer is never billed for paused days, and no period is lost ([migration `0003_billing_anchor`](server/prisma/migrations/0003_billing_anchor/migration.sql)).

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## ⚙️ The billing engine

<div align="center">
<img src="docs/assets/billing-flow.svg" alt="Animated billing engine pipeline" width="100%"/>
</div>

[`runBilling(runDate)`](server/src/modules/billing/engine.ts) is the **only** code path that inserts invoices. It runs daily from a `node-cron` scheduler (`BILLING_CRON`, default `5 0 * * *`). Admins can also start it with `POST /billing/run`.

```sql
-- ① each subscription is billed in its own transaction; a concurrent run skips it instead of waiting
SELECT s.*, p.billing_period FROM subscriptions s JOIN plans p ON p.id = s.plan_id
WHERE s.id = $1 AND s.status = 'ACTIVE' FOR UPDATE OF s SKIP LOCKED;

-- ② the invoice header: a second insert for the same period is a no-op, not an error
INSERT INTO invoices (subscription_id, period_start, ...) VALUES (...)
ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING RETURNING id;

-- ③ claim a discount slot atomically: 1 row = claimed, 0 rows = someone got the last one
UPDATE discounts SET used_count = used_count + 1
WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit);
```

<details>
<summary><b>🔍 Why each step is safe (click to expand)</b></summary>

<br/>

| Concern | Mechanism | Proven by |
| :--- | :--- | :--- |
| **Duplicate invoices** | `uq_invoice_period UNIQUE (subscription_id, period_start)` + `ON CONFLICT DO NOTHING` | `billing.test.ts` #3: two runs, same date → exactly 1 invoice |
| **Parallel runs** | Row lock `FOR UPDATE … SKIP LOCKED` per subscription, one transaction each | `billing.test.ts` #4: two runs in parallel → 1 invoice, 1 discount use |
| **Missed days** | `while (periodStart <= runDate)` loop from `next_billing_date` | `billing.test.ts` #5: billing date 3 months back → 3 consecutive invoices |
| **Discount races** | Conditional `UPDATE`, claimed in ascending id order so two runs can't deadlock. A lost claim re-runs selection without that discount | `billing.test.ts` #9: discount at 99/100, two subs at once → `used_count = 100` |
| **Unused claims** | A slot claimed but no longer chosen is released in the same transaction | engine `releaseSlot()` |
| **Wrong totals** | `CHECK (total = subtotal - discount_total + tax_total)` on invoices **and** each line | DB constraint |
| **"Overdue" drift** | Never stored. Computed in SQL: `CONFIRMED AND CURRENT_DATE > due_date AND amount_paid < total` | `reports.test.ts`, `payments.test.ts` |
| **Expired plans** | `autoClose()` closes `ACTIVE` subs past `expiry_date` when the plan has `auto_close`, and logs history | `billing.test.ts` #12 |

</details>

**Discount selection** has one implementation, [`discount.eligibility.ts`](server/src/modules/discounts/discount.eligibility.ts). The live price preview and the engine both use it, so a quote always matches its invoice:

1. **Product scope:** each line gets its single best eligible discount. Discounts do not stack.
2. **Subscription scope:** one discount covers the lines left without a product discount.
   - A `PERCENTAGE` discount applies to each of those lines.
   - A `FIXED` discount is split across them by subtotal, and the rounding remainder goes on the last line.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 💰 Money, to the paisa

Money is **never** a JavaScript `number` on the server. All arithmetic uses `decimal.js`. Each line is rounded **half-up to 2 places** in a fixed order. The API returns money as strings, and the client only displays them.

```
subtotal → discount → tax (on the discounted amount) → total
```

**Worked example:** 5 seats of *CRM Pro (Odoo)* at ₹1,560, with a 10% discount and GST 18%:

| Step | Formula | Amount |
| :--- | :--- | ---: |
| Subtotal | 1,560.00 × 5 | **₹7,800.00** |
| Discount | 10% of 7,800.00 | − ₹780.00 |
| Taxable | 7,800.00 − 780.00 | ₹7,020.00 |
| GST 18% | 18% of 7,020.00 | + ₹1,263.60 |
| **Line total** | 7,020.00 + 1,263.60 | **₹8,283.60** |

The same numbers appear in the comment on `priceLine()` in [`pricing.ts`](server/src/modules/billing/pricing.ts) and in `pricing.test.ts`.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🏗️ Architecture

Mobius is a **modular monolith**. Each business domain is a folder of `routes → controller → service`, and PostgreSQL holds the invariants.

```mermaid
flowchart LR
    subgraph Client["🖥️ React SPA (Vite)"]
        A1["/app — Admin & Staff console"]
        A2["/portal — Customer portal"]
    end

    subgraph API["⚙️ Express API · /api/v1"]
        MW["helmet · cors · rate-limit<br/>auth (JWT) · requireRole · zod validate"]
        subgraph Modules
            M1[auth · users · customers]
            M2[catalog · plans · quotations]
            M3[subscriptions + stateMachine]
            M4[discounts]
            M5[billing engine · invoices]
            M6[payments · reports]
        end
        CRON["⏰ node-cron scheduler"]
    end

    subgraph Infra
        PG[("🐘 PostgreSQL 16<br/>constraints · CHECKs · indexes")]
        PDF["🖨️ Puppeteer PDF"]
        SMTP["✉️ SMTP / Nodemailer"]
    end

    A1 & A2 -->|"axios + Bearer token<br/>HttpOnly refresh cookie"| MW --> Modules
    CRON -->|runBilling| M5
    Modules -->|Prisma + raw SQL| PG
    M5 --> PDF
    M5 --> SMTP
```

<details>
<summary><b>🔐 Request lifecycle: login, silent refresh and a scoped query</b></summary>

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant API as Express API
    participant DB as PostgreSQL

    B->>API: POST /auth/login {email, password}
    API->>DB: find user · bcrypt.compare (cost 12)
    API-->>B: { accessToken (15 min, kept in memory) } + Set-Cookie rt (HttpOnly, 7 d)
    B->>API: GET /invoices  (Authorization: Bearer …)
    API->>API: auth → requireRole(ADMIN, STAFF, CUSTOMER)
    API->>DB: SELECT … WHERE customer_id = :me  LIMIT 25
    API-->>B: { data, page, pageSize, total }
    Note over B,API: 15 minutes later the access token expires
    B->>API: any request → 401
    B->>API: POST /auth/refresh (cookie)
    API->>DB: rotate refresh token (30 s grace for parallel tabs)
    API-->>B: new accessToken + rotated cookie → original request retried
```

</details>

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🗄️ Data model

The schema has 20 tables and 8 enums, defined in [`0001_init/migration.sql`](server/prisma/migrations/0001_init/migration.sql). Later changes come only as new migrations (`0002_db_timezone`, `0003_billing_anchor`). The core of it:

```mermaid
erDiagram
    users ||--o{ subscriptions : "customer"
    plans ||--o{ subscriptions : "billed by"
    subscriptions ||--|{ subscription_lines : has
    subscriptions ||--o{ subscription_status_history : logs
    products ||--o{ product_variants : has
    products ||--o{ subscription_lines : "priced in"
    taxes ||--o{ subscription_lines : "applies to"
    subscriptions ||--o{ invoices : "UNIQUE(subscription_id, period_start)"
    invoices ||--|{ invoice_lines : has
    invoices ||--o{ payments : receives
    discounts ||--o{ discount_redemptions : "used_count ≤ usage_limit"
    invoices ||--o{ discount_redemptions : records
    discounts ||--o{ discount_products : "PRODUCT scope"
    discounts ||--o{ discount_subscriptions : "SUBSCRIPTION scope"
    billing_runs }o--|| users : "triggered_by"

    subscriptions {
        bigint id PK
        text number "SUB-000001"
        enum status
        date start_date
        date billing_anchor
        date next_billing_date
        date expiry_date
    }
    invoices {
        bigint id PK
        text number "INV-000001"
        enum status "DRAFT CONFIRMED PAID CANCELLED"
        date period_start
        date period_end
        numeric total "CHECK = sub - disc + tax"
        numeric amount_paid
    }
    discounts {
        bigint id PK
        enum type "FIXED PERCENTAGE"
        enum scope "PRODUCT SUBSCRIPTION"
        int usage_limit
        int used_count
    }
```

**Constraints that carry the business rules:**

- `uq_invoice_period`: one invoice per subscription per period.
- `CHECK (total = subtotal - discount_total + tax_total)`, on both invoices and invoice lines.
- `CHECK (usage_limit IS NULL OR used_count <= usage_limit)`.
- `CHECK (type <> 'PERCENTAGE' OR value <= 100)`.
- Non-negative checks on prices, payments and amounts paid; `due_date >= invoice_date`; `period_end > period_start`.
- Human-readable numbers (`SUB-000123`, `INV-000456`) come from Postgres sequences.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🔒 Security model

| Layer | What Mobius does |
| :--- | :--- |
| **Passwords** | bcrypt, cost 12. Rule: ≥ 9 characters with lowercase, uppercase and a special character. The rule is enforced on the server and mirrored in the sign-up form. |
| **Tokens** | 15-minute JWT access token, **kept in memory, never in `localStorage`**. 7-day refresh token in an **HttpOnly cookie**, rotated on every use, with reuse detection and a 30 s grace period for parallel tabs. |
| **Roles** | `ADMIN`, `STAFF`, `CUSTOMER`. A role is **never read from a request body**: sign-up always creates a `CUSTOMER`, and only an admin creates staff. |
| **Authorisation** | Every route declares `auth` + `requireRole(...)`. Customer queries are scoped by `customer_id`. Another customer's data returns `404`. |
| **Abuse** | `express-rate-limit` on login, forgot-password and reset-password (`AUTH_RATE_LIMIT`, 5/min in production). `helmet` headers and strict CORS. |
| **Config** | Environment variables are validated with Zod at boot. In production the server **refuses to start** if a JWT secret is shorter than 32 characters or still contains `change-me`. |
| **Serialisation** | BigInt IDs and Decimal money are serialised as strings. Nothing loses precision on the way to the browser. |

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🌐 API at a glance

REST under **`/api/v1`**. The API has **66 operations across 14 modules**. Every list endpoint is paginated on the server (`page`, `pageSize`, default 25, max 100). Errors share one shape: `{ error: { code, message, details } }`.

<details>
<summary><b>📜 Full endpoint list</b></summary>

<br/>

| Module | Endpoints | Roles |
| :--- | :--- | :--- |
| **Auth** | `POST /auth/signup` · `/auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/forgot-password` · `/auth/reset-password` | public / cookie |
| **Me** | `GET /me` · `PATCH /me` | any |
| **Users** | `GET /users` · `POST /users` · `PATCH /users/:id` | admin |
| **Customers** | `GET /customers` · `POST /customers` · `GET /customers/:id` · `PATCH /customers/:id` | admin, staff |
| **Taxes** | `GET /taxes` · `POST /taxes` · `PATCH /taxes/:id` · `DELETE /taxes/:id` | read: all · write: admin |
| **Products** | `GET /products` · `POST /products` · `GET/PATCH/DELETE /products/:id` | read: all · write: admin |
| **Variants** | `POST /products/:id/variants` · `PATCH /variants/:id` · `DELETE /variants/:id` | admin |
| **Plans** | `GET /plans` · `POST /plans` · `GET/PATCH /plans/:id` | read: all · write: admin |
| **Quotation templates** | `GET/POST /quotation-templates` · `GET/PATCH/DELETE /quotation-templates/:id` | read: team · write: admin |
| **Subscriptions** | `GET/POST /subscriptions` · `GET/PATCH /subscriptions/:id` · `POST /subscriptions/:id/lines` · `PATCH/DELETE /subscriptions/:id/lines/:lineId` · `POST /subscriptions/:id/transition` · `GET /subscriptions/:id/history` | team (customers: own, read + transition) |
| **Discounts** | `GET/POST /discounts` · `GET/PATCH /discounts/:id` | read: team · write: admin |
| **Billing** | `POST /billing/run` · `GET /billing/runs` · `POST /subscriptions/:id/invoice` | admin (bill-one: team) |
| **Invoices** | `GET /invoices` · `GET /invoices/:id` · `POST /invoices/:id/confirm` · `/cancel` · `/send` · `POST /invoices/bulk-confirm` · `GET /invoices/:id/print` · `GET /invoices/:id/pdf` | team (customers: own, read + print/pdf) |
| **Payments** | `GET /payments` · `POST /invoices/:id/payments` | read: all (scoped) · write: team |
| **Reports** | `GET /reports/summary` · `/revenue` · `/overdue` · `/subscriptions-by-plan` | team |

</details>

📂 [`docs/api-samples/`](docs/api-samples/) holds **real JSON responses** captured from the running API, one file per endpoint plus every error shape (400 / 401 / 403 / 404 / 409 / 429). JWTs are redacted.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🖥️ Frontend

A React 18 + Vite single-page app in [`client/`](client/), written in plain JavaScript. It uses MUI + MUI X DataGrid, TanStack Query, react-hook-form + zod, Recharts, Tailwind and framer-motion.

| Area | Routes |
| :--- | :--- |
| **Auth** | `/login` · `/signup` (live password checklist) · `/forgot-password` · `/reset-password` |
| **Console** (`/app`) | dashboard · customers · subscriptions (list / create / detail with timeline) · invoices · payments · products · plans · templates · discounts |
| **Admin-only** | taxes · users · billing runs · create/edit forms for catalogue, plans, templates, discounts |
| **Portal** (`/portal`) | my subscriptions · my invoices (detail, print, PDF) · profile |

- **No money maths in the browser.** `<Money>` only formats the decimal strings the API returns.
- **Silent refresh.** An axios interceptor catches a `401`, calls `/auth/refresh` once and replays the request.
- **Offline demo mode.** Set `VITE_USE_MOCKS=true` and the app runs against [MSW](https://mswjs.io/) handlers, with no backend needed.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🚀 Quick start

**Prerequisites:** Docker + Docker Compose, Node.js ≥ 20, npm.

**1. Start PostgreSQL** (dev on `:5432`, test on `:5433`, both on `Asia/Kolkata` time):

```bash
docker compose up -d
```

**2. Install the API:**

```bash
cd server && cp .env.example .env && npm ci
```

**3. Apply migrations and seed demo data:**

```bash
npm run db:migrate && npm run db:seed
```

**4. Run the API** on http://localhost:4000/api/v1:

```bash
npm run dev
```

**5. In a second terminal, run the web app** on http://localhost:5173 (Vite proxies `/api` to `:4000`):

```bash
cd client && cp .env.example .env && npm ci && npm run dev
```

> [!NOTE]
> Want the big dataset? `npm run demo:reset` loads **500 customers, 5,000 subscriptions and ~6 months of billing history (~27,700 invoices)**. Then `npm run demo:check` smoke-tests health, logins, report latency, PDF rendering and SMTP.

### 🔑 Demo logins

All accounts use the password **`Demo@12345`**.

| Role | Email | Who |
| :--- | :--- | :--- |
| 🛠️ Admin | `admin@brightloop.test` | Brightloop Software admin |
| 💼 Staff | `staff@brightloop.test` | Karan Mehta, operations |
| 🙋 Customer | `customer@acme.test` | Acme Operations Pvt Ltd |
| 🙋 Customer | `customer2@globex.test` | Globex India LLP (multi-line subscription) |

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🔧 Configuration

The server reads `server/.env`, which is validated with Zod at startup.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://app:app@localhost:5432/subs` | Main database |
| `TEST_DATABASE_URL` | `postgresql://app:app@localhost:5433/subs_test` | Test database (Vitest) |
| `PORT` | `4000` | API port |
| `TZ` | `UTC` | Node runs in UTC. Business dates are computed in IST. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `change-me-…` | **Must** be ≥ 32 characters and not contain `change-me` in production |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_DAYS` | `15m` / `7` | Token lifetimes |
| `APP_URL` | `http://localhost:5173` | Used in password-reset links |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | Mailtrap sandbox | Invoice emails. If `SMTP_USER` is empty, emails are logged to stdout. |
| `AUTO_CONFIRM_INVOICES` | `false` | Create invoices as `CONFIRMED` instead of `DRAFT` |
| `BILLING_CRON` | `5 0 * * *` | When the daily billing run fires |
| `ENABLE_SCHEDULER` | `false` (dev) | Run the cron in this process. Defaults to on in production. |
| `AUTH_RATE_LIMIT` | `5` | Auth requests per minute per IP |

The client reads `client/.env`: `VITE_API_BASE` (default `/api/v1`) and `VITE_USE_MOCKS`.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 📜 Scripts

All scripts run from `server/`.

| Command | What it does |
| :--- | :--- |
| `npm run dev` | API with hot reload (`tsx watch`, `TZ=UTC`) |
| `npm run build` / `npm start` | Compile TypeScript to `dist/` / run the build |
| `npm test` / `npm run test:watch` | Vitest + Supertest against the real test database |
| `npm run db:migrate` | `prisma migrate deploy` (0001 → 0003) |
| `npm run db:seed` / `npm run db:seed:big` | Small demo seed / 5,000-subscription seed |
| `npm run demo:reset` | Big seed plus a cheat-sheet for the live demo |
| `npm run demo:check` | Pre-demo smoke test |

Client (`client/`): `npm run dev` · `npm run build` · `npm run preview`.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🧪 Testing

**97 integration tests in 10 files** run against a **real PostgreSQL** database. Billing tests never mock the database. CI ([`server-ci.yml`](.github/workflows/server-ci.yml)) builds and tests every push and pull request to `main`, using a Postgres 16 service container.

```bash
cd server && npm test
```

| Suite | Tests | What it proves |
| :--- | ---: | :--- |
| `auth-rbac.test.ts` | 21 | Tenant isolation (404), staff limits (403), password rule, case-insensitive unique emails, refresh rotation with 30 s grace and theft detection, reset-password flow |
| `subscriptions.test.ts` | 17 | Full quote → active flow with history, illegal jumps → `400 INVALID_TRANSITION`, plan flags, pause/resume date shift, renew, `PATCH` can't set status |
| `billing.test.ts` | 16 | Idempotent re-runs, parallel runs, multi-period catch-up, month-end dates (31 Jan → 28 Feb), pause anchor shift, discount at 99/100, auto-close, preview = invoice |
| `payments.test.ts` | 10 | Partial payments, auto-`PAID`, overpayment rejected, concurrent payments can't double-spend a balance, no payments on `DRAFT`, no future dates |
| `catalog.test.ts` | 8 | Taxes, products, variants, plans and templates: validation, duplicates → 409, admin-only writes, customer visibility, IST dates |
| `env.test.ts` | 6 | Production refuses weak or default JWT secrets |
| `invoice-docs.test.ts` | 6 | Owner-scoped HTML print, `OVERDUE` stamp, PDF → 503 fallback to `/print`, email only for confirmed invoices |
| `pricing.test.ts` | 5 | The ₹8,283.60 example, half-up rounding, fixed discount capped at the subtotal, ₹500 split remainder, IST date boundary |
| `reports.test.ts`, `payments.test.ts` | 5 | Summary cards, MRR normalised per month, revenue with empty months as 0.00, overdue list, customers blocked |
| `health.test.ts` | 3 | Health check, unknown route → 404, malformed JSON → 400 |

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## ⚡ Performance

Measured on the big seed (**500 customers · 5,000 subscriptions · 27,746 invoices · 28,000+ payments**) with [`scripts/explain.sql`](server/scripts/explain.sql) and `pino-http` response-time logs:

| Query / endpoint | Result | Index used |
| :--- | ---: | :--- |
| Dashboard summary cards (SQL) | < 10 ms | `idx_invoices_status_due`, `idx_payments_paid_on` |
| MRR by plan (SQL) | < 8 ms | `plans ⋈ subscriptions` |
| Overdue list (SQL) | < 4 ms | `idx_invoices_status_due` |
| Invoice list, page 1 → 100 (SQL) | < 6 ms | `idx_invoices_date` |
| `GET /reports/summary` (HTTP) | ~25–40 ms local | well under the 2 s requirement |

Every report total is computed **inside PostgreSQL**; Node only formats the result. There are no N+1 queries and no caching layer.

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 📁 Project structure

```text
Mobius/
├── client/                      # React + Vite SPA (JavaScript)
│   └── src/
│       ├── api/                 # axios instance, silent refresh, TanStack Query client
│       ├── auth/                # AuthContext, ProtectedRoute, password rules
│       ├── components/          # DataTable, Money, StatusChip, StatCard, dialogs…
│       ├── layouts/             # AppLayout (console), PortalLayout, AuthLayout
│       ├── pages/               # one folder per domain (dashboard, subscriptions, invoices…)
│       └── mocks/               # MSW handlers for offline demo mode
├── server/                      # Express + TypeScript API
│   ├── prisma/
│   │   ├── migrations/          # 0001_init (schema.sql) · 0002_db_timezone · 0003_billing_anchor
│   │   ├── seed.ts · seed-big.ts
│   ├── src/
│   │   ├── modules/             # auth · users · customers · catalog · plans · quotations
│   │   │                        # subscriptions · discounts · billing · payments · reports
│   │   ├── middleware/          # auth, requireRole, validate, errorHandler
│   │   ├── lib/                 # money, dates, pagination, serialize, pdf, mailer, logger
│   │   ├── jobs/scheduler.ts    # daily billing cron
│   │   └── app.ts · routes.ts · server.ts
│   ├── scripts/                 # demo-reset, demo-check, explain.sql, API sample generator
│   └── tests/                   # 10 Vitest suites + factories
├── docs/                        # spec, blueprints, API contract, demo runbook, samples
└── docker-compose.yml           # Postgres 16 (dev :5432, test :5433)
```

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 📏 Engineering rules

These rules are non-negotiable. They are written down in [`AGENTS.md`](AGENTS.md) and enforced in code review.

1. **Money is never a JS `number`** on the server. Use Decimal, half-up, 2 places per line.
2. **Migrations are append-only.** Never edit `0001_init`. Constraints are never weakened.
3. **Invoices are created only by the billing engine**, using `ON CONFLICT … DO NOTHING`, never check-then-insert.
4. **Discount usage is a conditional `UPDATE`**, never read-then-write.
5. **Status changes only go through the state machine.**
6. **Every route has `auth` + `requireRole`.** Every customer query is scoped by `customer_id`.
7. **Every list is paginated on the server.** No N+1 queries.
8. **The client never does money arithmetic.**

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🚧 Known limitations

These are deliberate trade-offs, explained in [`BILLING_EXPLAINED.md`](docs/BILLING_EXPLAINED.md#part-3-accepted-system-limitations--rationale):

- **Deactivating a user takes up to 15 minutes to apply.** The access token is a stateless JWT and stays valid until it expires.
- **Cancelling an invoice does not give back its discount slot.** This stops anyone from farming promo quotas by creating and cancelling invoices.
- **Emails go to stdout until SMTP is configured.** This keeps CI and offline demos working.
- **`expiry_date` is the last day of service, inclusive.** Auto-close happens on the following day (IST).

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 📚 Documentation

| Document | What's inside |
| :--- | :--- |
| [`BUILD_PLAN.md`](docs/BUILD_PLAN.md) | Master product spec and phased plan |
| [`BACKEND_BLUEPRINT.md`](docs/BACKEND_BLUEPRINT.md) | Backend architecture, data rules, billing algorithm |
| [`FRONTEND_BLUEPRINT.md`](docs/FRONTEND_BLUEPRINT.md) | Screen-by-screen UI spec |
| [`API_CONTRACT.md`](docs/API_CONTRACT.md) | Endpoint contract: payloads, status codes, filters |
| [`BILLING_EXPLAINED.md`](docs/BILLING_EXPLAINED.md) | Line-by-line walkthrough of `engine.ts` plus 10 architecture Q&As |
| [`DEMO.md`](docs/DEMO.md) | 8-minute demo runbook: checklist, 9-step script, contingencies |
| [`HANDOFF.md`](docs/HANDOFF.md) | Current state, decisions and review notes |
| [`api-samples/`](docs/api-samples/) | Real captured responses for every endpoint and error |

<img src="docs/assets/divider.svg" width="100%" alt=""/>

## 🤝 Team

| | Area |
| :--- | :--- |
| **Aditya Singh** ([@Aditya2514](https://github.com/Aditya2514)) | Backend: API, billing engine, database, tests, CI |
| **Apurva Patil** | Frontend: React client |

<div align="center">
<br/>
<sub>Built with Decimal precision and database constraints, because billing should never depend on luck.</sub>
<br/><br/>
<a href="#-what-is-mobius">⬆ back to top</a>
</div>

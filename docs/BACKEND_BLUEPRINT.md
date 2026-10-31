# Backend Blueprint — Subscription Management System

Oct 31, 2026 · @Aditya

## 1. Your role

You own everything under server/: the PostgreSQL database, every API endpoint, the role checks, the billing engine, discounts, payments, reports and the 20 automated tests. The frontend person builds the screens against your API contract (section 5). Your code decides whether the app is correct; theirs decides whether it looks finished.

**The project in one paragraph.** Brightloop Software sells software on subscription. Today it tracks subscriptions in a spreadsheet, types invoices by hand, matches payments against bank statements and builds revenue reports manually. We build one web app that runs the whole month: an admin sets up products, plans, taxes and discounts; staff turn quotations into subscriptions; invoices are generated automatically on billing day; payments are recorded against invoices; and finance sees active subscriptions, revenue, outstanding and overdue amounts on one dashboard. Customers log in to a portal and see only their own subscriptions and invoices.

**Non-negotiables from the problem statement (you are responsible for all of them)**

- No invoice billed twice, no billing period skipped.
- Three roles: Admin (everything), Internal staff (day-to-day work, limited), Customer (own data only). Only Admin creates staff and discounts.
- One account per email; password more than 8 characters with uppercase, lowercase and a special character; reset link by email.
- Taxes calculated automatically from admin rules; discounts applied automatically and stopped when expired or used up.
- Every page responds in under 2 seconds with thousands of subscriptions.

**What you own vs. what you don't**

| You own | The frontend person owns | Shared |
| --- | --- | --- |
| server/ (all code), database schema and migrations, seed script, billing engine, scheduler, all tests, invoice PDF rendering (Puppeteer), emails | client/ (all screens), MSW mocks, invoice PDF HTML design, demo-looking seed data list, README, demo script | docker-compose, AGENTS.md, docs/API\_CONTRACT.md, the four sync points |

**What the frontend needs from you, and by when**

| By hour | Deliver | Why they need it |
| --- | --- | --- |
| 2 | Agreed API\_CONTRACT.md (written together) | They build every screen against it with mocks |
| 10 | Auth, users, customers, catalog, plans, taxes endpoints live | Sync 1: they switch login and catalog to the real API |
| 20 | Subscriptions, transitions, discounts, billing run, invoice created | Sync 2: the full chain must work end to end |
| 28 | Invoices, payments, reports, seeded 5,000 subscriptions | Sync 3: feature freeze, mocks removed |

**Decisions already made (don't reopen them mid-build)**

| Open point in the PDF | Decision |
| --- | --- |
| Partial payments | Allowed; invoice is Paid when total paid ≥ total |
| Tax vs discount | Discount first, tax on the discounted amount |
| Stacking discounts | No; best single eligible discount per line |
| Overdue | Derived: Confirmed + unpaid + due date before today; never stored |
| Paused subscription | Not billed; next billing date pushed forward on resume |
| Billing timing | In advance, on the period start date |
| Payment terms | Days; due date = invoice date + terms |
| New invoices | Created as DRAFT; staff confirm (or AUTO\_CONFIRM\_INVOICES=true) |
| Money | NUMERIC(12,2) in the DB, decimal.js in Node, never JS number |
| Currency | INR only |

## 2. Stack and setup

Node 20 + TypeScript + Express + Prisma on PostgreSQL 15+, with Zod for validation, decimal.js for money and Vitest for tests. Setup takes about 30 minutes, and you do it with the frontend person in hours 0–2.

| Layer | Choice | Package(s) |
| --- | --- | --- |
| Runtime | Node 20 LTS + TypeScript | typescript, tsx (dev runner) |
| HTTP | Express 4 | express, cors, cookie-parser, helmet, express-rate-limit |
| Database | PostgreSQL 15+ in Docker | — |
| ORM | Prisma (raw SQL for locks, counters, ON CONFLICT) | prisma, @prisma/client |
| Validation | Zod | zod |
| Auth | JWT + bcrypt | jsonwebtoken, bcrypt |
| Money | decimal.js | decimal.js |
| Dates | date-fns | date-fns |
| Scheduler | node-cron | node-cron |
| Email | Nodemailer (Mailtrap in demo) | nodemailer |
| PDF | Puppeteer | puppeteer |
| Logging | pino | pino, pino-http |
| Tests | Vitest + Supertest | vitest, supertest |
| Seed data | Faker | @faker-js/faker |

**docker-compose.yml (repo root)**

```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: subs }
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
  db_test:
    image: postgres:16
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: subs_test }
    ports: ["5433:5432"]
volumes: { pgdata: {} }
```

**Setup commands**

```bash
docker compose up -d
mkdir server && cd server && npm init -y
npm i express cors cookie-parser helmet express-rate-limit zod jsonwebtoken bcrypt \
      decimal.js date-fns node-cron nodemailer puppeteer pino pino-http @prisma/client
npm i -D typescript tsx prisma vitest supertest @faker-js/faker \
      @types/node @types/express @types/jsonwebtoken @types/bcrypt @types/cookie-parser \
      @types/supertest @types/nodemailer @types/node-cron
npx tsc --init
npx prisma init
# put schema.sql at prisma/migrations/0001_init/migration.sql, then:
npx prisma migrate deploy
npx prisma db pull        # generates schema.prisma from the real tables
npx prisma generate
```

**server/.env.example**

```bash
DATABASE_URL=postgresql://app:app@localhost:5432/subs
TEST_DATABASE_URL=postgresql://app:app@localhost:5433/subs_test
PORT=4000
TZ=UTC
JWT_ACCESS_SECRET=change-me-long-random
JWT_REFRESH_SECRET=change-me-another-long-random
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_DAYS=7
APP_URL=http://localhost:5173          # used in reset-password links
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Billing <billing@brightloop.test>"
AUTO_CONFIRM_INVOICES=false
BILLING_CRON=5 0 * * *
```

**package.json scripts**

```json
{
  "scripts": {
    "dev": "cross-env TZ=UTC tsx watch src/server.ts",
    "build": "tsc -p .",
    "start": "cross-env TZ=UTC node dist/server.js",
    "db:migrate": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts",
    "db:seed:big": "cross-env SEED_SIZE=big tsx prisma/seed.ts",
    "test": "cross-env TZ=UTC vitest run",
    "test:watch": "cross-env TZ=UTC vitest"
  }
}
```

Install cross-env as a dev dependency (npm i -D cross-env) so these scripts also work in Windows terminals.

**Server runs on port 4000.** The frontend's Vite dev server (port 5173) proxies /api to it, so cookies work without CORS issues in development. Keep cors() configured with origin: APP\_URL and credentials: true for any other setup.

## 3. Folder structure (server/)

Every module folder has the same four files, so you and the AI agent always know where code goes: routes (URLs + middleware), controller (parse request, call service, send response), service (business rules + database), schema (Zod). Only services touch Prisma.

```text
server/
├─ package.json  tsconfig.json  .env  .env.example  vitest.config.ts
├─ prisma/
│  ├─ schema.prisma                 # generated by `prisma db pull`; don't hand-edit models
│  ├─ migrations/0001_init/migration.sql   # = schema.sql (never edit; add 0002_... instead)
│  └─ seed.ts                       # demo accounts + catalog; SEED_SIZE=big → 5,000 subs
├─ src/
│  ├─ server.ts                     # start HTTP server + scheduler
│  ├─ app.ts                        # express(), helmet, cors, cookieParser, json, pino-http, routes, errorHandler
│  ├─ routes.ts                     # mounts every module router under /api/v1
│  ├─ config/env.ts                 # Zod-validated process.env; crash on missing vars
│  ├─ lib/
│  │  ├─ prisma.ts                  # single PrismaClient
│  │  ├─ money.ts                   # Decimal setup (ROUND_HALF_UP), r2(), toMoneyString()
│  │  ├─ dates.ts                   # addPeriods(), nextBoundary(), toISODate()
│  │  ├─ serialize.ts               # BigInt → string, Decimal → "0.00", snake_case → camelCase
│  │  ├─ pagination.ts              # parse ?page&pageSize&sort → { skip, take, orderBy }
│  │  ├─ mailer.ts                  # nodemailer transport + sendMail()
│  │  ├─ pdf.ts                     # renderInvoicePdf(html) with Puppeteer
│  │  └─ errors.ts                  # AppError(status, code, message, details)
│  ├─ middleware/
│  │  ├─ auth.ts                    # verify access JWT → req.user = { id, role }
│  │  ├─ requireRole.ts             # requireRole('ADMIN','STAFF')
│  │  ├─ validate.ts                # validate({ body, query, params }) with Zod
│  │  └─ errorHandler.ts            # AppError / ZodError / Prisma errors → { error: {...} }
│  ├─ modules/
│  │  ├─ auth/        auth.routes.ts auth.controller.ts auth.service.ts auth.schema.ts
│  │  ├─ users/       (staff management, /me)
│  │  ├─ customers/
│  │  ├─ catalog/     products.*.ts variants.*.ts taxes.*.ts
│  │  ├─ plans/
│  │  ├─ quotations/  (quotation templates + lines)
│  │  ├─ subscriptions/  + stateMachine.ts
│  │  ├─ discounts/   + discount.eligibility.ts (eligibleDiscounts)
│  │  ├─ billing/     engine.ts pricing.ts invoice.service.ts invoice.routes.ts invoice.controller.ts invoice.schema.ts invoice.template.html
│  │  ├─ payments/
│  │  └─ reports/
│  └─ jobs/scheduler.ts             # node-cron: runBilling daily (also does auto-close)
└─ tests/
   ├─ helpers/db.ts                 # truncate all tables between tests (TRUNCATE ... RESTART IDENTITY CASCADE)
   ├─ helpers/factories.ts          # makeAdmin(), makeCustomer(), makePlan(), makeActiveSub()
   ├─ pricing.test.ts               # pure unit tests (no DB)
   ├─ billing.test.ts               # engine tests on real test DB
   ├─ payments.test.ts
   ├─ subscriptions.test.ts         # state machine
   └─ auth-rbac.test.ts
```

**Layer rules**

| Layer | May do | Must not do |
| --- | --- | --- |
| routes | Declare URL, auth, requireRole, validate | Any logic |
| controller | Read req, call one service, serialize, send status | Touch Prisma, compute money |
| service | Business rules, transactions, Prisma, raw SQL | Read req/res |
| lib | Pure helpers | Import from modules |

**Example module wiring (copy this shape everywhere)**

```ts
// src/modules/payments/payment.routes.ts
const r = Router();
r.get('/payments', auth, requireRole('ADMIN', 'STAFF', 'CUSTOMER'),
      validate({ query: listPaymentsQuery }), ctrl.list);
r.post('/invoices/:id/payments', auth, requireRole('ADMIN', 'STAFF'),
       validate({ params: idParam, body: recordPaymentBody }), ctrl.record);
export default r;

// src/modules/payments/payment.controller.ts
export const record = async (req, res) => {
  const payment = await svc.recordPayment(BigInt(req.params.id), req.body, req.user);
  res.status(201).json(serialize(payment));
};
```

## 4. Database

The schema is the file schema.sql: 20 tables, 8 enums, 11 indexes and one view, already tested on PostgreSQL 16. Use it unchanged as prisma/migrations/0001\_init/migration.sql. Any later change goes in a new migration (0002\_...), never an edit to 0001.

**Enums:** user\_role (ADMIN, STAFF, CUSTOMER) · product\_type (SERVICE, GOODS, ADDON) · billing\_period (DAILY, WEEKLY, MONTHLY, YEARLY) · subscription\_status (DRAFT, QUOTATION, CONFIRMED, ACTIVE, PAUSED, CLOSED) · invoice\_status (DRAFT, CONFIRMED, PAID, CANCELLED) · discount\_type (FIXED, PERCENTAGE) · discount\_scope (PRODUCT, SUBSCRIPTION) · payment\_method (CASH, BANK\_TRANSFER, UPI, CARD, CHEQUE, OTHER).

| Table | Key columns | Constraint that matters |
| --- | --- | --- |
| users | email (CITEXT), password\_hash, full\_name, role, company\_name, address, gstin, is\_active, created\_by | email UNIQUE, case-insensitive |
| password\_reset\_tokens | user\_id, token\_hash, expires\_at, used\_at | token\_hash UNIQUE |
| refresh\_tokens | user\_id, token\_hash, expires\_at, revoked\_at | token\_hash UNIQUE |
| taxes | name, rate, is\_active | rate 0–100 |
| products | name, type, sales\_price, cost\_price, default\_tax\_id, notes | prices ≥ 0 |
| product\_variants | product\_id, attribute, value, extra\_price | UNIQUE (product\_id, attribute, value) |
| plans | price, billing\_period, min\_quantity, available\_from/to, auto\_close, is\_closable, is\_pausable, is\_renewable | available\_to ≥ available\_from |
| quotation\_templates | plan\_id, validity\_days, payment\_terms\_days | validity\_days > 0 |
| quotation\_template\_lines | template\_id, product\_id, variant\_id, quantity, unit\_price, tax\_id | quantity > 0 |
| subscriptions | number (SUB-000001), customer\_id, plan\_id, template\_id, status, start\_date, expiry\_date, quotation\_valid\_until, payment\_terms\_days, next\_billing\_date, paused\_at, closed\_at | number UNIQUE; expiry ≥ start |
| subscription\_lines | subscription\_id, product\_id, variant\_id, quantity, unit\_price, tax\_id | unit\_price includes the variant extra |
| subscription\_status\_history | subscription\_id, from\_status, to\_status, changed\_by, changed\_at | Audit trail |
| discounts | type, value, scope, min\_purchase, min\_quantity, start/end\_date, usage\_limit, used\_count, created\_by | used\_count ≤ usage\_limit; percentage ≤ 100 |
| discount\_products | discount\_id, product\_id | Targets for PRODUCT scope |
| discount\_subscriptions | discount\_id, subscription\_id | Targets for SUBSCRIPTION scope (no rows = all) |
| invoices | number (INV-000001), subscription\_id, customer\_id, period\_start/end, invoice\_date, due\_date, status, subtotal, discount\_total, tax\_total, total, amount\_paid, bill\_to\_\* | **UNIQUE (subscription\_id, period\_start)**; total = subtotal − discount + tax |
| invoice\_lines | description, quantity, unit\_price, line\_subtotal, discount\_id, discount\_amount, tax\_name, tax\_rate, tax\_amount, line\_total | line\_total = subtotal − discount + tax |
| discount\_redemptions | discount\_id, invoice\_id, amount | UNIQUE (discount\_id, invoice\_id) |
| payments | invoice\_id, method, amount, paid\_on, reference, note, recorded\_by | amount > 0 |
| billing\_runs | run\_date, invoices\_created, subscriptions\_closed, errors (JSONB), triggered\_by | Run log |

**View v\_invoice\_balance** adds balance\_due (total − amount\_paid) and is\_overdue (CONFIRMED, unpaid, due\_date < today) to every invoice. Use it for invoice lists and reports.

**Five schema facts to remember while coding**

1. Invoice lines are snapshots (description, price, tax rate copied). Never join back to products to display an old invoice.
2. amount\_paid on invoices is a cached sum. Update it in the same transaction as every payment insert.
3. The totals CHECK means you must set subtotal, discount\_total, tax\_total and total in one UPDATE, after all lines are inserted.
4. Numbers default from sequences (SUB-000001, INV-000001); never generate them in Node.
5. IDs are BIGINT, so Prisma returns BigInt. Convert to string in lib/serialize.ts before sending JSON.

**Apply and verify**

```bash
npx prisma migrate deploy
psql postgresql://app:app@localhost:5432/subs -c "\dt"          # expect 20 tables
psql postgresql://app:app@localhost:5432/subs -c "\d invoices"  # check uq_invoice_period exists
```

For the test database run the same with DATABASE\_URL pointed at port 5433 (tests/helpers/db.ts does this once before the suite).

## 5. API contract

This contract is the only interface between you and the frontend. Copy it into docs/API\_CONTRACT.md in hour 0–2, and change it only after telling the frontend person, in the same commit as the code change.

**Conventions**

| Rule | Value |
| --- | --- |
| Base path | /api/v1 |
| Auth header | Authorization: Bearer \<accessToken>; refresh token in httpOnly cookie rt |
| JSON keys | camelCase (map from snake\_case in lib/serialize.ts) |
| IDs | Strings ("42"), because BIGINT does not fit JSON numbers safely |
| Money | Strings with 2 decimals ("8283.60") |
| Dates | "YYYY-MM-DD"; timestamps ISO 8601 UTC |
| Lists | ?page=1&pageSize=25 (max 100)&sort=field or -field → { data, page, pageSize, total } |
| Errors | { error: { code, message, details? } } |
| Status codes | 200 OK, 201 created, 204 no body, 400 validation or rule, 401 not logged in, 403 wrong role, 404 not found or not yours, 409 conflict |

**Error codes:** VALIDATION\_ERROR, INVALID\_CREDENTIALS, EMAIL\_TAKEN, UNAUTHENTICATED, FORBIDDEN, NOT\_FOUND, INVALID\_TRANSITION, BUSINESS\_RULE, CONFLICT.

**Endpoints**

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | /auth/signup | Public | { email, password, fullName, companyName? } → 201 customer |
| POST | /auth/login | Public | { email, password } → { accessToken, user } + rt cookie |
| POST | /auth/refresh | Cookie | → { accessToken, user }; rotates cookie |
| POST | /auth/logout | Any | Revokes refresh token → 204 |
| POST | /auth/forgot-password | Public | { email } → always 200 |
| POST | /auth/reset-password | Public | { token, newPassword } → 200 |
| GET / PATCH | /me | Any | Own profile |
| GET / POST | /users | Admin | List users ?role= / create staff |
| PATCH | /users/:id | Admin | Edit, deactivate |
| GET / POST | /customers | Admin, Staff | List ?q= / create customer account |
| GET / PATCH | /customers/:id | Admin, Staff | One customer |
| GET / POST | /taxes | Read all; write Admin | Tax rules |
| PATCH / DELETE | /taxes/:id | Admin | Edit / deactivate |
| GET / POST | /products | Read all; write Admin | ?q=&type=&active= |
| GET / PATCH / DELETE | /products/:id | Read all; write Admin | Includes variants |
| POST | /products/:id/variants | Admin | { attribute, value, extraPrice } |
| PATCH / DELETE | /variants/:id | Admin |  |
| GET / POST | /plans | Read all; write Admin | ?active=&available=true |
| GET / PATCH | /plans/:id | Read all; write Admin |  |
| GET / POST | /quotation-templates | Read Admin, Staff; write Admin | Template + lines |
| GET / PATCH / DELETE | /quotation-templates/:id | Admin |  |
| GET | /subscriptions | Admin, Staff, Customer (own) | ?status=&customerId=&planId=&from=&to=&q= |
| POST | /subscriptions | Admin, Staff | { customerId, planId, startDate, expiryDate?, paymentTermsDays?, templateId?, lines? } → DRAFT |
| GET / PATCH | /subscriptions/:id | Scoped | Header fields editable in DRAFT or QUOTATION only |
| POST | /subscriptions/:id/lines | Admin, Staff | { productId, variantId?, quantity, unitPrice?, taxId? } |
| PATCH / DELETE | /subscriptions/:id/lines/:lineId | Admin, Staff | DRAFT or QUOTATION only |
| POST | /subscriptions/:id/transition | Scoped | { action } → updated subscription |
| GET | /subscriptions/:id/history | Admin, Staff | Status history |
| POST | /subscriptions/:id/invoice | Admin, Staff | Bill this subscription now |
| GET / POST | /discounts | Read Admin, Staff; write Admin | { name, type, value, scope, minPurchase, minQuantity, startDate, endDate?, usageLimit?, productIds?, subscriptionIds? } |
| GET / PATCH | /discounts/:id | Admin | Shows usedCount |
| GET | /invoices | Admin, Staff, Customer (own) | ?status=&overdue=true&customerId=&subscriptionId=&from=&to=&q= |
| GET | /invoices/:id | Scoped | Lines + payments |
| POST | /invoices/:id/confirm | Admin, Staff | DRAFT → CONFIRMED |
| POST | /invoices/bulk-confirm | Admin, Staff | { ids: \[\] } → { confirmed, skipped } |
| POST | /invoices/:id/cancel | Admin, Staff | DRAFT, or CONFIRMED with amountPaid 0 |
| POST | /invoices/:id/send | Admin, Staff | Emails PDF; sets sentAt |
| GET | /invoices/:id/pdf | Scoped | application/pdf |
| POST | /invoices/:id/payments | Admin, Staff | { method, amount, paidOn, reference?, note? } |
| GET | /payments | Admin, Staff, Customer (own) | ?method=&from=&to=&invoiceId= |
| POST | /billing/run | Admin | { date? } → { invoicesCreated, closed, errors } |
| GET | /billing/runs | Admin | Run log |
| GET | /reports/summary | Admin, Staff | Dashboard cards |
| GET | /reports/revenue | Admin, Staff | ?from=&to= → \[{ month, amount }\] |
| GET | /reports/overdue | Admin, Staff | Paginated overdue invoices + daysOverdue |
| GET | /reports/subscriptions-by-plan | Admin, Staff | \[{ planId, planName, active, mrr }\] |

**Transition actions:** send\_quote, confirm, revise, activate, pause, resume, close, renew, cancel. Customers may only call pause, resume and close, and only if the plan allows.

**Response shapes**

```js
// Every list
{ "data": [ /* items */ ], "page": 1, "pageSize": 25, "total": 5000 }

// Every error
{ "error": { "code": "VALIDATION_ERROR", "message": "Quantity below plan minimum", "details": { "field": "quantity" } } }

// User (login, /me, lists)
{ "id": "1", "email": "admin@brightloop.test", "fullName": "Admin", "role": "ADMIN",
  "companyName": null, "isActive": true }

// POST /auth/login
{ "accessToken": "eyJ...", "user": { /* User */ } }

// Product (with variants)
{ "id": "1", "name": "CRM Pro", "type": "SERVICE", "salesPrice": "1000.00", "costPrice": "400.00",
  "defaultTax": { "id": "1", "name": "GST 18%", "rate": "18.00" }, "notes": "", "isActive": true,
  "variants": [ { "id": "1", "attribute": "Brand", "value": "Odoo", "extraPrice": "560.00" } ] }

// Plan
{ "id": "3", "name": "CRM Monthly", "price": "1000.00", "billingPeriod": "MONTHLY", "minQuantity": 1,
  "availableFrom": "2026-01-01", "availableTo": null,
  "autoClose": true, "isClosable": true, "isPausable": true, "isRenewable": true, "isActive": true }

// Subscription (list item)
{ "id": "42", "number": "SUB-000042", "customer": { "id": "7", "name": "Acme Ops" },
  "plan": { "id": "3", "name": "CRM Monthly", "billingPeriod": "MONTHLY" },
  "status": "ACTIVE", "startDate": "2026-11-01", "expiryDate": null,
  "nextBillingDate": "2026-12-01", "recurringTotal": "8283.60" }

// Subscription detail = list item +
{ "paymentTermsDays": 15, "quotationValidUntil": null, "notes": "",
  "allowedActions": ["pause", "close", "renew"],
  "lines": [ { "id": "91", "product": { "id": "1", "name": "CRM Pro" },
               "variant": { "id": "1", "attribute": "Brand", "value": "Odoo" },
               "quantity": 5, "unitPrice": "1560.00",
               "tax": { "id": "1", "name": "GST 18%", "rate": "18.00" } } ],
  "preview": { "subtotal": "7800.00", "discountTotal": "780.00", "taxTotal": "1263.60", "total": "8283.60" } }

// Discount
{ "id": "5", "name": "Seats 10%", "type": "PERCENTAGE", "value": "10.00", "scope": "PRODUCT",
  "minPurchase": "0.00", "minQuantity": 5, "startDate": "2026-10-01", "endDate": null,
  "usageLimit": 100, "usedCount": 4, "isActive": true, "productIds": ["1"], "subscriptionIds": [] }

// Invoice detail (list items omit lines and payments)
{ "id": "501", "number": "INV-000501", "subscriptionId": "42", "subscriptionNumber": "SUB-000042",
  "status": "CONFIRMED", "isOverdue": false,
  "periodStart": "2026-11-01", "periodEnd": "2026-12-01", "invoiceDate": "2026-11-01", "dueDate": "2026-11-16",
  "billTo": { "name": "Acme Ops", "email": "ops@acme.in", "address": null },
  "subtotal": "7800.00", "discountTotal": "780.00", "taxTotal": "1263.60", "total": "8283.60",
  "amountPaid": "5000.00", "balanceDue": "3283.60", "sentAt": null,
  "lines": [ { "description": "CRM Pro (Brand: Odoo)", "quantity": 5, "unitPrice": "1560.00",
               "lineSubtotal": "7800.00", "discountAmount": "780.00", "taxName": "GST 18%",
               "taxRate": "18.00", "taxAmount": "1263.60", "lineTotal": "8283.60" } ],
  "payments": [ { "id": "9", "method": "UPI", "amount": "5000.00", "paidOn": "2026-11-05",
                  "reference": "UTR123", "note": "" } ] }

// GET /reports/summary
{ "activeSubscriptions": 4312, "revenueThisMonth": "1845200.00", "outstanding": "612400.50",
  "overdueCount": 87, "overdueAmount": "143900.00", "mrr": "2210450.00" }

// POST /billing/run
{ "invoicesCreated": 312, "closed": 4, "errors": [] }
```

**Two fields that save the frontend real work:** allowedActions (the server's state machine and plan flags decide which buttons show) and preview (the server prices the subscription so the UI never does money maths).

## 6. Business rules

Every invoice line is priced in a fixed order (unit price → subtotal → discount → tax → total), rounded to 2 decimals half-up per line. Every status change goes through one state-machine function. Both live only in the server.

### Pricing order

1. unit\_price = product sales price (or the plan price if the line has no product price override) + variant extra\_price. Stored on the subscription line when it is created.
2. line\_subtotal = unit\_price × quantity.
3. Pick the single best eligible discount for the line (largest amount).
4. discount\_amount: FIXED → min(value, line\_subtotal); PERCENTAGE → line\_subtotal × value / 100.
5. tax\_amount = (line\_subtotal − discount\_amount) × tax\_rate / 100.
6. line\_total = line\_subtotal − discount\_amount + tax\_amount. Invoice totals are sums of line values.

### Discount eligibility (all must hold on the invoice date)

- is\_active; start\_date ≤ date ≤ end\_date (or no end date).
- used\_count < usage\_limit (or no limit). Claimed atomically at invoice creation (section 7).
- PRODUCT scope: line's product is in discount\_products; line quantity ≥ min\_quantity; line subtotal ≥ min\_purchase.
- SUBSCRIPTION scope: subscription is in discount\_subscriptions (or that table has no rows for this discount = all subscriptions); total quantity ≥ min\_quantity; subscription subtotal ≥ min\_purchase. It covers only the lines that got no PRODUCT-scope discount: PERCENTAGE applies to each of those lines; FIXED is split across them in proportion to their subtotals, with the rounding remainder on the last line (verified: 500 over 7,800 / 2,000 / 333.33 → 384.87 + 98.68 + 16.45 = 500.00).
- One usage = one invoice, however many lines it touches.
- **Preview** (the preview field on subscription detail) runs the same pricing with eligible discounts but never claims a slot.

### Worked example (test 1)

| Step | Calculation | Amount (₹) |
| --- | --- | --- |
| Unit price | CRM Pro 1,000 + Brand Odoo 560 | 1,560.00 |
| Line subtotal | 1,560 × 5 | 7,800.00 |
| Discount "Seats 10%" (min qty 5, used 3/100) | 7,800 × 10% | 780.00 |
| Taxable | 7,800 − 780 | 7,020.00 |
| GST 18% | 7,020 × 18% | 1,263.60 |
| **Total** |  | **8,283.60** |

### Other validation rules

| Rule | Where | Error |
| --- | --- | --- |
| Quantity ≥ plan.min\_quantity | Adding/editing lines, send\_quote | 400 BUSINESS\_RULE |
| Plan available today (available\_from ≤ today ≤ available\_to) | Creating a subscription | 400 BUSINESS\_RULE |
| Lines editable only in DRAFT or QUOTATION | Line endpoints | 400 INVALID\_TRANSITION |
| Due date = invoice date + payment\_terms\_days | Invoice creation | — |
| Payment amount ≤ balance due; invoice must be CONFIRMED | Record payment | 400 BUSINESS\_RULE |
| Cancelling an invoice doesn't return a discount slot | Cancel invoice | — (by design) |
| Only ADMIN creates discounts and staff | Routes | 403 FORBIDDEN |

### Subscription state machine

| From | Action | To | Guard |
| --- | --- | --- | --- |
| DRAFT | send\_quote | QUOTATION | ≥ 1 line; quantities ≥ min; sets quotation\_valid\_until = today + validity days (template, default 30) |
| QUOTATION | confirm | CONFIRMED | today ≤ quotation\_valid\_until |
| QUOTATION | revise | DRAFT | — |
| CONFIRMED | activate | ACTIVE | Sets next\_billing\_date = start\_date |
| ACTIVE | pause | PAUSED | plan.is\_pausable; sets paused\_at |
| PAUSED | resume | ACTIVE | next\_billing\_date += days paused; clears paused\_at |
| ACTIVE, PAUSED | close | CLOSED | plan.is\_closable (early close); auto-close job ignores this flag |
| ACTIVE | renew | ACTIVE | plan.is\_renewable and expiry\_date set; expiry\_date moves forward by the original term (expiry − start) |
| DRAFT, QUOTATION | cancel | CLOSED | Never billed |

```ts
// src/modules/subscriptions/stateMachine.ts
export const T = {
  DRAFT:     { send_quote: 'QUOTATION', cancel: 'CLOSED' },
  QUOTATION: { confirm: 'CONFIRMED', revise: 'DRAFT', cancel: 'CLOSED' },
  CONFIRMED: { activate: 'ACTIVE' },
  ACTIVE:    { pause: 'PAUSED', close: 'CLOSED', renew: 'ACTIVE' },
  PAUSED:    { resume: 'ACTIVE', close: 'CLOSED' },
  CLOSED:    {},
} as const;

export function nextStatus(from: SubStatus, action: string): SubStatus {
  const to = (T[from] as Record<string, SubStatus>)[action];
  if (!to) throw new AppError(400, 'INVALID_TRANSITION', `Cannot ${action} from ${from}`,
                              { allowed: Object.keys(T[from]) });
  return to;
}

/** what the UI may show: state machine ∩ plan flags ∩ role */
export function allowedActions(sub, plan, role): string[] {
  return Object.keys(T[sub.status]).filter((a) => {
    if (a === 'pause' && !plan.is_pausable) return false;
    if (a === 'close' && !plan.is_closable) return false;
    if (a === 'renew' && !plan.is_renewable) return false;
    if (role === 'CUSTOMER') return ['pause', 'resume', 'close'].includes(a);
    return true;
  });
}
```

The transition service runs in one transaction: lock the subscription row, call nextStatus, check the guard, apply side effects (dates), insert a subscription\_status\_history row, return the updated detail with fresh allowedActions.

### Invoice state machine

| From | Action | To | Guard |
| --- | --- | --- | --- |
| DRAFT | confirm | CONFIRMED | ≥ 1 line; total > 0; sets confirmed\_at |
| DRAFT | cancel | CANCELLED | — |
| CONFIRMED | cancel | CANCELLED | amount\_paid = 0 |
| CONFIRMED | payment brings amount\_paid to total | PAID | Automatic; sets paid\_at |
| PAID, CANCELLED | anything | — | Final; 400 INVALID\_TRANSITION |

## 7. Billing engine and payments

runBilling(runDate) creates every invoice that is due. It is safe to run twice because the database refuses a second invoice for the same period, and it never skips because a catch-up loop bills every missed period. node-cron runs it daily at 00:05 IST, and an admin can trigger it with POST /billing/run.

**Algorithm**

1. Insert a billing\_runs row.
2. Select ACTIVE subscriptions with next\_billing\_date ≤ runDate.
3. For each, open its own transaction and lock the row with FOR UPDATE SKIP LOCKED.
4. While period\_start ≤ runDate and within expiry: create the invoice for \[period\_start, period\_end).
5. Header insert uses ON CONFLICT (subscription\_id, period\_start) DO NOTHING; no row back = already billed, skip.
6. Price each line, claim the discount slot atomically, insert lines and redemptions, then write the 4 totals in one UPDATE.
7. Move next\_billing\_date to the last period\_end and commit.
8. Auto-close ACTIVE subscriptions whose plan has auto\_close and whose expiry\_date < runDate.
9. Finish the billing\_runs row with counts and per-subscription errors; one failure never stops the run.

**Period dates are computed from the start date, not chained** (Jan 31 → Feb 28 → Mar 31, not Mar 28). Verified with date-fns.

```ts
// src/lib/dates.ts
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
export type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** today's calendar date in India, as UTC midnight (how Prisma represents a DATE).
 *  At 00:05 IST on 1 Nov, new Date() is still 31 Oct in UTC; this returns 1 Nov (verified). */
export function todayIST(now = new Date()): Date {
  return new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now));
}

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

**Every "today" in billing is todayIST()**: the scheduler, POST /billing/run when no date is sent, POST /subscriptions/:id/invoice, quotation validity and plan availability checks. Never pass new Date() straight into billing. Also run ALTER DATABASE subs SET timezone TO 'Asia/Kolkata' once, so CURRENT\_DATE in the overdue and report queries is the Indian date too.

```ts
// src/modules/billing/pricing.ts — pure, unit-tested, no database
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
// priceLine(1560, 5, 18, 10% off) → 7800 / 780 / 1263.6 / 8283.6 (verified)
```

```ts
// src/modules/discounts/discount.eligibility.ts
import Decimal from 'decimal.js';
import { discountAmount, type Disc } from '../billing/pricing';

const toDisc = (d: any): Disc => ({ id: d.id, type: d.type, value: new Decimal(d.value.toString()) });

/** PRODUCT scope: discounts for one line, best (largest amount) first */
export async function eligibleProductDiscounts(tx, line, onDate: Date): Promise<Disc[]> {
  const lineSub = new Decimal(line.unit_price.toString()).mul(line.quantity);
  const rows = await tx.$queryRaw<any[]>`
    SELECT d.* FROM discounts d
    JOIN discount_products dp ON dp.discount_id = d.id AND dp.product_id = ${line.product_id}
    WHERE d.is_active AND d.scope = 'PRODUCT'
      AND d.start_date <= ${onDate}::date AND (d.end_date IS NULL OR d.end_date >= ${onDate}::date)
      AND (d.usage_limit IS NULL OR d.used_count < d.usage_limit)
      AND d.min_quantity <= ${line.quantity}
      AND d.min_purchase <= ${lineSub.toString()}::numeric`;
  return rows.map(toDisc).sort((a, b) => discountAmount(lineSub, b).cmp(discountAmount(lineSub, a)));
}

/** SUBSCRIPTION scope: checked against the whole subscription; no target rows = all subscriptions.
 *  Query tested on PostgreSQL 16. */
export async function eligibleSubscriptionDiscounts(
  tx, subscriptionId: bigint, totalQty: number, totalSub: Decimal, onDate: Date,
): Promise<Disc[]> {
  const rows = await tx.$queryRaw<any[]>`
    SELECT d.* FROM discounts d
    WHERE d.is_active AND d.scope = 'SUBSCRIPTION'
      AND d.start_date <= ${onDate}::date AND (d.end_date IS NULL OR d.end_date >= ${onDate}::date)
      AND (d.usage_limit IS NULL OR d.used_count < d.usage_limit)
      AND d.min_quantity <= ${totalQty}
      AND d.min_purchase <= ${totalSub.toString()}::numeric
      AND (NOT EXISTS (SELECT 1 FROM discount_subscriptions x WHERE x.discount_id = d.id)
           OR EXISTS (SELECT 1 FROM discount_subscriptions x
                      WHERE x.discount_id = d.id AND x.subscription_id = ${subscriptionId}))`;
  return rows.map(toDisc).sort((a, b) => discountAmount(totalSub, b).cmp(discountAmount(totalSub, a)));
}
```

Also export r2 from pricing.ts (export const r2 = ...); allocateFixed below uses it.

```ts
// src/modules/billing/engine.ts
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { addDays } from 'date-fns';
import { prisma } from '../../lib/prisma';
import { nextBoundary } from '../../lib/dates';
import { priceLine, r2, type Disc } from './pricing';
import { eligibleProductDiscounts, eligibleSubscriptionDiscounts } from '../discounts/discount.eligibility';

type Tx = Prisma.TransactionClient;

/** runDate must be a calendar date from todayIST() (or a date the admin picked) */
export async function runBilling(runDate: Date, triggeredBy?: bigint) {
  const run = await prisma.billing_runs.create({
    data: { run_date: runDate, triggered_by: triggeredBy ?? null },
  });
  let invoicesCreated = 0;
  const errors: { subscriptionId: string; message: string }[] = [];

  const due = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM subscriptions
    WHERE status = 'ACTIVE' AND next_billing_date <= ${runDate}::date ORDER BY id`;

  for (const { id } of due) {
    try {
      invoicesCreated += await prisma.$transaction((tx) => billOne(tx, id, runDate));
    } catch (e) {
      errors.push({ subscriptionId: id.toString(), message: (e as Error).message });
    }
  }
  const closed = await autoClose(runDate);
  await prisma.billing_runs.update({ where: { id: run.id }, data: {
    finished_at: new Date(), invoices_created: invoicesCreated, subscriptions_closed: closed, errors } });
  return { invoicesCreated, closed, errors };
}

export async function billOne(tx: Tx, id: bigint, runDate: Date): Promise<number> {
  const rows = await tx.$queryRaw<any[]>`
    SELECT s.*, p.billing_period FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.id = ${id} AND s.status = 'ACTIVE' FOR UPDATE OF s SKIP LOCKED`;
  if (rows.length === 0) return 0;
  const sub = rows[0];
  let created = 0;
  let periodStart: Date = sub.next_billing_date;
  while (periodStart <= runDate && (!sub.expiry_date || periodStart <= sub.expiry_date)) {
    const periodEnd = nextBoundary(sub.start_date, sub.billing_period, periodStart);
    if (await createInvoice(tx, sub, periodStart, periodEnd, runDate)) created++;
    periodStart = periodEnd;                          // catch-up: nothing skipped
  }
  await tx.$executeRaw`UPDATE subscriptions SET next_billing_date = ${periodStart}::date,
                       updated_at = now() WHERE id = ${id}`;
  return created;
}

type WorkLine = { line: any; sub: Decimal; applied?: Disc };

export async function createInvoice(tx: Tx, sub: any, start: Date, end: Date, invoiceDate: Date) {
  const customer = await tx.users.findUniqueOrThrow({ where: { id: sub.customer_id } });
  const due = addDays(invoiceDate, sub.payment_terms_days);
  const inserted = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO invoices (subscription_id, customer_id, period_start, period_end,
                          invoice_date, due_date, bill_to_name, bill_to_email, bill_to_address)
    VALUES (${sub.id}, ${sub.customer_id}, ${start}::date, ${end}::date, ${invoiceDate}::date,
            ${due}::date, ${customer.full_name}, ${customer.email}, ${customer.address})
    ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING RETURNING id`;
  if (inserted.length === 0) return false;           // already billed → idempotent
  const invoiceId = inserted[0].id;

  const lines = await tx.subscription_lines.findMany({
    where: { subscription_id: sub.id },
    include: { products: true, product_variants: true, taxes: true },
  });
  const claimed = new Set<bigint>();                  // one usage per discount per invoice

  // 1. PRODUCT scope, line by line
  const work: WorkLine[] = [];
  for (const line of lines) {
    let applied: Disc | undefined;
    for (const d of await eligibleProductDiscounts(tx, line, invoiceDate)) {
      if (claimed.has(d.id) || (await claimSlot(tx, d.id))) { applied = d; claimed.add(d.id); break; }
    }
    work.push({ line, sub: new Decimal(line.unit_price.toString()).mul(line.quantity), applied });
  }

  // 2. SUBSCRIPTION scope covers the lines that got no product discount
  const rest = work.filter((w) => !w.applied);
  if (rest.length > 0) {
    const totalQty = lines.reduce((q, l) => q + l.quantity, 0);
    const totalSub = work.reduce((s, w) => s.plus(w.sub), new Decimal(0));
    for (const d of await eligibleSubscriptionDiscounts(tx, sub.id, totalQty, totalSub, invoiceDate)) {
      if (!(await claimSlot(tx, d.id))) continue;     // limit reached meanwhile → try the next one
      claimed.add(d.id);
      if (d.type === 'PERCENTAGE') rest.forEach((w) => { w.applied = d; });
      else allocateFixed(d, rest);
      break;
    }
  }

  // 3. price and insert every line, then the totals
  let subtotal = new Decimal(0), discountTotal = new Decimal(0), taxTotal = new Decimal(0);
  for (const { line, applied } of work) {
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
      tax_amount: p.tax.toString(), line_total: p.total.toString() } });
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
      ${process.env.AUTO_CONFIRM_INVOICES === 'true'
        ? Prisma.sql`, status = 'CONFIRMED', confirmed_at = now()` : Prisma.empty}
    WHERE id = ${invoiceId}`;
  return true;
}

/** FIXED subscription discount split by line subtotal; remainder on the last line (verified) */
function allocateFixed(d: Disc, rest: WorkLine[]) {
  const base = rest.reduce((s, w) => s.plus(w.sub), new Decimal(0));
  if (base.isZero()) return;
  const total = Decimal.min(d.value, base);
  let left = total;
  rest.forEach((w, i) => {
    const share = i === rest.length - 1 ? left : r2(total.mul(w.sub).div(base));
    left = left.minus(share);
    w.applied = { id: d.id, type: 'FIXED', value: share };
  });
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
import { todayIST } from '../lib/dates';

export function startScheduler() {
  // fires at 00:05 India time; bill for India's date, not the UTC date (still yesterday then)
  cron.schedule(process.env.BILLING_CRON ?? '5 0 * * *', () => runBilling(todayIST()),
                { timezone: 'Asia/Kolkata' });
}

// POST /billing/run: runBilling(body.date ? new Date(body.date) : todayIST(), BigInt(req.user.id))
// body.date is "YYYY-MM-DD", which JavaScript parses as UTC midnight: the same form as todayIST()
```

**POST /subscriptions/:id/invoice** (bill one subscription now) calls billOne inside a transaction with runDate = today. It uses the same code path, so it is equally idempotent.

### Recording a payment

```ts
// src/modules/payments/payment.service.ts
export async function recordPayment(invoiceId: bigint, body, user) {
  return prisma.$transaction(async (tx) => {
    const [inv] = await tx.$queryRaw<any[]>`
      SELECT * FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'CONFIRMED')
      throw new AppError(400, 'BUSINESS_RULE', 'Only confirmed invoices accept payments');
    const amount = new Decimal(body.amount);
    const balance = new Decimal(inv.total.toString()).minus(inv.amount_paid.toString());
    if (amount.lte(0) || amount.gt(balance))
      throw new AppError(400, 'BUSINESS_RULE', `Amount must be between 0.01 and ${balance.toFixed(2)}`);

    const payment = await tx.payments.create({ data: {
      invoice_id: invoiceId, method: body.method, amount: amount.toString(),
      paid_on: new Date(body.paidOn), reference: body.reference ?? null,
      note: body.note ?? null, recorded_by: BigInt(user.id) } });

    const paid = new Decimal(inv.amount_paid.toString()).plus(amount);
    const fullyPaid = paid.gte(inv.total.toString());
    await tx.$executeRaw`
      UPDATE invoices SET amount_paid = ${paid.toString()}::numeric
        ${fullyPaid ? Prisma.sql`, status = 'PAID', paid_at = now()` : Prisma.empty}
      WHERE id = ${invoiceId}`;
    return payment;
  });
}
```

**Prisma model names** in this code (tx.users, tx.subscription\_lines, include products / product\_variants / taxes) are what prisma db pull generates from the snake\_case tables. If you rename models in schema.prisma, rename them here too.

## 8. Auth, roles and ownership

Every request is checked twice on the server: requireRole decides whether this kind of user may call the endpoint, and the service scopes the query so a customer only ever sees their own rows. The frontend hides buttons, but that is cosmetic; your checks are the security.

### Auth flows

| Flow | Steps |
| --- | --- |
| Sign-up | Zod validates email + password rule → bcrypt hash (cost 12) → insert role CUSTOMER (never from the body) → 409 EMAIL\_TAKEN on unique violation (Prisma code P2002) |
| Login | Find by email (CITEXT) → bcrypt.compare → same 401 INVALID\_CREDENTIALS for unknown email or wrong password → inactive user 403 → issue tokens |
| Tokens | Access JWT { sub: id, role }, 15 min, signed with JWT\_ACCESS\_SECRET; refresh = 32 random bytes, SHA-256 hash stored in refresh\_tokens, 7 days, cookie rt (httpOnly, SameSite=Strict, path /api/v1/auth, secure in production) |
| Refresh | Hash cookie → find unrevoked unexpired row → revoke it → issue new pair (rotation). A revoked token presented again = revoke all that user's tokens (theft signal) |
| Logout | Revoke current refresh token, clear cookie, 204 |
| Forgot password | Always 200. If the user exists: 32 random bytes, store SHA-256 hash, expires in 30 min, email `${APP_URL}/reset-password?token=<raw>` |
| Reset password | Hash token → unused, unexpired row → validate new password → update hash → mark token used → revoke all refresh tokens |
| Create staff | Admin only; POST /users { email, fullName, password } with role STAFF; created\_by = admin id |

**Password rule (shared with the frontend):**

```ts
export const passwordSchema = z.string()
  .min(9, 'Must be more than 8 characters')
  .regex(/[a-z]/, 'Needs a lowercase letter')
  .regex(/[A-Z]/, 'Needs an uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Needs a special character');
```

**Rate limits:** 5 requests per minute per IP on /auth/login, /auth/forgot-password and /auth/reset-password (express-rate-limit).

### Middleware

```ts
// src/middleware/auth.ts
export function auth(req, _res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
  try {
    const p = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; role: Role };
    req.user = { id: p.sub, role: p.role };
    next();
  } catch { next(new AppError(401, 'UNAUTHENTICATED', 'Session expired')); }
}

// src/middleware/requireRole.ts
export const requireRole = (...roles: Role[]) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'FORBIDDEN', 'Not allowed'));

// ownership scope used in every service a customer can reach
export const ownScope = (user) => (user.role === 'CUSTOMER' ? { customer_id: BigInt(user.id) } : {});
// prisma.invoices.findFirst({ where: { id, ...ownScope(req.user) } }) → null → 404 NOT_FOUND
```

A customer asking for someone else's invoice gets 404, not 403, so the response doesn't confirm the ID exists.

### Permission matrix

| Resource / action | Admin | Staff | Customer |
| --- | --- | --- | --- |
| Create / deactivate staff | Yes | No | No |
| Customers create, edit | Yes | Yes | Own profile (/me) |
| Products, variants, taxes | Full | Read | Read active |
| Plans | Full | Read | Read available |
| Quotation templates | Full | Read, use | No |
| Subscriptions | Full | Create, edit, transitions | Own: read; pause, resume, close if plan allows |
| Discounts | Full | Read | No |
| Invoices confirm, cancel, send | Yes | Yes | No |
| Invoices read, PDF | All | All | Own |
| Record payment | Yes | Yes | No |
| Payments read | All | All | Own |
| Run billing now, billing runs | Yes | No | No |
| Reports | Yes | Yes | No |

### Seed accounts

| Email | Password | Role |
| --- | --- | --- |
| admin@brightloop.test | Demo@12345 | ADMIN |
| staff@brightloop.test | Demo@12345 | STAFF |
| customer@acme.test | Demo@12345 | CUSTOMER |
| customer2@globex.test | Demo@12345 | CUSTOMER (for the "can't see others' invoices" demo) |

## 9. Reports, seed data and performance

All report numbers are aggregated inside PostgreSQL in a handful of queries; Node only formats them. Target: under 300 ms API time per page on 5,000 subscriptions and about 30,000 invoices, well below the 2-second limit.

### Report queries

```sql
-- GET /reports/summary  (tested on the schema)
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

-- GET /reports/revenue?from&to
SELECT to_char(date_trunc('month', paid_on), 'YYYY-MM') AS month, sum(amount) AS amount
FROM payments WHERE paid_on BETWEEN $1 AND $2
GROUP BY 1 ORDER BY 1;

-- GET /reports/overdue (paginated)
SELECT i.id, i.number, i.bill_to_name, i.due_date, (CURRENT_DATE - i.due_date) AS days_overdue,
       (i.total - i.amount_paid) AS balance_due
FROM invoices i
WHERE i.status = 'CONFIRMED' AND i.amount_paid < i.total AND i.due_date < CURRENT_DATE
ORDER BY i.due_date ASC LIMIT $1 OFFSET $2;

-- GET /reports/subscriptions-by-plan
SELECT p.id, p.name, count(DISTINCT s.id) AS active,
       COALESCE(sum(sl.quantity * sl.unit_price), 0) AS line_amount, p.billing_period
FROM plans p
LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'ACTIVE'
LEFT JOIN subscription_lines sl ON sl.subscription_id = s.id
GROUP BY p.id ORDER BY active DESC;   -- normalise line_amount to MRR in Node with the same factors
```

| Number | Definition |
| --- | --- |
| Revenue this month | Payments received this calendar month (cash basis) |
| Outstanding | Sum of total − amount\_paid on CONFIRMED invoices |
| Overdue | CONFIRMED, not fully paid, due\_date < today |
| MRR | Active line amounts normalised to a month (yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12), before discount and tax |

### Seed script (prisma/seed.ts)

| Mode | Creates | Purpose |
| --- | --- | --- |
| npm run db:seed | 4 accounts (section 8), taxes GST 5/12/18%, 6 products incl. CRM Pro + Brand variants (Odoo +560), 4 plans (one per period), 2 quotation templates, discount "Seats 10%", 10 customers with active subscriptions | Daily development and the demo |
| npm run db:seed:big | + 500 customers, 5,000 subscriptions (mixed plans and statuses), backfilled billing for the last 6 months (\~30,000 invoices), \~70% of those paid, \~5% overdue | Proving the 2-second rule |

Use createMany in batches of 1,000. For the backfill, start subscriptions 6 months back and call runBilling(date) once per day over those 6 months (oldest first), so invoice and due dates are spread out and some invoices are genuinely overdue. Then confirm all invoices and insert payments for about 70% of them. The frontend person gives you a list of realistic company names and plan names; demo data that says "Test User 1" looks unfinished.

### Performance rules

- Every list paginated server-side: default 25, max 100. Never return all rows.
- Lists select only displayed columns (Prisma select); lines and payments load only on detail endpoints.
- No N+1: one query with joins or include for a list, never a query inside a loop in a request handler.
- Indexes from schema.sql cover the filters (status, customer, due\_date, invoice\_date, paid\_on, next\_billing\_date). After seeding big, run EXPLAIN ANALYZE on the summary, overdue and invoices-list queries and confirm index scans.
- pino-http logs responseTime on every request. Note the p95 for the demo ("dashboard 180 ms on 5,000 subscriptions").
- If /reports/summary is still slow, cache it in memory for 60 seconds. No Redis needed.

## 10. Tests you must write

Write 20 tests with Vitest + Supertest against the real test database on port 5433. Tests 1–12 are due by Sync 2 (hour 20); all 20 by the feature freeze. They are your proof in the demo that billing is correct.

| # | Test | Expected | Proves | File |
| --- | --- | --- | --- | --- |
| 1 | priceLine(1560, 5, 18%, 10% off) | 7800 / 780 / 1263.60 / 8283.60 | Pricing order | pricing.test.ts |
| 2 | FIXED discount larger than line subtotal | Discount = subtotal; total never negative | Discount cap | pricing.test.ts |
| 3 | runBilling twice on the same date | Exactly 1 invoice | No double billing | billing.test.ts |
| 4 | Two runBilling calls in parallel (Promise.all) | Exactly 1 invoice | Lock + unique constraint | billing.test.ts |
| 5 | next\_billing\_date 3 months back, monthly plan | 3 invoices, consecutive periods | No skipping | billing.test.ts |
| 6 | start\_date Jan 31, monthly | Periods start Jan 31, Feb 28, Mar 31 | Date anchoring | billing.test.ts |
| 7 | expiry inside the billing window | No invoice with period\_start after expiry | Expiry respected | billing.test.ts |
| 8 | PAUSED subscription on billing day | No invoice | Pause rule | billing.test.ts |
| 9 | Discount at 99/100, two subscriptions billed | Only one discounted; used\_count = 100 | Atomic usage limit | billing.test.ts |
| 10 | Discount outside its dates | Not applied | Date rule | billing.test.ts |
| 11 | Line quantity below min\_quantity | Not applied | Min quantity | billing.test.ts |
| 12 | auto\_close plan, expiry passed | CLOSED + history row | Auto-close | billing.test.ts |
| 13 | Two partial payments summing to total | PAID, paid\_at set | Payment flow | payments.test.ts |
| 14 | Payment above balance | 400, nothing saved | Overpayment guard | payments.test.ts |
| 15 | Payment on DRAFT invoice | 400 | Invoice state rule | payments.test.ts |
| 16 | Transition DRAFT → close | 400 INVALID\_TRANSITION with allowed list | State machine | subscriptions.test.ts |
| 17 | Customer GET another customer's invoice | 404 | Ownership scope | auth-rbac.test.ts |
| 18 | Staff POST /discounts | 403 | Role check | auth-rbac.test.ts |
| 19 | Sign-up with "Password1" | 400 with rule message | Password rule | auth-rbac.test.ts |
| 20 | Sign-up with same email, different case | 409 EMAIL\_TAKEN | Unique email | auth-rbac.test.ts |

**Two more tests added after review (write them in Phase 2):**

- **21 — Subscription-scope discount:** a FIXED ₹500 SUBSCRIPTION discount on a subscription with three lines and no product discount → line discounts 384.87 + 98.68 + 16.45, invoice discount\_total 500.00, used\_count + 1 (once, not three times). File: billing.test.ts.
- **22 — IST billing date:** todayIST(new Date('2026-10-31T18:35:00Z')) returns 2026-11-01 (that instant is 00:05 IST on 1 Nov). File: pricing.test.ts (pure, no DB).

**Test helpers**

```ts
// tests/helpers/db.ts
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE payments, discount_redemptions, invoice_lines, invoices, discount_subscriptions,
      discount_products, discounts, subscription_status_history, subscription_lines, subscriptions,
      quotation_template_lines, quotation_templates, plans, product_variants, products, taxes,
      password_reset_tokens, refresh_tokens, billing_runs, users RESTART IDENTITY CASCADE`);
}

// tests/helpers/factories.ts — makeAdmin(), makeCustomer(), makeTax(18),
// makeProduct({ price: 1000, variant: ['Brand','Odoo',560] }), makePlan({ period: 'MONTHLY' }),
// makeActiveSub({ customer, plan, lines, startDate, nextBillingDate })
```

**Rules:** never mock Prisma in billing tests (the constraints are the logic); run tests sequentially (vitest --no-file-parallelism or singleThread) because they share one database; never edit a test to make it pass without telling your teammate why.

**Known pitfalls**

- Time zones: Postgres DATE arrives in Node as UTC midnight. Always run with TZ=UTC (the npm scripts do).
- Decimals: Prisma returns Decimal objects. Convert with new Decimal(x.toString()), never Number(x).
- BigInt: JSON.stringify throws on BigInt. Always send through lib/serialize.ts.

## 11. Your task checklist

The work runs in five phases with four sync points, assuming 36 hours (rescale if your deadline differs). The rule that matters most: by hour 20 the chain plan → subscription → billing run → invoice must work on the real API.

### Phase 0 — hours 0–2, together with the frontend person

- [ ] Create the repo, .gitignore, docker-compose.yml; both run docker compose up
- [ ] Add AGENTS.md, docs/BUILD\_PLAN.md, this blueprint
- [ ] Write docs/API\_CONTRACT.md from section 5; both agree and commit
- [ ] Scaffold server/ (section 2), apply the migration, prisma db pull, GET /api/v1/health returns { ok: true }

### Phase 1 — hours 2–10: auth and setup data

- [ ] lib/ (prisma, money, dates, serialize, pagination, errors) and middleware/ (auth, requireRole, validate, errorHandler)
- [ ] Auth: signup, login, refresh, logout, forgot, reset, /me
- [ ] Users (create staff), customers CRUD
- [ ] Taxes, products + variants, plans, quotation templates CRUD with pagination and filters
- [ ] Seed script (small mode) with the 4 demo accounts
- [ ] Tests 17–20
- [ ] **Sync 1 (h10):** frontend switches login and catalog to your API; fix contract mismatches together (30 min)

### Phase 2 — hours 10–20: the core

- [ ] Subscriptions CRUD, lines, stateMachine.ts, allowedActions, transition endpoint, history
- [ ] pricing.ts + preview on subscription detail
- [ ] Discounts CRUD (admin only) + eligibility
- [ ] engine.ts: runBilling, createInvoice, claimSlot, autoClose; POST /billing/run; POST /subscriptions/:id/invoice
- [ ] Tests 1–12 and 16 passing
- [ ] Read engine.ts line by line yourself (section 12 checklist)
- [ ] **Sync 2 (h20):** demo the chain on the real API with the frontend person

### Phase 3 — hours 20–28: money in, numbers out

- [ ] Invoices list (with v\_invoice\_balance) and detail, confirm, bulk-confirm, cancel
- [ ] Payments: record (section 7) and list; tests 13–15
- [ ] Reports: summary, revenue, overdue, subscriptions-by-plan
- [ ] Scheduler started in server.ts; billing runs log endpoint
- [ ] Invoice PDF (render the frontend person's HTML template with Puppeteer) and send by email
- [ ] Seed big mode (5,000 subscriptions)
- [ ] **Sync 3 (h28): feature freeze.** Frontend removes all mocks; no new endpoints after this

### Phase 4 — hours 28–34: harden

- [ ] Fix every bug on the frontend person's list
- [ ] EXPLAIN ANALYZE on the heavy queries; note response times
- [ ] Run all 20 tests on a fresh database
- [ ] Click through the UI as each role (you test their half, they test yours)
- [ ] **Sync 4 (h34):** zero known blockers

### Phase 5 — hours 34–36: demo

- [ ] Rehearse answers to the five judge questions below
- [ ] Reset and reseed the demo database right before presenting

**Five questions you must answer without notes:** Why PostgreSQL and not MongoDB? What happens if billing runs twice? What if the server was down for 3 days on billing day? Why is overdue not a stored column? What happens when a discount reaches its usage limit in the middle of a billing run?

**If you fall behind at hour 20:** hand the reports module and seed script to the frontend person (read-only code that can't break billing); cut email sending and Puppeteer (use browser print). Never hand off the billing engine.

## 12. Antigravity prompts and review checklist

Give the agent one phase at a time, in a fresh conversation each time, and make it stop for your check before the next. Put this blueprint at docs/BACKEND\_BLUEPRINT.md and AGENTS.md at the repo root (also paste AGENTS.md into the workspace rules).

| # | Prompt to paste | You check before moving on |
| --- | --- | --- |
| 1 | "Read AGENTS.md and docs/BACKEND\_BLUEPRINT.md sections 1–4. Scaffold server/ exactly as in sections 2 and 3: package.json scripts, tsconfig, lib/, middleware/, app.ts, server.ts, health endpoint. Apply prisma/migrations/0001\_init and run prisma db pull. Do not edit the migration. Stop and show me npm run build output." | Server starts; 20 tables exist; build passes |
| 2 | "Implement section 8 (auth, roles, ownership) and the users and customers modules from section 5. Use the passwordSchema exactly. Write tests 17–20 from section 10 and the test helpers. Stop and show npm test output." | 4 tests pass; staff can't create discounts |
| 3 | "Implement taxes, products + variants, plans and quotation templates per section 5: Zod validation, pagination, filters, camelCase JSON via lib/serialize.ts. Add the small seed from section 9. Stop." | Responses match section 5 shapes exactly |
| 4 | "Implement subscriptions per sections 5 and 6: CRUD, lines, stateMachine.ts, allowedActions, transition endpoint with history in one transaction, and preview using pricing.ts. Write test 16. Stop." | Draft → Active works; illegal action returns 400 with allowed list |
| 5 | "Implement section 7 exactly: dates.ts, pricing.ts, discount.eligibility.ts, engine.ts, scheduler.ts, POST /billing/run and POST /subscriptions/:id/invoice. Treat the code in section 7 as the reference implementation: keep ON CONFLICT, FOR UPDATE SKIP LOCKED, the while loop and claimSlot as written. Write tests 1–12. Stop." | All 12 pass, and you've done the review checklist below |
| 6 | "Implement invoices (list via v\_invoice\_balance, detail, confirm, bulk-confirm, cancel) and payments exactly as in section 7. Write tests 13–15. Stop." | Two partial payments → PAID |
| 7 | "Implement reports from section 9 and the big seed mode. Add pino-http response time logging. Stop and show EXPLAIN ANALYZE for the summary and overdue queries." | Summary < 300 ms on big seed |
| 8 | "Implement invoice PDF with Puppeteer from src/modules/billing/invoice.template.html and POST /invoices/:id/send with nodemailer. Stop." | PDF opens; Mailtrap receives the mail |

**Review checklist for engine.ts, payment.service.ts and stateMachine.ts (15 minutes, do it yourself)**

| Look for | Bad sign | AGENTS.md rule |
| --- | --- | --- |
| ON CONFLICT ON CONSTRAINT uq\_invoice\_period DO NOTHING | findFirst then create | 5 |
| FOR UPDATE ... SKIP LOCKED on the subscription | No lock | 5 |
| while (periodStart <= runDate ...) | if instead of while | — |
| Decimal in every money calculation | Number(), parseFloat, + on amounts | 1 |
| claimSlot's conditional UPDATE | Read used\_count, then write it back | 6 |
| Payment: FOR UPDATE on invoice, balance check, insert, update, one transaction | No transaction | — |
| Status changes only via nextStatus() | PATCH that sets status | 7 |
| ownScope() in every customer-reachable query | findUnique({ id }) alone | 8 |
| git diff tests/ shows only added tests | Edited assertions | — |
| git diff prisma/migrations/0001\_init is empty | Any change | 2 |

If any row fails, reply to the agent: "This violates AGENTS.md rule N and section 7 of the blueprint. Restore it exactly as written and rerun the tests."

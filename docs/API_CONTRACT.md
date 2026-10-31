# API Contract — Subscription Management System

The only interface between `server/` and `client/`. Copied word for word from section 5 of
`docs/BACKEND_BLUEPRINT.md` (Oct 31, 2026). Change it only after telling the other person,
and update this file in the same commit as the code (and MSW mock) change.

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
| Status codes | 200 OK, 201 created, 204 no body, 400 validation or rule, 401 not logged in, 403 wrong role, 404 not found or not yours, 409 conflict, 429 too many attempts (login, forgot, reset: AUTH\_RATE\_LIMIT per minute per IP, 5 in production) |

**Error codes:** VALIDATION\_ERROR, INVALID\_CREDENTIALS, EMAIL\_TAKEN, UNAUTHENTICATED, FORBIDDEN, NOT\_FOUND, INVALID\_TRANSITION, BUSINESS\_RULE, CONFLICT, RATE\_LIMITED.

**Validation error shape (400 VALIDATION\_ERROR from request checks).** `message` and `details.field` are the first problem; `details.fields` lists every problem, with nested paths like `lines.0.quantity`. Errors raised by business rules send only `details.field`.

```js
{ "error": { "code": "VALIDATION_ERROR", "message": "Needs a special character",
    "details": { "field": "password",
                 "fields": [ { "field": "password", "message": "Needs a special character" },
                             { "field": "fullName", "message": "Full name is required" } ] } } }
```

**Endpoints**

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | /auth/signup | Public | { email, password, fullName, companyName? } → 201 customer |
| POST | /auth/login | Public | { email, password } → { accessToken, user } + rt cookie |
| POST | /auth/refresh | Cookie | → { accessToken, user }; rotates cookie. 401 with details.retry = true means another tab just refreshed: the cookie was kept, retry once after ~300 ms. Any other 401 clears the cookie: log out |
| POST | /auth/logout | Any | Revokes refresh token → 204 |
| POST | /auth/forgot-password | Public | { email } → always 200 { message } |
| POST | /auth/reset-password | Public | { token, newPassword } → 200 { message }; bad or used token → 400 BUSINESS\_RULE |
| GET / PATCH | /me | Any | Own profile |
| GET / POST | /users | Admin | List users ?role= / create staff |
| PATCH | /users/:id | Admin | Edit, deactivate |
| GET / POST | /customers | Admin, Staff | List ?q=&active= / create { email, fullName, password?, companyName?, phone?, address?, gstin? }; no password → customer is emailed a set-password link |
| GET / PATCH | /customers/:id | Admin, Staff | One customer |
| GET / POST | /taxes | Read all; write Admin | ?q=&active=; customers see active only. POST { name, rate, isActive? } |
| PATCH / DELETE | /taxes/:id | Admin | Edit / DELETE deactivates (204); duplicate name → 409 |
| GET / POST | /products | Read all; write Admin | ?q=&type=&active=; customers see active only. POST may include variants: [{ attribute, value, extraPrice }] |
| GET / PATCH / DELETE | /products/:id | Read all; write Admin | Includes variants; DELETE deactivates (204) |
| POST | /products/:id/variants | Admin | { attribute, value, extraPrice } |
| PATCH / DELETE | /variants/:id | Admin | Duplicate attribute+value → 409; DELETE of a variant in use → 409 |
| GET / POST | /plans | Read all; write Admin | ?q=&billingPeriod=&active=&available=true (available = active and today's India date in range); customers always get available only |
| GET / PATCH | /plans/:id | Read all; write Admin | billingPeriod can't change once subscriptions use the plan (400) |
| GET / POST | /quotation-templates | Read Admin, Staff; write Admin | ?q=&planId=; list items have lineCount, no lines. POST { name, planId, validityDays, paymentTermsDays?, notes?, lines: [{ productId, variantId?, quantity, unitPrice?, taxId? }] }; quantity below plan minimum → 400 BUSINESS\_RULE |
| GET / PATCH / DELETE | /quotation-templates/:id | Read Admin, Staff; write Admin | PATCH lines replaces all lines; DELETE of a template subscriptions came from → 409 |
| GET | /subscriptions | Admin, Staff, Customer (own) | ?status=&customerId=&planId=&from=&to=&q= (from/to filter startDate; q matches number, customer name, company or email). recurringTotal = preview total |
| POST | /subscriptions | Admin, Staff | { customerId, planId, startDate, expiryDate?, paymentTermsDays?, templateId?, lines?, notes? } → 201 DRAFT detail. No lines + templateId = copy the template's lines and payment terms. Plan must be available today (else 400 BUSINESS\_RULE) |
| GET / PATCH | /subscriptions/:id | GET scoped; PATCH Admin, Staff | PATCH { planId?, startDate?, expiryDate?, paymentTermsDays?, notes? } in DRAFT or QUOTATION only (else 400 INVALID\_TRANSITION); status is never set by PATCH |
| POST | /subscriptions/:id/lines | Admin, Staff | { productId, variantId?, quantity, unitPrice?, taxId? } → 201 subscription detail. unitPrice omitted = product price + variant extra; taxId omitted = product default, null = no tax |
| PATCH / DELETE | /subscriptions/:id/lines/:lineId | Admin, Staff | DRAFT or QUOTATION only; both return the subscription detail (fresh preview). PATCH keeps the agreed unitPrice unless a new one is sent or the variant changes |
| POST | /subscriptions/:id/transition | Scoped | { action } → updated subscription detail. Not allowed from this status → 400 INVALID\_TRANSITION with details.allowed; plan forbids it → 400 BUSINESS\_RULE; customer calling a staff action → 403 |
| GET | /subscriptions/:id/history | Admin, Staff | Paginated, oldest first: [{ id, fromStatus, toStatus, changedBy: { id, name } \| null, changedAt }]; changedBy null = billing job |
| POST | /subscriptions/:id/invoice | Admin, Staff | Bill this subscription now (everything due up to today, same engine, idempotent) → { invoicesCreated }; not ACTIVE → 400 BUSINESS\_RULE |
| GET / POST | /discounts | Read Admin, Staff; write Admin | { name, type, value, scope, minPurchase, minQuantity, startDate, endDate?, usageLimit?, productIds?, subscriptionIds? } |
| GET / PATCH | /discounts/:id | Read Admin, Staff; write Admin | Shows usedCount |
| GET | /invoices | Admin, Staff, Customer (own) | ?status=&overdue=true\|false&customerId=&subscriptionId=&from=&to=&q= (from/to filter invoiceDate; q matches number, bill-to name or email). Sort: invoiceDate (default -invoiceDate), dueDate, number, total, balanceDue, status |
| GET | /invoices/:id | Scoped | Lines + payments |
| POST | /invoices/:id/confirm | Admin, Staff | DRAFT → CONFIRMED → invoice detail. Not DRAFT → 400 INVALID\_TRANSITION; no lines or zero total → 400 BUSINESS\_RULE |
| POST | /invoices/bulk-confirm | Admin, Staff | { ids: ["1", ...] } (max 500) → { confirmed: ["1", ...], skipped: [{ id, reason }] }; each invoice is confirmed on its own |
| POST | /invoices/:id/cancel | Admin, Staff | DRAFT, or CONFIRMED with amountPaid 0 → invoice detail. PAID or CANCELLED → 400 INVALID\_TRANSITION; payments recorded → 400 BUSINESS\_RULE. A used discount slot is not returned |
| POST | /invoices/:id/send | Admin, Staff | Emails PDF; sets sentAt |
| GET | /invoices/:id/pdf | Scoped | application/pdf |
| POST | /invoices/:id/payments | Admin, Staff | { method, amount, paidOn, reference?, note? } → 201 payment. paidOn after today (India date) → 400 VALIDATION\_ERROR on paidOn. Invoice must be CONFIRMED and amount ≤ balanceDue (else 400 BUSINESS\_RULE); the invoice becomes PAID when fully paid |
| GET | /payments | Admin, Staff, Customer (own) | ?method=&from=&to=&invoiceId= (from/to filter paidOn) → [{ id, invoiceId, invoiceNumber, method, amount, paidOn, reference, note, createdAt, recordedBy: { id, name } }]; recordedBy is omitted for customers |
| POST | /billing/run | Admin | { date? } (default today, India date; a future date → 400) → { invoicesCreated, closed, errors: [{ subscriptionId, message }] } |
| GET | /billing/runs | Admin | Paginated, newest first: [{ id, runDate, startedAt, finishedAt, invoicesCreated, subscriptionsClosed, errors, triggeredBy: { id, name } \| null }]; triggeredBy null = scheduler |
| GET | /reports/summary | Admin, Staff | Dashboard cards (shape below). mrr = the sum of subscriptions-by-plan mrr, so card and chart match |
| GET | /reports/revenue | Admin, Staff | ?from=&to= (default: last 12 months incl. this one; max 36 months) → [{ month: "2026-10", amount }], payments received per month, empty months as "0.00" |
| GET | /reports/overdue | Admin, Staff | Paginated, oldest due first: [{ id, number, customerId, subscriptionNumber, billToName, dueDate, daysOverdue, total, amountPaid, balanceDue }] |
| GET | /reports/subscriptions-by-plan | Admin, Staff | [{ planId, planName, billingPeriod, active, mrr }], every plan (active 0 included). mrr = active line amounts per month before discount and tax: yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12 |

**Transition actions:** send\_quote, confirm, revise, activate, pause, resume, close, renew, cancel. Customers may only call pause, resume and close, and only if the plan allows. renew appears in allowedActions only when the plan is renewable and the subscription has an expiry date.

**expiryDate** is the last day of service, inclusive: a period that starts on the expiry date is still billed; nothing starting after it is. It must be after startDate (400 VALIDATION\_ERROR otherwise); null = open-ended. Auto-close happens on the first billing run after the expiry date.

**Response shapes**

```js
// Every list
{ "data": [ /* items */ ], "page": 1, "pageSize": 25, "total": 5000 }

// Every error
{ "error": { "code": "VALIDATION_ERROR", "message": "Quantity below plan minimum", "details": { "field": "quantity" } } }

// User (login, /me, lists)
{ "id": "1", "email": "admin@brightloop.test", "fullName": "Admin", "role": "ADMIN",
  "companyName": null, "phone": null, "address": null, "gstin": null, "isActive": true,
  "createdAt": "2026-10-31T07:00:00.000Z" }

// POST /auth/login
{ "accessToken": "eyJ...", "user": { /* User */ } }

// Product (with variants)
{ "id": "1", "name": "CRM Pro", "type": "SERVICE", "salesPrice": "1000.00", "costPrice": "400.00",
  "defaultTax": { "id": "1", "name": "GST 18%", "rate": "18.00" }, "notes": "", "isActive": true,
  "variants": [ { "id": "1", "attribute": "Brand", "value": "Odoo", "extraPrice": "560.00" } ] }

// Tax
{ "id": "1", "name": "GST 18%", "rate": "18.00", "isActive": true, "createdAt": "2026-10-31T07:00:00.000Z" }

// Quotation template detail (list items: same without lines, plus "lineCount": 1)
{ "id": "1", "name": "CRM Pro: 5 seats (Odoo)", "validityDays": 30, "paymentTermsDays": 15, "notes": null,
  "createdAt": "2026-10-31T07:00:00.000Z",
  "plan": { "id": "3", "name": "CRM Monthly", "billingPeriod": "MONTHLY", "minQuantity": 1 },
  "lines": [ { "id": "1", "product": { "id": "1", "name": "CRM Pro" },
               "variant": { "id": "1", "attribute": "Brand", "value": "Odoo", "extraPrice": "560.00" },
               "quantity": 5, "unitPrice": null, "tax": { "id": "1", "name": "GST 18%", "rate": "18.00" } } ] }
// unitPrice null = product price + variant extra, taken when the subscription line is created

// Plan
{ "id": "3", "name": "CRM Monthly", "price": "1000.00", "billingPeriod": "MONTHLY", "minQuantity": 1,
  "availableFrom": "2026-01-01", "availableTo": null,
  "autoClose": true, "isClosable": true, "isPausable": true, "isRenewable": true, "isActive": true }

// Subscription (list item)
{ "id": "42", "number": "SUB-000042", "customer": { "id": "7", "name": "Acme Ops" },
  "plan": { "id": "3", "name": "CRM Monthly", "billingPeriod": "MONTHLY" },
  "status": "ACTIVE", "startDate": "2026-11-01", "expiryDate": null,
  "nextBillingDate": "2026-12-01", "recurringTotal": "8283.60" }

// Subscription detail = list item, with customer and plan expanded:
//   "customer": { "id", "name", "email", "companyName" },
//   "plan": { "id", "name", "billingPeriod", "minQuantity", "isPausable", "isClosable", "isRenewable", "autoClose" }
// plus:
{ "template": { "id": "1", "name": "CRM Pro: 5 seats (Odoo)" }, "pausedAt": null, "closedAt": null,
  "createdAt": "2026-10-31T07:00:00.000Z",
  "paymentTermsDays": 15, "quotationValidUntil": null, "notes": "",
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

// Invoice detail (list items omit lines and payments; both also carry customerId)
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


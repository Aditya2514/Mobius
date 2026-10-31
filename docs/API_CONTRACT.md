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
| Status codes | 200 OK, 201 created, 204 no body, 400 validation or rule, 401 not logged in, 403 wrong role, 404 not found or not yours, 409 conflict, 429 too many attempts (login, forgot, reset: 5/min per IP) |

**Error codes:** VALIDATION\_ERROR, INVALID\_CREDENTIALS, EMAIL\_TAKEN, UNAUTHENTICATED, FORBIDDEN, NOT\_FOUND, INVALID\_TRANSITION, BUSINESS\_RULE, CONFLICT, RATE\_LIMITED. Validation errors carry details { field, issues: [{ field, message }] }.

**Endpoints**

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | /auth/signup | Public | { email, password, fullName, companyName? } → 201 customer |
| POST | /auth/login | Public | { email, password } → { accessToken, user } + rt cookie |
| POST | /auth/refresh | Cookie | → { accessToken, user }; rotates cookie |
| POST | /auth/logout | Any | Revokes refresh token → 204 |
| POST | /auth/forgot-password | Public | { email } → always 200 { message } |
| POST | /auth/reset-password | Public | { token, newPassword } → 200 { message }; bad or used token → 400 BUSINESS\_RULE |
| GET / PATCH | /me | Any | Own profile |
| GET / POST | /users | Admin | List users ?role= / create staff |
| PATCH | /users/:id | Admin | Edit, deactivate |
| GET / POST | /customers | Admin, Staff | List ?q=&active= / create { email, fullName, password?, companyName?, phone?, address?, gstin? }; no password → customer is emailed a set-password link |
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
| GET / PATCH | /discounts/:id | Read Admin, Staff; write Admin | Shows usedCount |
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
  "companyName": null, "phone": null, "address": null, "gstin": null, "isActive": true,
  "createdAt": "2026-10-31T07:00:00.000Z" }

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


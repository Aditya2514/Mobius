# Mobius API Response Samples

Real API responses generated against the small seed database (`npm run db:seed`).
These samples document the live JSON shapes for all endpoints in `docs/API_CONTRACT.md` and standard error responses.

## Endpoints

| Method | Path | Allowed Roles | Status | Sample File | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/signup` | Public | `201` | [`post-auth-signup.json`](./post-auth-signup.json) |  |
| `POST` | `/auth/login` | Public | `200` | [`post-auth-login.json`](./post-auth-login.json) |  |
| `POST` | `/auth/refresh` | Cookie | `200` | [`post-auth-refresh.json`](./post-auth-refresh.json) |  |
| `POST` | `/auth/logout` | Any | `204` | [`post-auth-logout.json`](./post-auth-logout.json) | 204 No Content |
| `POST` | `/auth/forgot-password` | Public | `200` | [`post-auth-forgot-password.json`](./post-auth-forgot-password.json) |  |
| `POST` | `/auth/reset-password` | Public | `200` | [`post-auth-reset-password.json`](./post-auth-reset-password.json) |  |
| `GET` | `/me` | Any | `200` | [`get-me.json`](./get-me.json) |  |
| `PATCH` | `/me` | Any | `200` | [`patch-me.json`](./patch-me.json) |  |
| `GET` | `/users` | Admin | `200` | [`get-users.json`](./get-users.json) |  |
| `POST` | `/users` | Admin | `201` | [`post-users.json`](./post-users.json) |  |
| `PATCH` | `/users/:id` | Admin | `200` | [`patch-users-id.json`](./patch-users-id.json) |  |
| `GET` | `/customers` | Admin, Staff | `200` | [`get-customers.json`](./get-customers.json) |  |
| `POST` | `/customers` | Admin, Staff | `201` | [`post-customers.json`](./post-customers.json) |  |
| `GET` | `/customers/:id` | Admin, Staff | `200` | [`get-customers-id.json`](./get-customers-id.json) |  |
| `PATCH` | `/customers/:id` | Admin, Staff | `200` | [`patch-customers-id.json`](./patch-customers-id.json) |  |
| `GET` | `/taxes` | Read all | `200` | [`get-taxes.json`](./get-taxes.json) |  |
| `POST` | `/taxes` | Admin | `201` | [`post-taxes.json`](./post-taxes.json) |  |
| `PATCH` | `/taxes/:id` | Admin | `200` | [`patch-taxes-id.json`](./patch-taxes-id.json) |  |
| `DELETE` | `/taxes/:id` | Admin | `204` | [`delete-taxes-id.json`](./delete-taxes-id.json) | 204 No Content (deactivates tax) |
| `GET` | `/products` | Read all | `200` | [`get-products.json`](./get-products.json) |  |
| `POST` | `/products` | Admin | `201` | [`post-products.json`](./post-products.json) |  |
| `GET` | `/products/:id` | Read all | `200` | [`get-products-id.json`](./get-products-id.json) |  |
| `PATCH` | `/products/:id` | Admin | `200` | [`patch-products-id.json`](./patch-products-id.json) |  |
| `DELETE` | `/products/:id` | Admin | `204` | [`delete-products-id.json`](./delete-products-id.json) | 204 No Content (deactivates product) |
| `POST` | `/products/:id/variants` | Admin | `201` | [`post-products-id-variants.json`](./post-products-id-variants.json) |  |
| `PATCH` | `/variants/:id` | Admin | `200` | [`patch-variants-id.json`](./patch-variants-id.json) |  |
| `DELETE` | `/variants/:id` | Admin | `204` | [`delete-variants-id.json`](./delete-variants-id.json) | 204 No Content |
| `GET` | `/plans` | Read all | `200` | [`get-plans.json`](./get-plans.json) |  |
| `POST` | `/plans` | Admin | `201` | [`post-plans.json`](./post-plans.json) |  |
| `GET` | `/plans/:id` | Read all | `200` | [`get-plans-id.json`](./get-plans-id.json) |  |
| `PATCH` | `/plans/:id` | Admin | `200` | [`patch-plans-id.json`](./patch-plans-id.json) |  |
| `GET` | `/quotation-templates` | Admin, Staff | `200` | [`get-quotation-templates.json`](./get-quotation-templates.json) |  |
| `POST` | `/quotation-templates` | Admin | `201` | [`post-quotation-templates.json`](./post-quotation-templates.json) |  |
| `GET` | `/quotation-templates/:id` | Admin, Staff | `200` | [`get-quotation-templates-id.json`](./get-quotation-templates-id.json) |  |
| `PATCH` | `/quotation-templates/:id` | Admin | `200` | [`patch-quotation-templates-id.json`](./patch-quotation-templates-id.json) |  |
| `DELETE` | `/quotation-templates/:id` | Admin | `204` | [`delete-quotation-templates-id.json`](./delete-quotation-templates-id.json) | 204 No Content |
| `GET` | `/subscriptions` | Admin, Staff, Customer | `200` | [`get-subscriptions.json`](./get-subscriptions.json) |  |
| `POST` | `/subscriptions` | Admin, Staff | `201` | [`post-subscriptions.json`](./post-subscriptions.json) |  |
| `GET` | `/subscriptions/:id` | Scoped | `200` | [`get-subscriptions-id.json`](./get-subscriptions-id.json) |  |
| `PATCH` | `/subscriptions/:id` | Admin, Staff | `200` | [`patch-subscriptions-id.json`](./patch-subscriptions-id.json) |  |
| `POST` | `/subscriptions/:id/lines` | Admin, Staff | `201` | [`post-subscriptions-id-lines.json`](./post-subscriptions-id-lines.json) |  |
| `PATCH` | `/subscriptions/:id/lines/:lineId` | Admin, Staff | `200` | [`patch-subscriptions-id-lines-id.json`](./patch-subscriptions-id-lines-id.json) |  |
| `DELETE` | `/subscriptions/:id/lines/:lineId` | Admin, Staff | `200` | [`delete-subscriptions-id-lines-id.json`](./delete-subscriptions-id-lines-id.json) |  |
| `POST` | `/subscriptions/:id/transition` | Scoped | `200` | [`post-subscriptions-id-transition.json`](./post-subscriptions-id-transition.json) |  |
| `GET` | `/subscriptions/:id/history` | Admin, Staff | `200` | [`get-subscriptions-id-history.json`](./get-subscriptions-id-history.json) |  |
| `POST` | `/subscriptions/:id/invoice` | Admin, Staff | `200` | [`post-subscriptions-id-invoice.json`](./post-subscriptions-id-invoice.json) |  |
| `GET` | `/discounts` | Admin, Staff | `200` | [`get-discounts.json`](./get-discounts.json) |  |
| `POST` | `/discounts` | Admin | `201` | [`post-discounts.json`](./post-discounts.json) |  |
| `GET` | `/discounts/:id` | Admin, Staff | `200` | [`get-discounts-id.json`](./get-discounts-id.json) |  |
| `PATCH` | `/discounts/:id` | Admin | `200` | [`patch-discounts-id.json`](./patch-discounts-id.json) |  |
| `GET` | `/invoices` | Admin, Staff, Customer | `200` | [`get-invoices.json`](./get-invoices.json) |  |
| `GET` | `/invoices/:id` | Scoped | `200` | [`get-invoices-id.json`](./get-invoices-id.json) |  |
| `POST` | `/invoices/:id/confirm` | Admin, Staff | `200` | [`post-invoices-id-confirm.json`](./post-invoices-id-confirm.json) |  |
| `POST` | `/invoices/bulk-confirm` | Admin, Staff | `200` | [`post-invoices-bulk-confirm.json`](./post-invoices-bulk-confirm.json) |  |
| `POST` | `/invoices/:id/cancel` | Admin, Staff | `200` | [`post-invoices-id-cancel.json`](./post-invoices-id-cancel.json) |  |
| `POST` | `/invoices/:id/send` | Admin, Staff | `200` | [`post-invoices-id-send.json`](./post-invoices-id-send.json) |  |
| `GET` | `/invoices/:id/pdf` | Scoped | `200` | [`get-invoices-id-pdf.json`](./get-invoices-id-pdf.json) | application/pdf |
| `GET` | `/invoices/:id/print` | Scoped | `200` | [`get-invoices-id-print.json`](./get-invoices-id-print.json) | text/html invoice print view |
| `POST` | `/invoices/:id/payments` | Admin, Staff | `201` | [`post-invoices-id-payments.json`](./post-invoices-id-payments.json) |  |
| `GET` | `/payments` | Admin, Staff, Customer | `200` | [`get-payments.json`](./get-payments.json) |  |
| `POST` | `/billing/run` | Admin | `200` | [`post-billing-run.json`](./post-billing-run.json) |  |
| `GET` | `/billing/runs` | Admin | `200` | [`get-billing-runs.json`](./get-billing-runs.json) |  |
| `GET` | `/reports/summary` | Admin, Staff | `200` | [`get-reports-summary.json`](./get-reports-summary.json) |  |
| `GET` | `/reports/revenue` | Admin, Staff | `200` | [`get-reports-revenue.json`](./get-reports-revenue.json) |  |
| `GET` | `/reports/overdue` | Admin, Staff | `200` | [`get-reports-overdue.json`](./get-reports-overdue.json) |  |
| `GET` | `/reports/subscriptions-by-plan` | Admin, Staff | `200` | [`get-reports-subscriptions-by-plan.json`](./get-reports-subscriptions-by-plan.json) |  |
| `POST` | `/auth/signup` | Public | `400` | [`error-400-validation.json`](./error-400-validation.json) | 400 VALIDATION_ERROR with field and fields |
| `POST` | `/invoices/:id/payments` | Admin, Staff | `400` | [`error-400-business-rule.json`](./error-400-business-rule.json) | 400 BUSINESS_RULE |
| `POST` | `/subscriptions/:id/transition` | Scoped | `400` | [`error-400-invalid-transition.json`](./error-400-invalid-transition.json) | 400 INVALID_TRANSITION with details.allowed |
| `GET` | `/me` | Any | `401` | [`error-401-unauthenticated.json`](./error-401-unauthenticated.json) | 401 UNAUTHENTICATED |
| `POST` | `/auth/refresh` | Cookie | `401` | [`error-401-refresh-retry.json`](./error-401-refresh-retry.json) | 401 UNAUTHENTICATED with details.retry |
| `POST` | `/discounts` | Staff | `403` | [`error-403-forbidden.json`](./error-403-forbidden.json) | 403 FORBIDDEN |
| `GET` | `/customers/:id` | Admin, Staff | `404` | [`error-404-not-found.json`](./error-404-not-found.json) | 404 NOT_FOUND |
| `POST` | `/auth/signup` | Public | `409` | [`error-409-conflict.json`](./error-409-conflict.json) | 409 EMAIL_TAKEN |
| `POST` | `/auth/forgot-password` | Public | `429` | [`error-429-rate-limited.json`](./error-429-rate-limited.json) | 429 RATE_LIMITED |


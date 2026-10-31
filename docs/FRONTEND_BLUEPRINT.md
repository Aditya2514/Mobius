# Frontend Blueprint — Subscription Management System

Oct 31, 2026 · @Aditya

## 1. Your role

You own everything under client/: all 20 screens in React + JavaScript, the mock API that lets you work before the backend is ready, the QA walkthroughs, the README and the demo. The backend person owns server/ and exposes the API in section 4. Their code makes the app correct; yours makes it usable, and the judges see your half first.

**The project in one paragraph.** Brightloop Software sells software on subscription. Today it tracks subscriptions in a spreadsheet, types invoices by hand, matches payments against bank statements and builds revenue reports manually. We build one web app that runs the whole month: an admin sets up products, plans, taxes and discounts; staff turn quotations into subscriptions; invoices are generated automatically on billing day; payments are recorded against invoices; and finance sees active subscriptions, revenue, outstanding and overdue amounts on one dashboard. Customers log in to a portal and see only their own subscriptions and invoices.

**Problem-statement requirements that show up in your screens**

| Requirement | Where it lives in the UI |
| --- | --- |
| Sign-up with unique email; password > 8 chars, upper, lower, special | Sign-up page with live rule checklist |
| Forgot password → reset link by email | Forgot and reset pages |
| Admin / Staff / Customer see different things | Two layouts, role-based menus and route guards |
| Products with variants (Brand Odoo +560), plans with period, min qty, dates, flags | Product form with variants table, plan form |
| Quotation templates; subscriptions moving Draft → Quotation → Confirmed → Active → Closed | Template editor; subscription detail with status bar and action buttons |
| Invoices created automatically; confirm, cancel, send, print | "Run billing now" page; invoice detail actions |
| Discounts: fixed or %, min purchase/qty, dates, usage limit, admin-only | Discounts form (admin menu only) |
| Payments with method, amount, date, note; paid vs outstanding vs overdue | Payment dialog; invoice tabs including Overdue |
| Finance view with filters and summary, under 2 seconds | Dashboard with cards, charts, overdue table |

**What you own vs. what you don't**

| You own | The backend person owns | Shared |
| --- | --- | --- |
| client/ (all code), MSW mocks, UI design, invoice PDF HTML template design, realistic demo-data list (company and plan names), README, demo script, slides, backup recording | server/, database, billing engine, role checks, tests, PDF rendering, emails | docker-compose, AGENTS.md, docs/API\_CONTRACT.md, the four sync points |

**What you need from the backend, and by when**

| By hour | They deliver | What you do then |
| --- | --- | --- |
| 2 | Agreed API\_CONTRACT.md (written together) | Build every screen against MSW mocks of it |
| 10 | Auth, users, customers, catalog, plans, taxes live | Sync 1: switch login and catalog to the real API |
| 20 | Subscriptions, transitions, discounts, billing run | Sync 2: full chain works on the real API |
| 28 | Invoices, payments, reports, 5,000 seeded subscriptions | Sync 3: feature freeze; delete all mocks |

**The three rules that keep your half correct**

1. **Never do money arithmetic.** Show the strings the API sends ("8283.60"). The server computes totals, including the live preview on subscription detail.
2. **Never decide which status buttons appear.** Show exactly the actions in allowedActions from the API.
3. **Never store the access token in localStorage.** Keep it in memory; the httpOnly refresh cookie restores the session.

## 2. Stack and setup

React (the version Vite installs) + Vite + plain JavaScript, with MUI for components, TanStack Query for server data and MSW to mock the API until the backend is ready. Setup takes about 20 minutes in hours 0–2.

| Need | Choice | Package(s) |
| --- | --- | --- |
| Build tool | Vite (React template, JavaScript) | vite, @vitejs/plugin-react |
| Routing | React Router v6 (data router) | react-router-dom |
| Server data | TanStack Query v5 | @tanstack/react-query, @tanstack/react-query-devtools |
| HTTP | axios | axios |
| UI kit | MUI v5/v6 + icons | @mui/material, @emotion/react, @emotion/styled, @mui/icons-material |
| Tables | MUI X DataGrid (free) with server-side pagination | @mui/x-data-grid |
| Date inputs | MUI X Date Pickers + dayjs | @mui/x-date-pickers, dayjs |
| Forms | react-hook-form + zod | react-hook-form, @hookform/resolvers, zod |
| Charts | Recharts | recharts |
| Toasts | notistack | notistack |
| Mock API | MSW v2 (dev only) | msw |

**Setup commands**

```bash
npm create vite@latest client -- --template react
cd client
npm i react-router-dom @tanstack/react-query @tanstack/react-query-devtools axios \
      @mui/material @emotion/react @emotion/styled @mui/icons-material \
      @mui/x-data-grid @mui/x-date-pickers dayjs \
      react-hook-form @hookform/resolvers zod recharts notistack
npm i -D msw
npx msw init public/ --save          # creates public/mockServiceWorker.js
```

**vite.config.js** (the proxy makes the refresh cookie work in development without CORS problems)

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
```

**client/.env.development**

```bash
VITE_API_BASE=/api/v1
VITE_USE_MOCKS=true      # false after Sync 3 (all endpoints live)
VITE_LIVE_PREFIXES=      # endpoints already live, e.g. /auth,/me,/products,/plans (section 8)
```

**Scripts** (Vite defaults are enough): npm run dev (http://localhost:5173), npm run build, npm run preview. Add "lint": "eslint src" if your template includes ESLint.

**Demo logins** (seeded by the backend): admin@brightloop.test, staff@brightloop.test, customer@acme.test, customer2@globex.test, all with password Demo@12345. Put the same users in your MSW mocks so nothing changes when you switch to the real API.

## 3. Folder structure (client/)

One folder per concern: api/ is the only place that knows URLs and field names, pages/ has one folder per screen, and components/ holds the pieces every screen reuses. If a field name changes in the contract, you edit one file in api/.

```text
client/
├─ index.html  vite.config.js  package.json  .env.development
├─ public/mockServiceWorker.js         # generated by `npx msw init`
└─ src/
   ├─ main.jsx                         # providers: Theme, Query, Snackbar, LocalizationProvider, Auth, Router; starts MSW if VITE_USE_MOCKS
   ├─ router.jsx                       # every route + guards (section 5)
   ├─ theme.js                         # MUI theme: colours, typography, component defaults
   ├─ api/
   │  ├─ client.js                     # axios instance, token in memory, refresh interceptor
   │  ├─ queryClient.js                # TanStack QueryClient defaults
   │  ├─ auth.js                       # login, signup, refresh, logout, forgot, reset, me
   │  ├─ users.js  customers.js
   │  ├─ catalog.js                    # products, variants, taxes
   │  ├─ plans.js  templates.js
   │  ├─ subscriptions.js              # list, detail, create, lines, transition, history
   │  ├─ discounts.js
   │  ├─ invoices.js                   # list, detail, confirm, bulkConfirm, cancel, send, pdfUrl
   │  ├─ payments.js  billing.js  reports.js
   ├─ auth/
   │  ├─ AuthContext.jsx               # user, login(), logout(), bootstraps via /auth/refresh
   │  ├─ ProtectedRoute.jsx            # role guard
   │  └─ passwordRules.js              # same rule as the server, plus checklist items
   ├─ layouts/
   │  ├─ AuthLayout.jsx                # centred card for login/sign-up/reset
   │  ├─ AppLayout.jsx                 # sidebar + top bar for Admin and Staff
   │  └─ PortalLayout.jsx              # simple top bar for Customer
   ├─ components/
   │  ├─ DataTable.jsx                 # DataGrid wrapper: server paging, sort, toolbar slot
   │  ├─ FilterBar.jsx                 # search box + selects + date range, synced to URL params
   │  ├─ StatusChip.jsx                # colour per status
   │  ├─ Money.jsx                     # ₹ formatting of API strings
   │  ├─ DateText.jsx                  # "16 Nov 2026"
   │  ├─ ConfirmDialog.jsx             # for cancel/close/delete
   │  ├─ PageHeader.jsx                # title, breadcrumbs, action buttons
   │  ├─ EmptyState.jsx  ErrorState.jsx  LoadingBlock.jsx
   │  ├─ StatCard.jsx                  # dashboard card
   │  └─ form/                         # RHF-bound inputs: TextFieldRHF, SelectRHF, DateRHF, SwitchRHF, MoneyInputRHF
   ├─ hooks/
   │  ├─ useListParams.js              # page/pageSize/sort/filters <-> URL search params
   │  └─ useApiError.js                # error -> toast + field errors
   ├─ utils/format.js                  # money, dates, labels for enums
   ├─ pages/
   │  ├─ auth/        LoginPage.jsx SignupPage.jsx ForgotPasswordPage.jsx ResetPasswordPage.jsx
   │  ├─ dashboard/   DashboardPage.jsx
   │  ├─ customers/   CustomersPage.jsx CustomerFormDrawer.jsx
   │  ├─ products/    ProductsPage.jsx ProductFormPage.jsx VariantsEditor.jsx
   │  ├─ plans/       PlansPage.jsx PlanFormPage.jsx
   │  ├─ taxes/       TaxesPage.jsx
   │  ├─ templates/   TemplatesPage.jsx TemplateFormPage.jsx
   │  ├─ subscriptions/ SubscriptionsPage.jsx SubscriptionDetailPage.jsx SubscriptionCreatePage.jsx LinesEditor.jsx StatusBar.jsx
   │  ├─ discounts/   DiscountsPage.jsx DiscountFormPage.jsx
   │  ├─ invoices/    InvoicesPage.jsx InvoiceDetailPage.jsx RecordPaymentDialog.jsx
   │  ├─ payments/    PaymentsPage.jsx
   │  ├─ billing/     BillingRunsPage.jsx
   │  ├─ users/       UsersPage.jsx
   │  ├─ portal/      MySubscriptionsPage.jsx MyInvoicesPage.jsx MyInvoiceDetailPage.jsx ProfilePage.jsx
   │  └─ NotFoundPage.jsx
   └─ mocks/
      ├─ browser.js                    # setupWorker(...handlers)
      ├─ handlers.js                   # one handler per contract endpoint
      └─ data.js                       # fake users, products, plans, subs, invoices in contract shape
```

**Where code goes**

| Kind of code | Folder | Rule |
| --- | --- | --- |
| URLs, request bodies, response field names | api/ | Pages never call axios directly |
| Server data in a page | api/\*.js hooks (useInvoices, useRecordPayment) | No useEffect + fetch |
| Something two pages share | components/ | If you copy-paste it twice, move it here |
| URL filter state | hooks/useListParams.js | Filters survive refresh and are shareable |
| One screen's own parts | pages/\<screen>/ | Keep them next to the page |

## 4. API contract you build against

This is the same contract as the backend blueprint, word for word. Your mocks, your api/ files and the real server must all match it. If you need a field that isn't here, message the backend person first, then update docs/API\_CONTRACT.md and your mock in the same commit.

**Conventions**

| Rule | Value |
| --- | --- |
| Base path | /api/v1 (proxied by Vite to port 4000) |
| Auth header | Authorization: Bearer \<accessToken>; refresh token in httpOnly cookie rt (you never read it) |
| JSON keys | camelCase |
| IDs | Strings ("42"); never parseInt them |
| Money | Strings with 2 decimals ("8283.60"); display only |
| Dates | "YYYY-MM-DD"; timestamps ISO 8601 UTC |
| Lists | ?page=1&pageSize=25 (max 100)&sort=field or -field → { data, page, pageSize, total } |
| Errors | { error: { code, message, details? } } |
| Status codes | 200, 201, 204, 400 validation or rule, 401 not logged in, 403 wrong role, 404 not found or not yours, 409 conflict |

**Error codes and what the UI does**

| Code | Typical cause | UI behaviour |
| --- | --- | --- |
| VALIDATION\_ERROR | Bad form input | Show details.field message under that field |
| INVALID\_CREDENTIALS | Wrong login | "Email or password is incorrect" under the form |
| EMAIL\_TAKEN | Sign-up duplicate | Error under the email field |
| UNAUTHENTICATED | Token expired and refresh failed | Clear user, go to /login?next=\<current path> |
| FORBIDDEN | Wrong role | Toast "You don't have access" |
| NOT\_FOUND | Missing or not yours | Show the not-found state on the page |
| INVALID\_TRANSITION | Stale buttons | Toast with message, refetch the record |
| BUSINESS\_RULE | E.g. payment above balance | Toast or field error with the server message |
| CONFLICT | Duplicate | Toast with message |

**Endpoints**

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| POST | /auth/signup | Public | { email, password, fullName, companyName? } → 201 customer |
| POST | /auth/login | Public | { email, password } → { accessToken, user } + rt cookie |
| POST | /auth/refresh | Cookie | → { accessToken, user }; rotates cookie |
| POST | /auth/logout | Any | 204 |
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
| GET / PATCH | /subscriptions/:id | Scoped | Header editable in DRAFT or QUOTATION |
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

**Transition actions:** send\_quote, confirm, revise, activate, pause, resume, close, renew, cancel. Button labels: Send quotation, Mark confirmed, Back to draft, Activate, Pause, Resume, Close, Renew, Cancel.

**Enums you will display:** roles ADMIN, STAFF, CUSTOMER · product types SERVICE, GOODS, ADDON · billing periods DAILY, WEEKLY, MONTHLY, YEARLY · subscription status DRAFT, QUOTATION, CONFIRMED, ACTIVE, PAUSED, CLOSED · invoice status DRAFT, CONFIRMED, PAID, CANCELLED (+ isOverdue flag) · discount type FIXED, PERCENTAGE · scope PRODUCT, SUBSCRIPTION · payment methods CASH, BANK\_TRANSFER, UPI, CARD, CHEQUE, OTHER.

**Response shapes**

```js
// Every list
{ "data": [ /* items */ ], "page": 1, "pageSize": 25, "total": 5000 }

// Every error
{ "error": { "code": "VALIDATION_ERROR", "message": "Quantity below plan minimum", "details": { "field": "quantity" } } }

// User
{ "id": "1", "email": "admin@brightloop.test", "fullName": "Admin", "role": "ADMIN",
  "companyName": null, "isActive": true }

// POST /auth/login and /auth/refresh
{ "accessToken": "eyJ...", "user": { /* User */ } }

// Product
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

## 5. Core infrastructure code

Build these nine files before any screen, in hours 2–10. Every one of the 20 screens is built from them, so a bug fixed here is fixed everywhere.

**1. api/client.js** — token in memory, automatic refresh on 401, one refresh at a time

```js
import axios from 'axios';

let accessToken = null;
let onSessionExpired = () => {};
export const setAccessToken = (t) => { accessToken = t; };
export const setSessionExpiredHandler = (fn) => { onSessionExpired = fn; };

export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE, withCredentials: true });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing = null;
/** one refresh call at a time, shared by the interceptor and AuthContext */
export function refreshSession() {
  refreshing ??= api.post('/auth/refresh').finally(() => { refreshing = null; });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const { data } = await refreshSession();
        setAccessToken(data.accessToken);
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionExpired();
      }
    }
    return Promise.reject(err);
  }
);

/** normalise any error into { code, message, field } for the UI */
export function toApiError(err) {
  const e = err?.response?.data?.error;
  return { code: e?.code ?? 'NETWORK', message: e?.message ?? 'Something went wrong. Try again.',
           field: e?.details?.field };
}
```

**2. auth/AuthContext.jsx** — restores the session on page load with the refresh cookie

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    refreshSession()   // shared promise: React StrictMode runs this effect twice in dev
      .then(({ data }) => { setAccessToken(data.accessToken); setUser(data.user); })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } finally { setAccessToken(null); setUser(null); }
  };

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
export const homeFor = (role) => (role === 'CUSTOMER' ? '/portal' : '/app');
```

**Why refreshSession() is shared:** in development React StrictMode runs effects twice. Two parallel /auth/refresh calls would present the same refresh token twice, and the server treats a reused token as theft and logs the user out. One shared promise prevents that.

**3. auth/ProtectedRoute.jsx**

```jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeFor } from './AuthContext';
import LoadingBlock from '../components/LoadingBlock';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <LoadingBlock fullPage />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
```

**4. router.jsx** — every route in one place

```jsx
export const router = createBrowserRouter([
  { element: <AuthLayout />, children: [
    { path: '/login', element: <LoginPage /> },
    { path: '/signup', element: <SignupPage /> },
    { path: '/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/reset-password', element: <ResetPasswordPage /> },
  ]},
  { element: <ProtectedRoute roles={['ADMIN', 'STAFF']} />, children: [
    { path: '/app', element: <AppLayout />, children: [
      { index: true, element: <DashboardPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'subscriptions', element: <SubscriptionsPage /> },
      { path: 'subscriptions/new', element: <SubscriptionCreatePage /> },
      { path: 'subscriptions/:id', element: <SubscriptionDetailPage /> },
      { path: 'invoices', element: <InvoicesPage /> },
      { path: 'invoices/:id', element: <InvoiceDetailPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'products', element: <ProductsPage /> },          // staff: read-only
      { path: 'plans', element: <PlansPage /> },
      { path: 'templates', element: <TemplatesPage /> },
      { path: 'discounts', element: <DiscountsPage /> },
      { element: <ProtectedRoute roles={['ADMIN']} />, children: [
        { path: 'products/new', element: <ProductFormPage /> },
        { path: 'products/:id/edit', element: <ProductFormPage /> },
        { path: 'plans/new', element: <PlanFormPage /> },
        { path: 'plans/:id/edit', element: <PlanFormPage /> },
        { path: 'templates/new', element: <TemplateFormPage /> },
        { path: 'templates/:id/edit', element: <TemplateFormPage /> },
        { path: 'discounts/new', element: <DiscountFormPage /> },
        { path: 'discounts/:id/edit', element: <DiscountFormPage /> },
        { path: 'taxes', element: <TaxesPage /> },
        { path: 'users', element: <UsersPage /> },
        { path: 'billing', element: <BillingRunsPage /> },
      ]},
    ]},
  ]},
  { element: <ProtectedRoute roles={['CUSTOMER']} />, children: [
    { path: '/portal', element: <PortalLayout />, children: [
      { index: true, element: <MySubscriptionsPage /> },
      { path: 'invoices', element: <MyInvoicesPage /> },
      { path: 'invoices/:id', element: <MyInvoiceDetailPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ]},
  ]},
  { path: '/', element: <RootRedirect /> },   // → /login or homeFor(user.role)
  { path: '*', element: <NotFoundPage /> },
]);
```

**5. main.jsx** — providers and optional mocks

```jsx
async function enableMocks() {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

enableMocks().then(() => {
  createRoot(document.getElementById('root')).render(
    <ThemeProvider theme={theme}><CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <SnackbarProvider maxSnack={3} autoHideDuration={4000}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider><RouterProvider router={router} /></AuthProvider>
          </QueryClientProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
});
// api/queryClient.js: new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1,
//   refetchOnWindowFocus: false } } })
```

**6. Data hooks pattern** (api/invoices.js; copy for every resource)

```js
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from './client';

export const useInvoices = (params) => useQuery({
  queryKey: ['invoices', params],
  queryFn: () => api.get('/invoices', { params }).then((r) => r.data),
  placeholderData: keepPreviousData,                 // no flicker while paging
});

export const useInvoice = (id) => useQuery({
  queryKey: ['invoice', id],
  queryFn: () => api.get(`/invoices/${id}`).then((r) => r.data),
});

const useInvoiceAction = (fn) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
};
export const useConfirmInvoice = () => useInvoiceAction((id) => api.post(`/invoices/${id}/confirm`));
export const useCancelInvoice  = () => useInvoiceAction((id) => api.post(`/invoices/${id}/cancel`));
export const useSendInvoice    = () => useInvoiceAction((id) => api.post(`/invoices/${id}/send`));
export const useBulkConfirm    = () => useInvoiceAction((ids) => api.post('/invoices/bulk-confirm', { ids }));
export const useRecordPayment  = (id) => useInvoiceAction((body) => api.post(`/invoices/${id}/payments`, body));
export const invoicePdfUrl = (id) => `${import.meta.env.VITE_API_BASE}/invoices/${id}/pdf`;
```

The PDF endpoint needs the Authorization header, so fetch it with api.get(url, { responseType: 'blob' }) and open URL.createObjectURL(blob) in a new tab, rather than linking to the URL directly.

**7. hooks/useListParams.js** — paging, sorting and filters live in the URL

```js
import { useSearchParams } from 'react-router-dom';

export function useListParams(defaults = {}) {
  const [sp, setSp] = useSearchParams();
  const fromUrl = Object.fromEntries(sp.entries());
  const params = { ...defaults, ...fromUrl,
                   page: Number(fromUrl.page ?? 1), pageSize: Number(fromUrl.pageSize ?? 25) };
  const setParams = (patch) => setSp((prev) => {
    const next = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null || v === '') next.delete(k); else next.set(k, String(v));
    }
    if (!('page' in patch)) next.set('page', '1');   // any filter change → back to page 1
    return next;
  });
  return [params, setParams];
}
```

**8. components/DataTable.jsx** — MUI DataGrid in server mode

```jsx
import { DataGrid } from '@mui/x-data-grid';

export default function DataTable({ columns, query, params, setParams, onRowClick, ...rest }) {
  const sortField = params.sort?.replace(/^-/, '');
  return (
    <DataGrid
      rows={query.data?.data ?? []}
      columns={columns}
      rowCount={query.data?.total ?? 0}
      loading={query.isFetching}
      paginationMode="server"
      sortingMode="server"
      paginationModel={{ page: params.page - 1, pageSize: params.pageSize }}
      onPaginationModelChange={(m) => setParams({ page: m.page + 1, pageSize: m.pageSize })}
      sortModel={sortField ? [{ field: sortField, sort: params.sort.startsWith('-') ? 'desc' : 'asc' }] : []}
      onSortModelChange={(m) => setParams({ sort: m[0] ? `${m[0].sort === 'desc' ? '-' : ''}${m[0].field}` : undefined })}
      pageSizeOptions={[25, 50, 100]}
      disableColumnFilter
      disableRowSelectionOnClick
      onRowClick={onRowClick ? (p) => onRowClick(p.row) : undefined}
      autoHeight
      {...rest}
    />
  );
}
```

**9. Money, StatusChip and format helpers**

```jsx
// components/Money.jsx
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export default function Money({ value }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value == null ? '—' : inr.format(Number(value))}</span>;
}

// components/StatusChip.jsx
const MAP = {
  DRAFT: ['Draft', 'default'], QUOTATION: ['Quotation', 'info'], CONFIRMED: ['Confirmed', 'secondary'],
  ACTIVE: ['Active', 'success'], PAUSED: ['Paused', 'warning'], CLOSED: ['Closed', 'default'],
  PAID: ['Paid', 'success'], CANCELLED: ['Cancelled', 'default'], OVERDUE: ['Overdue', 'error'],
};
export default function StatusChip({ status, overdue }) {
  const [label, color] = MAP[overdue ? 'OVERDUE' : status] ?? [status, 'default'];
  return <Chip size="small" label={label} color={color} variant={status === 'CLOSED' ? 'outlined' : 'filled'} />;
}
```

Number() inside Money is only for display formatting. Never add, subtract or multiply amounts in the client.

## 6. Screen-by-screen spec

There are 20 screens. Five carry the demo (sign-up, subscription detail, invoice detail with the payment dialog, billing runs, dashboard), so they get the polish; the catalog screens can stay plain forms.

### All screens

| # | Screen | Route | Roles | API calls | Shows | Actions and rules |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Login | /login | Public | POST /auth/login | Email, password, links to sign-up and forgot | On success go to ?next or homeFor(role); show INVALID\_CREDENTIALS under the form |
| 2 | Sign up | /signup | Public | POST /auth/signup | Full name, company, email, password, confirm password, live rule checklist | Submit disabled until all 4 rules pass and passwords match; EMAIL\_TAKEN under email; then auto-login |
| 3 | Forgot / reset password | /forgot-password, /reset-password?token= | Public | POST /auth/forgot-password, /auth/reset-password | Email form; new password + checklist | Always show "If that email exists, a link is on its way"; after reset go to /login with a success toast |
| 4 | Dashboard | /app | Admin, Staff | GET /reports/summary, /reports/revenue, /reports/overdue, /reports/subscriptions-by-plan | 5 stat cards, revenue-by-month bar chart, subscriptions-by-plan table, top 10 overdue | Date-range filter for revenue; click an overdue row → invoice detail |
| 5 | Customers | /app/customers | Admin, Staff | GET/POST /customers, PATCH /customers/:id | Table: name, company, email, active subs, created | Create/edit in a side drawer; search box |
| 6 | Products | /app/products, /new, /:id/edit | Read Admin, Staff; edit Admin | GET/POST/PATCH /products, POST /products/:id/variants, PATCH/DELETE /variants/:id | Table: name, type, sales price, cost price, variants count; form with variants sub-table | Variant row = attribute, value, extra price; staff see no Create/Edit buttons |
| 7 | Plans | /app/plans, /new, /:id/edit | Read Admin, Staff; edit Admin | GET/POST/PATCH /plans | Table: name, price, period, min qty, availability, flags as icons | Form: period select, min qty, available from/to, 4 switches (auto-close, closable, pausable, renewable) |
| 8 | Taxes | /app/taxes | Admin | GET/POST/PATCH/DELETE /taxes | Small table: name, rate %, active | Inline add and edit |
| 9 | Quotation templates | /app/templates, /new, /:id/edit | Read Admin, Staff; edit Admin | /quotation-templates | Table: name, plan, validity days, lines count | Form: plan, validity days, payment terms, lines editor (product, variant, qty, price, tax) |
| 10 | Subscriptions list | /app/subscriptions | Admin, Staff | GET /subscriptions | Status tabs: All, Draft, Quotation, Confirmed, Active, Paused, Closed; columns: number, customer, plan, status, start, next billing, recurring total | Search, customer and plan filters, date range; "New subscription" button |
| 11 | New subscription | /app/subscriptions/new | Admin, Staff | GET /customers, /plans?available=true, /quotation-templates; POST /subscriptions | Customer, plan, start date, expiry, payment terms, optional template | "Start from template" fills plan and lines; creates DRAFT and goes to detail |
| 12 | Subscription detail | /app/subscriptions/:id | Admin, Staff | GET /subscriptions/:id, /history, /invoices?subscriptionId=; lines endpoints; POST /transition, /invoice | See below | See below |
| 13 | Discounts | /app/discounts, /new, /:id/edit | Read Admin, Staff; edit Admin | /discounts, GET /products, /subscriptions | Table: name, type, value, scope, dates, "used 4 / 100" progress | Form: type, value (% or ₹), scope, target products or subscriptions (multi-select), min purchase, min qty, start/end, usage limit |
| 14 | Invoices list | /app/invoices | Admin, Staff | GET /invoices; POST /invoices/bulk-confirm | Tabs: Draft, Confirmed, Overdue (overdue=true), Paid, Cancelled; columns: number, customer, subscription, invoice date, due date, total, balance, status | Checkbox selection on Draft tab → "Confirm selected" |
| 15 | Invoice detail + payment dialog | /app/invoices/:id | Admin, Staff | GET /invoices/:id; confirm, cancel, send, pdf, payments | See below | See below |
| 16 | Payments | /app/payments | Admin, Staff | GET /payments | Columns: date, invoice, customer, method, amount, reference, recorded by | Filters: method, date range; row → invoice |
| 17 | Billing runs | /app/billing | Admin | POST /billing/run, GET /billing/runs | "Run billing now" button with date picker (default today), runs table: date, invoices created, closed, errors, who | After a run, toast "312 invoices created, 4 subscriptions closed"; a second run on the same date shows "0 invoices created" (this is the demo moment) |
| 18 | Users | /app/users | Admin | GET/POST /users, PATCH /users/:id | Table: name, email, role, active | "Add staff" dialog (name, email, temporary password with checklist); deactivate toggle |
| 19 | Portal: my subscriptions | /portal | Customer | GET /subscriptions, POST /transition | Cards: number, plan, status, next billing date, recurring total, lines summary | Buttons only from allowedActions (pause, resume, close), each with a confirm dialog |
| 20 | Portal: my invoices + detail | /portal/invoices, /portal/invoices/:id | Customer | GET /invoices, /invoices/:id, /pdf | Table: number, date, due, total, balance, status; detail read-only with payments | "Download PDF"; overdue rows highlighted; profile page at /portal/profile (PATCH /me) |

Also build a NotFound page and a root redirect (/ → /login or the user's home).

### Subscription detail (screen 12)

| Area | Content |
| --- | --- |
| Header | Number, StatusChip, customer link, plan name and period |
| Status bar | Horizontal stepper Draft → Quotation → Confirmed → Active → Closed, current step highlighted; Paused shown as a warning chip when paused |
| Action buttons | One button per item in allowedActions, in this order: send\_quote, confirm, activate, pause, resume, renew, revise, close, cancel. close and cancel open ConfirmDialog. After success: toast and refetch |
| "Bill now" button | Admin, Staff, only when status is ACTIVE → POST /subscriptions/:id/invoice → toast with the invoice number and a link |
| Details card | Start date, expiry, payment terms, quotation valid until, next billing date; editable only in DRAFT or QUOTATION |
| Lines editor | Table: product, variant, quantity, unit price, tax. Add/edit/delete only in DRAFT or QUOTATION; product select loads its variants; quantity validated ≥ plan minQuantity (server is final) |
| Totals box | preview.subtotal, discountTotal, taxTotal, total from the API, refetched after every line change. Never computed in the browser |
| Tabs | Invoices (this subscription's invoices) · History (status changes with who and when) |

### Invoice detail and payment dialog (screen 15)

| Area | Content |
| --- | --- |
| Header | Number, StatusChip (Overdue if isOverdue), customer, subscription link, period, invoice and due dates |
| Actions | DRAFT: Confirm, Cancel. CONFIRMED: Record payment, Send, Print/PDF, Cancel (only if amountPaid is "0.00"). PAID: Print/PDF. CANCELLED: none |
| Lines table | Description, qty, unit price, subtotal, discount, tax name, tax, line total |
| Totals | Subtotal, discount (shown as negative), tax, total, amount paid, balance due (bold, red if overdue) |
| Payments list | Date, method, amount, reference, note |
| Payment dialog | Method select, amount (prefilled with balanceDue), paid on (default today), reference, note. Client check: amount > 0. Server enforces ≤ balance; show its BUSINESS\_RULE message. On success: toast, close, refetch; status turns PAID when fully paid |

### Dashboard (screen 4)

| Element | Data | Notes |
| --- | --- | --- |
| Cards | Active subscriptions, Revenue this month, Outstanding, Overdue (count + amount), MRR | Overdue card links to /app/invoices?tab=overdue |
| Revenue by month | /reports/revenue, last 12 months | Recharts BarChart; y-axis in ₹ lakhs if large |
| Subscriptions by plan | /reports/subscriptions-by-plan | Table: plan, active count, MRR |
| Overdue invoices | /reports/overdue, top 10 | Number, customer, due date, days overdue, balance |
| Response time | Small grey text "Loaded in 180 ms" from the request timing | Proves the 2-second requirement during the demo |

### Sidebar menu by role

| Menu item | Admin | Staff |
| --- | --- | --- |
| Dashboard, Customers, Subscriptions, Invoices, Payments | Yes | Yes |
| Products, Plans, Templates, Discounts | Yes (edit) | Yes (read-only) |
| Taxes, Users, Billing runs | Yes | Hidden |

## 7. Business rules the UI must reflect

The server enforces every rule; the UI's job is to explain them before the user hits an error. Where the two could disagree, the server wins, and the UI shows its message.

### Password rule (same as the server)

```js
// src/auth/passwordRules.js
import { z } from 'zod';

export const PASSWORD_CHECKS = [
  { id: 'len',   label: 'More than 8 characters',     test: (p) => p.length >= 9 },
  { id: 'lower', label: 'A lowercase letter',          test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter',         test: (p) => /[A-Z]/.test(p) },
  { id: 'special', label: 'A special character (!@#…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const passwordSchema = z.string()
  .min(9, 'Must be more than 8 characters')
  .regex(/[a-z]/, 'Needs a lowercase letter')
  .regex(/[A-Z]/, 'Needs an uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Needs a special character');

export const signupSchema = z.object({
  fullName: z.string().min(2, 'Enter your name'),
  companyName: z.string().optional(),
  email: z.string().email('Enter a valid email'),
  password: passwordSchema,
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
```

Render PASSWORD\_CHECKS as a list under the password field with a green tick or grey circle per rule, updated on every keystroke (watch('password') from react-hook-form).

### Rules by area

| Area | Rule | How the UI shows it |
| --- | --- | --- |
| Money | Amounts are strings from the API; never computed in the browser | Always render with \<Money>; totals come from preview or the invoice |
| Status buttons | Only the actions in allowedActions are possible | Render buttons from that array; never hard-code by status |
| Editing a subscription | Header and lines editable only in DRAFT or QUOTATION | Inputs disabled with a hint "Locked after confirmation" |
| Minimum quantity | Quantity ≥ plan.minQuantity | Helper text "Minimum 5 for this plan"; server error shown if violated |
| Plan availability | Only plans available today can be chosen | Plan select uses /plans?available=true |
| Quotation validity | A quotation expires after quotationValidUntil | Show "Valid until 30 Nov 2026"; if past, show a warning chip; Confirm will fail on the server |
| Overdue | Derived by the server (isOverdue) | Red Overdue chip replaces Confirmed; balance in red; Overdue tab uses overdue=true |
| Invoice actions | Confirm only DRAFT; cancel only DRAFT or unpaid CONFIRMED; payments only CONFIRMED | Show only valid buttons per the invoice table in section 6 |
| Payment amount | 0 < amount ≤ balanceDue | Prefill with balanceDue; inline error if 0 or empty; server message if above balance |
| Discounts | Admin only; percentage ≤ 100; fixed in ₹ | Value field suffix switches between % and ₹; staff see the list read-only |
| Discount usage | Stops automatically at usageLimit or endDate | Show "Used 4 / 100" with a progress bar; "Expired" or "Used up" chip |
| Roles | Admin everything; Staff no taxes, users, billing runs, catalog edits; Customer portal only | Menu items and buttons hidden per role (section 6); server still checks |
| Variants | Price = product price + variant extra | Show "Odoo (+₹560)" in variant selects; the server stores the final unit price |
| Dates | API dates are "YYYY-MM-DD" | Display with dayjs as "16 Nov 2026"; send back as "YYYY-MM-DD" (dayjs(d).format('YYYY-MM-DD')) |
| IDs | Strings | Never parseInt; compare as strings |

### Status colours (consistent everywhere)

| Status | Colour (MUI) | Meaning |
| --- | --- | --- |
| Draft | default (grey) | Being prepared |
| Quotation | info (blue) | Sent to customer |
| Confirmed | secondary (purple) | Accepted, not yet running / invoice awaiting payment |
| Active | success (green) | Being billed |
| Paused | warning (amber) | Not billed |
| Closed | default outlined | Ended |
| Paid | success (green) | Fully paid |
| Overdue | error (red) | Confirmed, unpaid, past due |
| Cancelled | default (grey) | Void |

## 8. MSW mocks: working before the backend is ready

MSW intercepts requests in the browser and answers with fake data in the exact contract shape, so you build every screen from hour 2 without waiting. At each sync point you switch more endpoints to the real server, and at hour 28 you delete the mocks folder.

**mocks/browser.js** — mock only what isn't live yet

```js
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// endpoints already live on the real server (update at each sync point)
const LIVE = (import.meta.env.VITE_LIVE_PREFIXES ?? '').split(',').filter(Boolean);
// e.g. VITE_LIVE_PREFIXES=/auth,/me,/products,/plans,/taxes,/customers,/users

const active = handlers.filter((h) => !LIVE.some((p) => h.info.path.toString().includes(`/api/v1${p}`)));
export const worker = setupWorker(...active);
```

**mocks/handlers.js** — one handler per contract endpoint (examples)

```js
import { http, HttpResponse, delay } from 'msw';
import { db, paginate } from './data';

const A = '/api/v1';
const err = (status, code, message, details) =>
  HttpResponse.json({ error: { code, message, details } }, { status });

export const handlers = [
  http.post(`${A}/auth/login`, async ({ request }) => {
    const { email, password } = await request.json();
    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || password !== 'Demo@12345') return err(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    sessionStorage.setItem('mockUser', user.id);
    return HttpResponse.json({ accessToken: 'mock-token', user });
  }),
  http.post(`${A}/auth/refresh`, () => {
    const id = sessionStorage.getItem('mockUser');
    const user = db.users.find((u) => u.id === id);
    return user ? HttpResponse.json({ accessToken: 'mock-token', user })
                : err(401, 'UNAUTHENTICATED', 'Login required');
  }),
  http.post(`${A}/auth/logout`, () => { sessionStorage.removeItem('mockUser');
                                        return new HttpResponse(null, { status: 204 }); }),

  http.get(`${A}/invoices`, async ({ request }) => {
    await delay(300);                                   // feel real loading states
    const u = new URL(request.url);
    let rows = db.invoices;
    if (u.searchParams.get('status')) rows = rows.filter((i) => i.status === u.searchParams.get('status'));
    if (u.searchParams.get('overdue') === 'true') rows = rows.filter((i) => i.isOverdue);
    return HttpResponse.json(paginate(rows, u));
  }),
  http.get(`${A}/invoices/:id`, ({ params }) => {
    const inv = db.invoices.find((i) => i.id === params.id);
    return inv ? HttpResponse.json(inv) : err(404, 'NOT_FOUND', 'Invoice not found');
  }),
  http.post(`${A}/invoices/:id/payments`, async ({ params, request }) => {
    const body = await request.json();
    const inv = db.invoices.find((i) => i.id === params.id);
    if (inv.status !== 'CONFIRMED') return err(400, 'BUSINESS_RULE', 'Only confirmed invoices accept payments');
    if (Number(body.amount) > Number(inv.balanceDue))
      return err(400, 'BUSINESS_RULE', `Amount must be between 0.01 and ${inv.balanceDue}`);
    // mock-only arithmetic; the real server does this with decimals
    inv.amountPaid = (Number(inv.amountPaid) + Number(body.amount)).toFixed(2);
    inv.balanceDue = (Number(inv.total) - Number(inv.amountPaid)).toFixed(2);
    if (inv.balanceDue === '0.00') inv.status = 'PAID';
    inv.payments.push({ id: String(Date.now()), ...body });
    return HttpResponse.json(inv.payments.at(-1), { status: 201 });
  }),

  http.post(`${A}/subscriptions/:id/transition`, async ({ params, request }) => {
    const { action } = await request.json();
    const sub = db.subscriptions.find((s) => s.id === params.id);
    const next = { send_quote: 'QUOTATION', confirm: 'CONFIRMED', activate: 'ACTIVE', pause: 'PAUSED',
                   resume: 'ACTIVE', close: 'CLOSED', revise: 'DRAFT', cancel: 'CLOSED', renew: 'ACTIVE' }[action];
    if (!sub.allowedActions.includes(action))
      return err(400, 'INVALID_TRANSITION', `Cannot ${action} from ${sub.status}`, { allowed: sub.allowedActions });
    sub.status = next;
    sub.allowedActions = db.allowedFor(next);
    return HttpResponse.json(sub);
  }),
  // ...one handler for every other endpoint in section 4
];
```

**mocks/data.js** — fake data in contract shape

```js
export const db = {
  users: [
    { id: '1', email: 'admin@brightloop.test', fullName: 'Asha Admin', role: 'ADMIN', companyName: null, isActive: true },
    { id: '2', email: 'staff@brightloop.test', fullName: 'Sam Staff', role: 'STAFF', companyName: null, isActive: true },
    { id: '3', email: 'customer@acme.test', fullName: 'Acme Ops', role: 'CUSTOMER', companyName: 'Acme Pvt Ltd', isActive: true },
  ],
  products: [/* CRM Pro with variant Brand Odoo +560, etc. */],
  plans: [/* CRM Monthly, CRM Yearly, Helpdesk Weekly, Analytics Daily */],
  subscriptions: [/* 30 items across all statuses, with lines, preview and allowedActions */],
  invoices: [/* 60 items: drafts, confirmed, some isOverdue, paid, cancelled; INV-000501 = the 8283.60 example */],
  allowedFor: (s) => ({ DRAFT: ['send_quote', 'cancel'], QUOTATION: ['confirm', 'revise', 'cancel'],
                        CONFIRMED: ['activate'], ACTIVE: ['pause', 'close', 'renew'],
                        PAUSED: ['resume', 'close'], CLOSED: [] }[s]),
};

export function paginate(rows, url) {
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
  return { data: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length };
}
```

**Mock rules**

- Every mock response must match section 4 exactly, including string money and string IDs. A mock that cheats hides bugs until integration.
- Include the error cases (401, 404, BUSINESS\_RULE, INVALID\_TRANSITION) so your error UI is built and tested early.
- Add a 200–400 ms delay so loading states are visible and designed.
- Use the same demo users and the same ₹8,283.60 example invoice as the real seed, so the switch to the real API changes nothing on screen.
- The arithmetic in the payment mock exists only to simulate the server. It never moves into src/.

## 9. UX standards

Judges form an opinion in the first minute, mostly from consistency: every page loads, fails and confirms the same way. These standards make that automatic.

### Every data page has four states

| State | What to show | Component |
| --- | --- | --- |
| Loading (first load) | Skeleton rows or a spinner in the content area, never a blank page | LoadingBlock |
| Refetching | Thin progress bar on the table (DataGrid loading), keep old rows visible | keepPreviousData |
| Empty | Icon, one sentence, the primary action ("No subscriptions yet — Create subscription") | EmptyState |
| Error | Message from toApiError + "Try again" button calling refetch() | ErrorState |

### Forms

- react-hook-form + zodResolver for every form; validate on blur, re-validate on change after the first submit.
- Show field errors under the field (helperText), from Zod first and then from the server (details.field → setError).
- Disable the submit button while the mutation is pending and show a spinner in it. Never allow a double submit.
- Required fields marked with \*. Date fields use MUI DatePicker with format DD MMM YYYY.
- After a successful create, navigate to the new record's detail page; after an edit, stay and show a toast.

```js
// hooks/useApiError.js
export function useApiError(setError) {
  const { enqueueSnackbar } = useSnackbar();
  return (err) => {
    const e = toApiError(err);
    if (e.field && setError) setError(e.field, { message: e.message });
    else enqueueSnackbar(e.message, { variant: 'error' });
  };
}
```

### Feedback

| Event | Feedback |
| --- | --- |
| Create, update, transition, payment, billing run | Success toast naming the thing ("Invoice INV-000501 confirmed") |
| Destructive action (cancel invoice, close or cancel subscription, deactivate user, delete variant) | ConfirmDialog stating the consequence ("This cancels INV-000501. It can't be undone.") |
| Server rule error | Error toast with the server's message, unchanged |
| Session expired | Redirect to /login?next=… with an info toast "Please log in again" |

### Layout and look

- AppLayout: left sidebar (240 px, collapsible), top bar with page title, user menu (name, role, logout). PortalLayout: top bar only, max width 960 px.
- PageHeader on every page: title, short subtitle, primary action on the right.
- One accent colour (theme primary), status colours from section 7, everything else neutral grey.
- Numbers right-aligned in tables with tabular figures; money always through \<Money>.
- Works at 1280 px and above; the portal must also work on a phone (judges may try it).
- Product name and tagline in the sidebar and login card. Choose the name with your teammate (one suggestion was BillLoop).

### Accessibility basics

- Every input has a label; icon-only buttons have aria-label and a tooltip.
- Status is never shown by colour alone: chips always carry the word.
- Focus returns to the triggering button when a dialog closes (MUI does this by default; don't break it).

## 10. Your task checklist

The work runs in five phases with four sync points, assuming 36 hours (rescale if your deadline differs). You never wait for the backend: anything not live yet runs on mocks.

### Phase 0 — hours 0–2, together with the backend person

- [ ] Create the repo, docker-compose, AGENTS.md, docs/BUILD\_PLAN.md and this blueprint
- [ ] Write docs/API\_CONTRACT.md from section 4; both agree and commit
- [ ] Scaffold client/ (section 2), install packages, msw init, Vite proxy
- [ ] Give the backend person a list of 20 realistic company names, 6 product names and 4 plan names for the seed

### Phase 1 — hours 2–10: foundation and auth

- [ ] theme.js, main.jsx providers, router.jsx with all routes (placeholder pages)
- [ ] api/client.js, queryClient.js, AuthContext, ProtectedRoute, homeFor redirect
- [ ] AuthLayout, AppLayout (role-based sidebar), PortalLayout
- [ ] Login, Sign up (live password checklist), Forgot password, Reset password
- [ ] DataTable, FilterBar, useListParams, StatusChip, Money, DateText, PageHeader, ConfirmDialog, Empty/Error/Loading states, form/ inputs
- [ ] MSW handlers and data for every endpoint in section 4
- [ ] **Sync 1 (h10):** set VITE\_LIVE\_PREFIXES=/auth,/me,/users,/customers,/products,/variants,/plans,/taxes,/quotation-templates and test login as all three roles on the real API

### Phase 2 — hours 10–20: catalog and subscriptions

- [ ] Products (with VariantsEditor), Plans, Taxes, Customers, Users screens on the real API
- [ ] Quotation templates list and form
- [ ] Subscriptions list with status tabs and filters
- [ ] New subscription (with "start from template")
- [ ] Subscription detail: status bar, allowedActions buttons, lines editor, totals from preview, invoices and history tabs
- [ ] Discounts list and form
- [ ] **Sync 2 (h20):** add /subscriptions,/discounts,/billing to LIVE; walk the chain with the backend person: plan → subscription → activate → bill now → invoice appears

### Phase 3 — hours 20–28: invoices, payments, dashboard, portal

- [ ] Invoices list with tabs (incl. Overdue) and bulk confirm
- [ ] Invoice detail with actions, PDF download, RecordPaymentDialog
- [ ] Payments list
- [ ] Billing runs page with "Run billing now"
- [ ] Dashboard: cards, revenue chart, subscriptions-by-plan, overdue table, response-time note
- [ ] Portal: my subscriptions (allowed actions), my invoices, invoice detail, profile
- [ ] Invoice PDF HTML template (hand it to the backend person for Puppeteer)
- [ ] **Sync 3 (h28): feature freeze.** VITE\_USE\_MOCKS=false, delete src/mocks, everything on the real API

### Phase 4 — hours 28–34: QA and polish

- [ ] Run the QA walkthrough in section 11 as Admin, Staff and Customer; log bugs in a shared list
- [ ] Fix UI bugs; send API bugs to the backend person with the request and response
- [ ] Empty, loading and error states on every page
- [ ] README (section 11)
- [ ] **Sync 4 (h34):** zero known blockers

### Phase 5 — hours 34–36: demo

- [ ] Rehearse the demo script twice with the backend person
- [ ] Record a backup screen video of the full demo
- [ ] Log out of everything, reset browser zoom, close other tabs before presenting

**If you fall behind at hour 20:** the backend person builds the plain catalog screens using your DataTable; cut the quotation templates UI and portal polish. **If the backend falls behind:** you take the reports endpoints and seed script from their blueprint (read-only code that can't break billing).

## 11. Antigravity prompts, QA, demo and README

Give the agent one phase at a time in a fresh conversation, and check the result in the browser before the next prompt. Put this blueprint at docs/FRONTEND\_BLUEPRINT.md and AGENTS.md at the repo root (also paste it into the workspace rules).

### Prompts

| # | Prompt to paste | You check before moving on |
| --- | --- | --- |
| 1 | "Read AGENTS.md and docs/FRONTEND\_BLUEPRINT.md sections 1–5. Scaffold client/ as in sections 2 and 3, in JavaScript (no TypeScript). Create the nine core files from section 5 exactly, all routes with placeholder pages, and the three layouts. Stop and show me npm run build output." | App opens; routes and guards work; build passes |
| 2 | "Implement src/mocks per section 8 with a handler for every endpoint in section 4 and realistic data (30 subscriptions, 60 invoices incl. overdue ones, the 8283.60 example). Responses must match section 4 exactly. Stop." | Network tab shows contract-shaped JSON |
| 3 | "Implement Login, Sign up (live password checklist from section 7), Forgot and Reset password pages per section 6 rows 1–3 and the UX rules in section 9. Stop." | Weak password blocked; wrong login shows the message |
| 4 | "Implement screens 5–9 and 18 (customers, products with variants, plans, taxes, templates, users) per section 6, using DataTable, useListParams, react-hook-form + zod, and role-based buttons. Stop." | Staff sees read-only catalog; admin can create CRM Pro + Odoo variant |
| 5 | "Implement screens 10–13 per section 6 and the subscription detail table. Buttons come only from allowedActions; totals only from preview; never compute money. Stop." | Draft → Active works on mocks; locked fields after confirmation |
| 6 | "Implement screens 14–17 per section 6 and the invoice detail table, including RecordPaymentDialog and PDF download via blob. Stop." | Two partial payments turn the invoice Paid |
| 7 | "Implement the dashboard (screen 4) per section 6 with Recharts, and the customer portal (screens 19–20). Stop." | Cards and chart render; customer sees only own data |
| 8 | "Apply section 9 to every page: loading, empty and error states, toasts, confirm dialogs. List any page missing one. Stop." | Every page passes the four-state check |

**Review checklist for the agent's code**

| Look for | Bad sign |
| --- | --- |
| All HTTP calls in src/api/ | axios or fetch inside a page |
| Money shown via \<Money> from API strings | +, -, \*, parseFloat on amounts in src/ (outside mocks) |
| Status buttons from allowedActions | if (status === 'ACTIVE') showPauseButton |
| Token only in memory | localStorage.setItem('token', ...) |
| Server data via TanStack Query hooks | useEffect + fetch + useState for lists |
| Field names exactly as in section 4 | invoice.totalAmount, sub.customerName, or other invented names |
| Filters in the URL via useListParams | Filters lost on refresh |

### QA walkthrough (run at hour 28–34, as each role)

| Role | Steps | Expected |
| --- | --- | --- |
| Public | Sign up with "password1", then a valid password; log out; forgot password | Checklist blocks the first; account created; reset email message shown |
| Admin | Create tax GST 18%, product CRM Pro ₹1,000 with Brand Odoo +560, monthly plan, "Seats 10%" discount (min 5, limit 100), a staff user | All saved; lists update; discount shows "Used 0 / 100" |
| Staff | Create subscription for Acme from a template, 5 seats; send quote → confirm → activate; Bill now | Status bar moves; preview total ₹8,283.60; invoice created |
| Admin | Billing runs: run now twice for today | Second run reports 0 invoices created |
| Staff | Confirm the invoice; record UPI ₹5,000 then bank transfer ₹3,283.60 | Balance updates; status Paid |
| Staff | Try to open Taxes, Users or Billing runs by URL | Redirected; menu items hidden |
| Customer | Log in as customer@acme.test; open invoices; download PDF; pause subscription (if plan allows) | Only Acme data; PDF opens; status Paused |
| Customer | Paste another customer's invoice URL | Not-found state |
| Admin | Dashboard on the big seed | Cards and chart load; response time shown under 2 seconds |

### Demo script (8 minutes, you lead, backend person answers technical questions)

1. Sign up a new customer; show the password checklist rejecting a weak password.
2. As admin, create CRM Pro with the Odoo variant (+₹560), a monthly plan and GST 18%.
3. As staff, create a subscription from a template for 5 seats; move it Draft → Quotation → Confirmed → Active; show history.
4. As admin, create "Seats 10%" (min 5 seats, limit 100).
5. Run billing now. Open the invoice: 7,800 − 780 + 1,263.60 = ₹8,283.60, discount applied automatically.
6. **Run billing again: 0 invoices created.** The backend person explains why.
7. Confirm, record ₹5,000 by UPI and ₹3,283.60 by bank transfer; the invoice turns Paid.
8. Log in as the customer: only their data; another invoice's URL shows Not found.
9. Dashboard on 5,000 subscriptions with the measured load time.

### README outline (you write it)

1. Product name, one-line tagline, screenshot of the dashboard
2. Problem it solves (2–3 sentences from the brief)
3. Features by role (Admin, Staff, Customer)
4. Tech stack table
5. Run locally: docker compose up -d, server (npm i, db:migrate, db:seed, dev), client (npm i, dev)
6. Demo logins (section 2)
7. How billing works: 4 bullets (idempotent, catch-up, atomic discounts, overdue derived)
8. Tests: how to run them and what they prove
9. Team: who built what

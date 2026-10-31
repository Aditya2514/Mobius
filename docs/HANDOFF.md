# Mobius Backend Handoff

## Read before doing anything (in this order)
1. `AGENTS.md`: hard rules. Follow them exactly.
2. `docs/BACKEND_BLUEPRINT.md`: the backend spec (sections 5–7 and 10 matter most).
3. `docs/API_CONTRACT.md`: the live contract, newer than the blueprint where they differ.
4. `git log --oneline`: one commit per phase/prompt.
Don't read `docs/FRONTEND_BLUEPRINT.md` unless a task needs it.

## Where things stand
- Backend Phases 0–3 done: auth, users, customers, catalog, plans, templates, subscriptions +
  state machine + preview, discounts, billing engine, invoices, payments, reports, big seed,
  invoice print/PDF/email. **97 tests pass (across 10 test files), build clean.** Backend feature work is **STOPPED**.
- Stack: Node 20 + TS + Express + Prisma 6 + PostgreSQL 16 (docker-compose: dev 5432, test 5433),
  Zod 4, decimal.js, Vitest + Supertest against a real test DB.
- Dev DB currently holds the small seed (`npm run db:seed`); `npm run db:seed:big` generates the big seed (5,000 subs; Acme demo sub = SUB-004991; ~115 subs due today, ~218 s). Both wipe the dev DB.
- API samples done: 75 sample JSON responses generated against the live seed in `docs/api-samples/` (covering all `API_CONTRACT.md` endpoints plus 400 validation with fields, 401, 403, 404, 409, 429 RATE_LIMITED, INVALID_TRANSITION, BUSINESS_RULE, refresh retry). All `accessToken` values are redacted to `"<redacted-jwt>"`. See `docs/api-samples/README.md`.

## Decisions made in review that go BEYOND the blueprint (keep them; don't "fix" back)
- **Billing anchor:** migration 0003 adds `subscriptions.billing_anchor`. Set on activate, shifted
  by paused days on resume. The engine counts periods from it, never from `start_date`.
- **One discount implementation:** `selectDiscounts()` in `discounts/discount.eligibility.ts` is used
  by BOTH the preview and the engine. No SQL eligibility functions. The engine claims chosen
  discounts with the conditional UPDATE in ascending id order (prevents deadlocks), re-selects if
  a claim fails, and releases slots no longer chosen.
- **Refresh tokens:** reuse within 30 s returns 401 with `details.retry=true` and must NOT clear the
  `rt` cookie. Reuse after 30 s revokes all of that user's sessions.
- **Config & Production Safety:**
  - `AUTH_RATE_LIMIT` (default 5; local `.env` = 30).
  - `ENABLE_SCHEDULER` (off unless set or production).
  - When `NODE_ENV=production`, `config/env.ts` enforces that `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be at least 32 characters and cannot contain `'change-me'`.
  - The DB timezone is `Asia/Kolkata` (migration 0002). Every "today" in billing is `todayIST()`.
- **Rules:** `expiry_date` = inclusive last day of service, must be > start. `paidOn` may not be later
  than `todayIST()`. Customers get 403 before the state machine for staff-only actions.
- **Validation errors:** `details = { field, fields: [{ field, message }] }`; business-rule errors
  send only `details.field`.
- **Payments:** `POST /invoices/:id/payments` returns `recordedBy` as `{ id, name }`, identical shape to `GET /payments`.
- **Invoices:** `GET /invoices/:id/print` (HTML, works without Chrome), `/pdf` (Puppeteer, 503
  `PDF_UNAVAILABLE` fallback), `POST /send` (PDF attached, or HTML + portal link).
- Migrations 0001–0003 exist. NEVER edit an existing migration; add a new one.

## How I want you to work
- One task at a time. Before coding, list the files you'll touch. After it: run `npm test` and
  `npm run build`, show me the output, commit with a clear message, push, and STOP.
- Never edit a test to make it pass without telling me why the test was wrong.
- For any new safety-critical test, do a break-the-code check: break the code, show the test
  fails, then restore it.
- Never use JS numbers for money; never insert invoices outside `engine.ts`; never set
  subscription status outside the state machine.
- If you think existing code or the spec is wrong, tell me; don't silently change behaviour.

## Completed Tasks
1. Applied all migrations from zero on a clean database and verified the full test suite passes.
2. Generated 75 live API response samples across all contract endpoints and error states in `docs/api-samples/` and aligned `docs/API_CONTRACT.md`.
3. Follow-up fixes:
   - Redacted all `accessToken` JWTs in samples to `"<redacted-jwt>"`.
   - Enforced production secret rules in `config/env.ts` (>= 32 chars, no 'change-me') with verified tests.
   - Updated `POST /invoices/:id/payments` response shape to include `recordedBy: { id, name }`.

## Open items (don't act on them unless I ask)
- Mailtrap SMTP credentials not yet in `server/.env` (I'll add them).
- Puppeteer Chrome must be installed on the demo laptop (`npx puppeteer browsers install chrome`).
- The frontend merge happens later; the `api-samples` are for my teammate to replace their mocks.
- Optional later: GitHub Actions CI running tests against Postgres.

# Rules for the AI agent working on this repo

You are building the Subscription Management System described in `docs/BUILD_PLAN.md`.
That file is the spec. `server/prisma/migrations/0001_init/migration.sql` (= schema.sql) is the database.
Backend work: follow `docs/BACKEND_BLUEPRINT.md`. Frontend work: follow `docs/FRONTEND_BLUEPRINT.md`.
Where a blueprint and BUILD_PLAN.md differ, the blueprint wins (it is newer and has the reviewed fixes).
When the spec and your idea disagree, follow the spec. If the spec is silent, ask before inventing.

## Stack (do not change)
- Backend: Node 20 + TypeScript + Express + Prisma + PostgreSQL. Zod for validation. decimal.js for money.
- Frontend: React + Vite + JavaScript (no TypeScript in client/), React Router v6, TanStack Query, axios, MUI + MUI X DataGrid, react-hook-form + zod, Recharts, dayjs.
- Tests: Vitest + Supertest against a real Postgres test database. Never mock the database in billing tests.

## Hard rules (never break)
1. Money is NEVER a JS `number` on the server. Use `Decimal` (decimal.js / Prisma.Decimal). Round half-up to 2 places per line.
2. Do NOT edit schema.sql / the init migration. Schema changes = a NEW migration file, and tell me why.
3. Never remove or weaken a database constraint, especially `uq_invoice_period`, CHECKs on totals, and `used_count <= usage_limit`.
4. Invoices are created ONLY by `runBilling` / `createInvoice` in `server/src/modules/billing/engine.ts`. No other code inserts invoices.
5. Invoice header insert uses `ON CONFLICT ON CONSTRAINT uq_invoice_period DO NOTHING`. Do not replace it with check-then-insert.
6. Discount usage is claimed with the conditional UPDATE (`used_count < usage_limit`). Never read-then-write the counter.
7. Status changes go through the state machine (`stateMachine.ts`) via `POST /subscriptions/:id/transition`. Never add a PATCH that sets `status` directly.
8. Every route has `auth` + `requireRole(...)`. Every query a CUSTOMER can reach is scoped by `customer_id = req.user.id`. Another customer's row returns 404.
9. Roles are never read from a request body. Sign-up always creates CUSTOMER. Only ADMIN creates STAFF and discounts.
10. Passwords: bcrypt cost 12; rule `/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{9,}$/`. JWT never stored in localStorage on the client.
11. Every list endpoint is paginated server-side (default 25, max 100). No N+1 queries.
12. The client never does money arithmetic; it displays the strings the API returns.
13. BigInt IDs are serialised as strings in JSON. Server runs with TZ=UTC.

## How to work
- Work one phase at a time. At the end of each phase: run `npm test` and `npm run build`, show me the output, and stop.
- Before writing code for a phase, list the files you will create/change.
- Do not delete or rewrite existing tests to make them pass. If a test fails, fix the code or explain why the test is wrong.
- Keep the folder structure in section 3 of the spec.
- Small commits with clear messages, one per working step.

# Mobius

Subscription Management System for Brightloop Software: products, plans, quotations, subscriptions, automatic invoicing, payments and revenue reports, with Admin, Staff and Customer roles.

- `server/` — Node 20 + TypeScript + Express + Prisma + PostgreSQL (backend)
- `client/` — React + Vite (frontend)
- `docs/` — build plan, blueprints and API contract
- `AGENTS.md` — rules for AI agents working on this repo

## Backend setup

```bash
docker compose up -d                 # Postgres: dev on 5432, tests on 5433
cd server
cp .env.example .env                 # then set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
npm install
npm run db:migrate                   # apply migrations to the dev DB
DATABASE_URL=postgresql://app:app@localhost:5433/subs_test npx prisma migrate deploy   # test DB
npm run db:generate                  # Prisma client
npm run db:seed                      # WIPES the dev DB, loads demo data
npm run dev                          # http://localhost:4000/api/v1/health
npm test
```

Demo logins (after `npm run db:seed`), all with password `Demo@12345`:
`admin@brightloop.test` (Admin), `staff@brightloop.test` (Staff),
`customer@acme.test` and `customer2@globex.test` (Customers).

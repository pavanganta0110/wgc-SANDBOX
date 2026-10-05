# WGC Payments — Project README

> Cross-links: for a deep architectural walkthrough see [`../codebase-analysis-docs/CODEBASE_KNOWLEDGE.md`](../codebase-analysis-docs/CODEBASE_KNOWLEDGE.md); for system diagrams see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for endpoint reference see [`API.md`](./API.md).

## Purpose

WGC Payments is a multi-tenant SaaS payments platform for churches and nonprofit organizations. It lets a church ("merchant" / "organization" / `Church` in the data model) accept one-time and recurring donations, invoice payments, and merchandise sales, using **Finix** as the underlying card/ACH payment processor. WGC itself also bills its client organizations a platform subscription fee ("WGC Platform Billing"), making this simultaneously:

- A **payment facilitation platform** (WGC is a Finix platform account; each church is an underlying Finix sub-merchant).
- A **merchant-facing dashboard** (giving links, donor CRM, invoicing, recurring donors, settlements/deposits, disputes, reporting).
- A **WGC-internal admin console** (onboarding review, merchant management, platform billing, support tooling).
- A **billing SaaS in its own right** (WGC charges churches a subscription, independent of Finix's processing fees).

## High-Level Architecture

```
Donor / Payer  ──►  Public giving/invoice pages  ──►  Finix (card/ACH processing)
                                                            │
                                                            ▼
                                          Finix webhooks ──► /api/webhooks/finix
                                                            │
                                          ┌─────────────────┴─────────────────┐
                                          ▼                                   ▼
                              FinixWebhookEvent (durable)         BackgroundJob (durable outbox)
                                          │                                   │
                                          ▼                                   ▼
                             PROCESS_FINIX_WEBHOOK job        SEND_RECEIPT / QUICKBOOKS_PAYMENT /
                             (business logic, off the         INVOICE_RECEIPT / etc. job handlers
                              request path)
```

The system is a single Next.js (App Router) application — there is no separate backend service. "Backend" logic lives in:
- **API routes** under `src/app/api/**/route.ts` (Next.js Route Handlers)
- **Server Components / Server Actions** under `src/app/**/page.tsx` for merchant/admin dashboard pages
- **A durable background-job worker** (`src/lib/jobs/`), invoked by an authenticated internal route, not a separate process
- **Scheduled Vercel Cron jobs** (`src/app/api/cron/**`, declared in `vercel.json`) for reconciliation and periodic sync

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for diagrams and [`CODEBASE_KNOWLEDGE.md`](../codebase-analysis-docs/CODEBASE_KNOWLEDGE.md) for the full system breakdown.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL via Prisma ORM 5.16 (hosted on Supabase) |
| Payments processor | Finix (custom typed client in `src/lib/finix/client.ts` — no official SDK is used) |
| Auth | Custom HMAC-signed session cookies (no NextAuth/Clerk/etc.) — see [`AUTHENTICATION.md`](./AUTHENTICATION.md) |
| Styling | Tailwind CSS v4 |
| Email | Resend |
| Background jobs | Custom Postgres-backed durable outbox (`BackgroundJob` table + `FOR UPDATE SKIP LOCKED` claiming) — no Redis/SQS/BullMQ |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Hosting | Vercel |
| Integrations | QuickBooks Online, Aplos, Printful, Google/Apple Pay, reCAPTCHA |

## Setup and Installation

```bash
npm install
```

`postinstall` automatically runs `prisma generate`.

### Environment variables

Copy the required variables into `.env.local` (never commit real secrets — see [`CONFIGURATION.md`](./CONFIGURATION.md) for the full list and what each one does). At minimum, local development needs:

- `DATABASE_URL`, `DIRECT_URL` — Postgres connection strings (a **sandbox** database, never production)
- `AUTH_SESSION_SECRET` — HMAC signing key for session cookies (32+ chars in production)
- `FINIX_USERNAME`, `FINIX_PASSWORD`, `FINIX_APPLICATION_ID`, `FINIX_BASE_URL`, `FINIX_VERSION` — Finix API credentials (sandbox)
- `RESEND_API_KEY` — transactional email (falls back to a no-op warning if unset)
- `CRON_SECRET` — bearer token required in production for every `/api/cron/*` route

> ⚠️ **Known repo hazard**: Prisma's client lazily auto-loads `.env` (not `.env.local`) whenever `DATABASE_URL` isn't already present in `process.env`. If `.env` in your checkout contains production credentials, a bare `npx prisma db push` or `npx vitest run` outside your shell's usual env can silently target production. Always verify which `DATABASE_URL` a command will resolve to before running anything that touches real data.

## Running in Development

```bash
npm run dev
```

Starts the Next.js dev server at `http://localhost:3000`.

## Running in Production

Deployed on Vercel; `main` auto-deploys. Locally:

```bash
npm run build
npm run start
```

## Running Tests

```bash
npm run test        # Vitest — unit + integration (mocked and real-DB)
npm run test:e2e     # Playwright — full browser E2E against a local dev server + Postgres
```

Vitest test files live beside the code they test, under `__tests__/` directories. Two conventions matter:
- Files named `*.test.ts` with mocked `@/lib/prisma` — pure unit tests, no database required.
- Files named `*.realdb.test.ts` — run against a **real** (sandbox) Postgres database, no mocking, used specifically to prove concurrency/idempotency invariants that mocks can't verify (row-level locking, unique constraints, `FOR UPDATE SKIP LOCKED`). These require a reachable sandbox `DATABASE_URL`/`DIRECT_URL`.

Playwright E2E tests live under `e2e/`, share one Postgres database, and run serially (`fullyParallel: false`, `workers: 1`) to avoid cross-test interference.

## Configuration and Environment Variables

See [`CONFIGURATION.md`](./CONFIGURATION.md) for the full annotated list.

## Common Development Tasks

| Task | Command |
|---|---|
| Push schema changes to the database (no migration file) | `npm run db:push` (wraps `prisma db push`) |
| Generate Prisma client after a schema change | `npx prisma generate` (also runs automatically via `postinstall`) |
| Seed demo data | `npx tsx seed-demo.ts` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |
| Run one test file | `npx vitest run path/to/file.test.ts` |
| Run the background job worker manually (dev) | `POST /api/internal/jobs/run` with the worker's shared secret — see [`API.md`](./API.md#internal--worker) |

> This project uses `prisma db push` (schema-sync), not `prisma migrate` — there is no `prisma/migrations/` history. Schema changes are applied directly; be careful about ordering when a column needs to exist before code that writes to it deploys.

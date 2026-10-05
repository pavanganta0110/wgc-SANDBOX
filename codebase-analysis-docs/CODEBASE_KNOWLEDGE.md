# Codebase Knowledge

> Cross-links: [`../docs/README.md`](../docs/README.md) (setup), [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) (diagrams), [`../docs/DATA_MODELS.md`](../docs/DATA_MODELS.md) (schema), [`../docs/API.md`](../docs/API.md) (endpoints).

This is the single deepest reference document in the repo. Read this before making a change that touches more than one file, especially anything under `src/app/api/webhooks/`, `src/lib/jobs/`, `src/lib/reconciliation/`, or any Payment/Invoice/Refund creation path.

## System at three levels

### High level — what this does and why it exists

WGC Payments lets churches accept donations (one-time and recurring), invoice payments (e.g. tuition, event fees), and merchandise sales, using Finix as the processor, while WGC itself charges those churches a platform subscription. It is a full multi-tenant SaaS: 119 Prisma models, 338 API routes, a merchant dashboard, and an internal admin console, all in one Next.js deployable.

### Mid level — modules and how they communicate

`src/lib/` (32 top-level domain folders) is the "business logic" layer; `src/app/api/**/route.ts` (338 route handlers) and `src/app/**/page.tsx` (server components) are the entry points that call into it. There is no service/repository indirection — a route handler calls a `src/lib/` function, which calls `prisma` directly.

| Domain folder | Responsibility |
|---|---|
| `finix/` (30 files) | The Finix API client, sync layer (transfers/disputes/settlements/fees → local tables), reconciliation primitives, status/display mapping |
| `auth/` (20 files) | Session cookies, permissions/roles, merchant vs. admin auth, "view as merchant" impersonation |
| `billing/` (17 files) | WGC's own platform-subscription billing (separate from Finix processing) |
| `invoices/` (17 files) | Invoice creation, payment application, reconciliation, PDF/email delivery |
| `subscriptions/` (16 files) | Recurring donor subscriptions (Finix subscriptions, setup links, consent) |
| `donors/` (25 files) | Donor CRM: matching, notes, statements, analytics |
| `giving/` (13 files) + `givingLinks/` (7) | Public donation pages, receipt generation, giving-link management |
| `reporting/` (13) + `reports/` (4) | Dashboard aggregates, saved reports, exports |
| `jobs/` (4 files) | The durable background-job outbox (enqueue, claim, retry, dispatch table) |
| `reconciliation/` (4 files) | Scheduled sweeps that repair Payment/InvoicePayment/RefundRequest gaps |
| `payments/` (5 files) | Refund request handling + refund reconciliation |
| `organization/` (9), `settings/` (11), `support/` (8) | Merchant-facing org settings, support tickets |
| `integrations/` (3, but see subfolders) | QuickBooks, Aplos, Printful connectors |
| `onboarding/` (4) | Merchant application → Finix underwriting flow support |
| `observability/` (1) | `logPaymentSafetyEvent` — structured, greppable safety-event logging |

Cross-module communication is almost entirely **direct function calls within one process** — the only "message passing" in the system is:
1. Rows in `BackgroundJob` (the durable outbox — see below).
2. Rows in `FinixWebhookEvent` (durable webhook receipt records).
3. HTTP calls to Finix, Resend, QuickBooks, Aplos, Printful (real external services).

### Low level — key functions and patterns worth knowing before you edit anything

- **`enqueueBackgroundJobInTransaction(tx, input)`** (`src/lib/jobs/backgroundJobs.ts`) — the one correct way to schedule follow-up work from inside a financial-mutation transaction. Never call the non-transactional `enqueueBackgroundJob()` from inside code that also writes a `Payment`/`InvoicePayment`/`RefundRequest` — that would use a different DB connection and defeat the atomicity guarantee.
- **`shouldApplyTransferState(currentState, incomingState)`** (`src/lib/finix/sync/paymentReconciliation.ts`) — the single source of truth for "is this a stale/out-of-order webhook event." Every place that applies a Finix transfer state to a local record goes through this (directly or via `applyInvoicePaymentTransferState`/`reconcilePendingTransfer`). Do not write a second state-ordering check anywhere else.
- **`recoverOrphanedOneTimePayment(...)` / `recoverOrphanedInvoicePayment(...)`** — the *only* code paths allowed to reconstruct a `Payment`/`InvoicePayment` from a Finix transfer that has no local row yet. Called from both the webhook handler and the reconciliation sweeps. Never write a third ad hoc "create Payment from Finix data" path — extend one of these instead.
- **`processFinixWebhookEvent(webhookEvent)`** (`src/app/api/webhooks/finix/route.ts`) — the actual webhook business logic, run by the job worker, not the request handler. Must remain safe to call more than once for the same event (it short-circuits on `processingStatus === "COMPLETED"`).
- **`requireMerchantSession()` / `getAdminSession()`** (`src/lib/auth/`) — the only correct way to resolve "who is making this request and what can they do." Never resolve `churchId` from a request body/query param for anything security-relevant — it always comes from the authenticated session (or, for admin impersonation, from a DB-verified `AdminImpersonationSession` row).
- **Idempotency keys are first-class data**, not incidental: `PaymentAttempt.idempotencyId`, `InvoicePaymentAttempt.idempotencyKey`, `BackgroundJob.dedupeKey`, `RefundRequest.clientRefundId` all exist specifically so a retried/duplicated caller collapses to one real effect via a DB unique constraint (P2002-catch-and-recover), not application-level locking.

## Folder structure

```
src/
  app/
    api/            # 338 Route Handlers — the HTTP surface (admin/, merchant/, webhooks/, cron/, etc.)
    admin/(dashboard)/    # WGC-internal admin console pages
    merchant/(dashboard)/ # Church-facing dashboard pages
    g/[slug]/             # Public giving-link donation pages
    invoice/[token]/      # Public invoice payment pages
    onboarding/           # Public merchant-application + document-upload flow
    setup/[token]/        # Public recurring-donation setup-link completion
    (marketing pages: about/, pricing/, resources/, etc.)
  components/         # React components, mostly organized by the dashboard they belong to
  lib/                # All business logic — see table above
  middleware.ts       # Edge-runtime coarse auth gate for /admin, /merchant, /api/admin, /api/merchant
  types/              # Shared TypeScript types
prisma/
  schema.prisma       # 119 models — single source of truth for the DB shape
e2e/                  # Playwright end-to-end tests
docs/                 # Human + AI-facing documentation (this file's sibling directory)
```

## Key data flows

**Request → handler → lib → DB** (the standard shape for almost everything):
```
route.ts (auth check via requireMerchantSession/getAdminSession)
  → validate input (zod, where used)
  → call a src/lib/** function
  → that function calls prisma directly (or finixClient, or sendWgcEmail)
  → route.ts returns NextResponse.json(...)
```

**Financial mutation → durable outbox** (see [`ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full sequence diagram):
```
prisma.$transaction(async (tx) => {
  const payment = await tx.payment.create({ ... });
  await enqueueBackgroundJobInTransaction(tx, { jobType: "SEND_RECEIPT", dedupeKey: `SEND_RECEIPT:payment:${payment.id}:version:1`, ... });
});
// External HTTP (Finix, Resend) always happens BEFORE this transaction opens — never inside it.
```

**Webhook → fast ack → worker**:
```
POST /api/webhooks/finix  → auth → persist FinixWebhookEvent + enqueue PROCESS_FINIX_WEBHOOK job (one transaction) → 200
POST /api/internal/jobs/run (worker, cron-triggered) → claim job → processFinixWebhookEvent(event) → mark COMPLETED
```

## Known constraints and assumptions

- **No `prisma migrate` history.** Schema changes are applied with `prisma db push`. This means there is no migration file to review for "what changed" — only `git diff prisma/schema.prisma`.
- **Two databases exist**: a sandbox (development/testing) and production, both Postgres via Supabase. `.env` vs `.env.local` selects which one a bare command resolves to, and Prisma's own lazy dotenv loading makes this a real footgun — see the warning in [`README.md`](../docs/README.md).
- **The sandbox database has a small connection pool** (`pool_size: 15` on its Supavisor pooler). Running many `*.realdb.test.ts` files concurrently can exhaust it, causing intermittent, non-logic-related test failures. This is a known, external capacity constraint, not a code defect — if a realdb test fails with `EMAXCONNSESSION` or "Can't reach database server," re-run it in isolation before assuming a regression.
- **No message queue.** All "background work" is Postgres rows plus a polling/claim worker. This is a deliberate simplicity choice, not an oversight — see `src/lib/jobs/backgroundJobs.ts`'s own doc comments.
- **Finix is the only payment processor.** There is no abstraction layer for "swap processors later" — `finixClient` and Finix's specific resource shapes (Transfer, Settlement, Verification, etc.) are used directly throughout.
- **`BackgroundJob.entityId`/`entityType` are untyped strings**, not Prisma relations (see the ER diagram note in ARCHITECTURE.md) — correctness depends on every enqueue call site passing the right id, not on the schema enforcing it.

## Gotchas someone new should know before editing code

1. **Never write `await sendSomeEmail(...)` or `await syncToQuickBooks(...)` directly after a financial `prisma` write outside a transaction.** That is exactly the crash-window bug this codebase has fixed multiple times (see git history around "Flow 3", "Task 8", "receipt asymmetry"). Use `enqueueBackgroundJobInTransaction` instead.
2. **Never resolve a reconciliation "repair" into a new Finix charge or reversal.** The reconciliation modules (`src/lib/reconciliation/`) are read-and-repair only; if you're tempted to add a `createTransfer`/`createReversal` call there, stop — that would let a duplicate charge slip past every other safeguard in the system.
3. **`churchId` is a security boundary, never trust one from a request body.** Every merchant-facing mutation must scope its query by the `churchId` from `requireMerchantSession()`, not from anything client-supplied.
4. **Webhook business logic lives in `processFinixWebhookEvent`, not in `POST` of the webhook route.** If you're adding new webhook-triggered behavior, add it there — putting it in the `POST` handler itself would put it back on the fast-ack request path, defeating the whole point of the split.
5. **A `.env` file in this repo contains production-shaped variable names** (see the README warning) — always double-check which database a command targets before running it, especially anything with `prisma`, `vitest run`, or `db:push` in it.
6. **The admin panel and merchant dashboard share a `User.role` column** but with very different meanings (`wgc_admin`/`wgc_super_admin` vs. `owner`/`admin`/`fundraiser`/`viewer`) — see [`AUTHENTICATION.md`](../docs/AUTHENTICATION.md). Code that normalizes roles must never let a WGC-internal role fall through to being treated as an organization role.

---

## Documentation TODO

This documentation set was generated by reading the codebase structure, key modules, and inline comments; it was not reviewed line-by-line against every one of the 338 API routes or 119 models. Known gaps:

**Missing/thin areas by folder:**
- `src/lib/integrations/` (QuickBooks, Aplos, Printful) — each has real depth (OAuth flows, sync jobs, webhook handling) not covered in [`API.md`](../docs/API.md) beyond a mention; each deserves its own doc similar to the existing `docs/integrations/aplos.md` and `docs/integrations/quickbooks.md`.
- `src/lib/donors/` (25 files) — donor matching/dedup logic, annual statement generation, bulk-receipt jobs are not documented beyond the data model.
- `src/lib/reporting/` + `src/lib/reports/` — dashboard aggregate computation and saved-report mechanics are not documented.
- `src/components/` — no component-library or design-system documentation exists.
- E2E test coverage (`e2e/`) — not inventoried; unclear which user flows have Playwright coverage vs. only Vitest unit coverage.
- Admin-side permission matrix (`WGC_ADMIN_PERMISSIONS`) — referenced in [`AUTHENTICATION.md`](../docs/AUTHENTICATION.md) but not exhaustively documented field-by-field.

**Suggested docs to add later:**
- `docs/integrations/printful.md` (merchandise fulfillment) to match the existing Aplos/QuickBooks integration docs.
- `docs/JOBS_AND_RECONCILIATION.md` — a dedicated deep-dive on every `JobType`, its handler, its backoff policy, and every reconciliation sweep's exact repair semantics (this document only summarizes the pattern).
- `docs/TESTING.md` — the `*.test.ts` vs `*.realdb.test.ts` convention deserves more than the paragraph it gets in `README.md`, including how to point tests at the sandbox database safely.

**Open questions for a human maintainer:**
- Is there an intended migration path off `prisma db push` to `prisma migrate` before this reaches a scale where schema-drift risk matters more?
- Is the sandbox pool_size:15 constraint something worth raising with Supabase, or is it accepted as a permanent test-suite limitation?
- Which of the 217 `/api/merchant/**` routes are considered stable/public-contract vs. internal dashboard-only implementation details that can change freely? (This affects how strictly `API.md` should be treated as a contract.)

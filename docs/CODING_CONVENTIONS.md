# Coding Conventions

Derived from observed patterns across `src/lib/`, `src/app/api/`, and the existing test suite — this is a description of the codebase's actual conventions, not an aspirational style guide.

## Naming

- **Files**: `camelCase.ts` for lib modules (`paymentReconciliation.ts`, `requireMerchantSession.ts`); Next.js reserved names (`route.ts`, `page.tsx`, `layout.tsx`) inside their directory; `*.test.ts` for mocked unit tests, `*.realdb.test.ts` for real-database integration tests (see [`README.md`](./README.md)).
- **Functions**: verb-first, intention-revealing (`reconcilePendingTransfer`, `recoverOrphanedOneTimePayment`, `enqueueBackgroundJobInTransaction`, `requireMerchantSession`). A function named `requireX` throws/redirects on failure rather than returning null; a function named `resolveX`/`findX` returns a nullable result.
- **Types/interfaces**: PascalCase (`MerchantAuthContext`, `PaymentSafetyEventFields`, `ReconciliationOutcome`).
- **DB-mirrored string enums** (job types, statuses): SCREAMING_SNAKE_CASE string literals, not TypeScript `enum` — e.g. `"SEND_RECEIPT"`, `"PAYMENT_STATUS_UNCERTAIN"`, `"APPROVED"`. Prisma models use plain `String` columns for these, with the allowed values documented in an inline comment above the field.
- **Money**: always `xxxCents` (integer), never a float/decimal field.
- **Background job dedupe keys**: `` `{JOB_TYPE}:{scope}:{id}` ``, e.g. `SEND_RECEIPT:payment:pay_123:version:1`.

## Architectural patterns

- **No controller/service/repository layering.** Route handlers (`route.ts`) call `src/lib/**` functions directly, which call `prisma` (the singleton client, `src/lib/prisma.ts`) directly. There is no repository abstraction over Prisma and no separate "service" class layer.
- **Domain-organized `lib/`, not technical-layer-organized.** `src/lib/giving/`, `src/lib/invoices/`, `src/lib/billing/`, etc. — not `src/services/`, `src/repositories/`.
- **Transactional outbox for financial mutations.** Any code that creates/mutates a `Payment`/`InvoicePayment`/`RefundRequest` and also needs to trigger follow-up work (email, QuickBooks sync) must do so via `enqueueBackgroundJobInTransaction(tx, ...)` inside the **same** `prisma.$transaction` as the financial write — never `await someEmailFunction()` directly after an unguarded write. See [`ARCHITECTURE.md`](./ARCHITECTURE.md#3-the-durable-background-job-outbox).
- **External HTTP never inside a DB transaction.** The pattern is always: do the Finix/Resend/QuickBooks HTTP call first, then open a short `prisma.$transaction` to persist the result + enqueue jobs. Never hold a transaction open across an external network call.
- **Idempotency via DB constraint + P2002 catch, not select-then-insert.** The standard shape:
  ```ts
  try {
    return await prisma.payment.create({ data: { finixTransferId, ... } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.payment.findUnique({ where: { finixTransferId } });
      if (existing) return existing; // another writer won the race — not an error
    }
    throw err;
  }
  ```
- **Reconciliation is read-and-repair only.** Code under `src/lib/reconciliation/` and the Finix-side reconciliation primitives (`recoverOrphaned*`, `reconcile*`) may only call read-only Finix lookups and then apply the discovered result locally — never a `createTransfer`/`createReversal`/new-charge call. This is enforced by convention (reviewed in code review), not by a lint rule.
- **Never trust a client-supplied `churchId`.** Every merchant-scoped query is filtered by the `churchId` resolved from `requireMerchantSession()`, never from request body/query params.
- **Extensive inline "why" comments over external docs for individual decisions.** This codebase's dominant documentation style is a substantial doc comment directly above the function/model/constant it explains, often referencing the specific production bug or design tradeoff that motivated it (e.g. "confirmed in production: two DASHBOARD_ACCESS emails logged 21ms apart"). When editing such code, read the comment fully before changing the logic — it usually encodes a non-obvious constraint.
- **Structured, greppable safety-event logging.** `logPaymentSafetyEvent(event, fields)` (`src/lib/observability/paymentSafetyEvents.ts`) is used to log every money-safety-relevant event (duplicate-prevented, orphan-recovered, reconciliation outcomes) as a single-line JSON `console.warn` — searchable in Vercel logs. Extend the `PaymentSafetyEvent` union type rather than using a raw string.

## TypeScript conventions

- `strict: true` in `tsconfig.json` — no implicit `any`.
- ESLint (`eslint-config-next` core-web-vitals + typescript configs) flags explicit `any` (`@typescript-eslint/no-explicit-any`) — the codebase has some pre-existing instances (mostly around raw Finix API response shapes, which are inherently loosely typed), but new code should avoid introducing more. When touching a file, do not add a new `any` beyond what's already there.
- Path alias `@/*` maps to `src/*` — always import via `@/lib/...`, `@/components/...`, never relative `../../../lib/...` chains.
- Prefer a named `interface`/`type` for a function's structured parameter object over an inline anonymous type, especially for anything crossing a module boundary.

## Testing patterns and expectations

Two test types, both under `__tests__/` directories colocated with the code they test:

1. **`*.test.ts` — mocked unit tests.** `vi.mock("@/lib/prisma", () => ({ prisma: mockPrismaObject }))` at the top of the file; the mock object typically implements only the Prisma methods the code under test actually calls, including a `$transaction: vi.fn(async (fn) => fn(mockPrismaObject))` when the code under test opens a transaction. Tests assert on which mock methods were called with what arguments, not on real database state. This is the majority of the suite (2000+ tests).
2. **`*.realdb.test.ts` — real-database integration tests.** No mocking of `@/lib/prisma`; runs against a real (sandbox) Postgres database. Used specifically to prove properties mocks cannot verify: real unique-constraint races, `FOR UPDATE SKIP LOCKED` claim semantics, concurrent-transaction ordering. These are chunked into small batches (e.g. groups of 5 concurrent calls) to respect the sandbox's limited connection pool, and always clean up their own fixture rows in `beforeEach`/`afterEach`, scoped tightly to a dedicated test-owned `churchId` — never an unscoped `deleteMany`.

**What to test, by convention observed in this codebase:**
- Every P2002/race-condition fallback path (the "loser" of a concurrent create).
- Every "already resolved, do nothing" idempotency short-circuit.
- Every transition to a terminal state that triggers a side effect (receipt email, QuickBooks sync) — assert the job is enqueued with the correct `dedupeKey`, not that the email was sent directly.
- Cross-tenant isolation (a fixture belonging to `church_OTHER` must never leak into `church_1`'s result).
- Failure classification (`RETRYABLE_ERROR` vs `PERMANENT_ERROR` vs `NOT_FOUND`, etc.) in reconciliation code — tests assert the specific outcome bucket, not just pass/fail.

E2E (Playwright, `e2e/`): full browser flows against a real local dev server + Postgres, run serially (shared database, `workers: 1`) — not a place for exhaustive edge-case coverage, reserved for critical end-to-end user journeys.

## Lint / typecheck / build gates

- `npm run lint` (ESLint) and `npx tsc --noEmit` (typecheck) should both be run before considering a change complete on any touched file. This repo has pre-existing lint errors elsewhere (mostly `no-explicit-any`); the expectation is **zero new errors in files you touch**, not a clean full-repo lint run.
- `npx next build` should succeed before a change is considered deploy-ready.

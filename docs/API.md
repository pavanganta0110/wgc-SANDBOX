# API Reference

> Scope note: this repo has **338** `route.ts` files under `src/app/api/`. Exhaustively documenting every one is not useful (many are thin CRUD wrappers around a single Prisma model, discoverable by folder name). This document instead: (1) documents every route **outside** `/api/merchant` and `/api/admin` in full, since those are the smaller, higher-leverage surfaces (webhooks, cron, public payment flows, worker), and (2) gives an organized index + representative examples for the two large dashboards' API surfaces (`/api/merchant/**` — 217 routes, `/api/admin/**` — 74 routes). Cross-link: [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how these compose into the full request flow.

## Authentication conventions (apply to almost every route below)

- **Public routes** (giving pages, invoice payment, onboarding, webhooks) have their own specific auth described per-route.
- **`/api/merchant/**`** requires a valid session cookie; `requireMerchantSession()` resolves `churchId` server-side from the session — never trust a client-supplied churchId. See [`AUTHENTICATION.md`](./AUTHENTICATION.md).
- **`/api/admin/**`** requires an admin session cookie; `getAdminSession()` resolves the WGC admin's identity and role (`wgc_admin` / `wgc_super_admin`).
- **`/api/cron/**`** requires `Authorization: Bearer ${CRON_SECRET}` in production (see each route below — some also tolerate no secret outside production, for local dev).
- **`/api/webhooks/**`** authenticate the *caller* (Finix/Printful), not a WGC user — via HMAC signature and/or Basic/Bearer credentials specific to that processor.

---

## Webhooks

### `POST /api/webhooks/finix`
**Purpose:** Receives every Finix event (transfers, disputes, settlements, merchant/verification status changes, WGC platform-subscription billing events). Implements the fast-ack ingress pattern — see [`ARCHITECTURE.md`](./ARCHITECTURE.md#4-the-finix-webhook-fast-ackworker-split).
**Auth:** HMAC signature (`finix-signature` header, `timestamp:body` signed with `FINIX_WEBHOOK_SECRET`, 300s tolerance) and/or Basic/Bearer credentials (`FINIX_WEBHOOK_BASIC_USERNAME`/`PASSWORD`, or a bearer token) — configurable, at least one required.
**Body:** Finix's webhook envelope (`{ id, type, entity, created_at, _embedded: { ... } }`).
**Response:**
- `200 { message: "Verification ping successful" }` — empty body or missing event id (Finix's dashboard reachability check)
- `200 { message: "Already processed" }` — duplicate `finixEventId` (idempotent)
- `200 { message: "Webhook accepted" }` — event durably persisted + job enqueued
- `401` — auth failure (missing/invalid signature or credentials, stale timestamp)
- `400` — invalid JSON body
- `500` — persistence itself failed (Finix will retry delivery; nothing was accepted)

### `GET /api/webhooks/finix` / `HEAD /api/webhooks/finix`
Reachability probes some webhook dashboards send before/instead of POST. Always `200`, touches nothing.

### `POST /api/webhooks/printful`
Receives Printful order/shipment events for the merchandise fulfillment integration.

---

## Public donation & payment flows

### `POST /api/g/[slug]/donate`
**Purpose:** The core one-time/recurring donation charge endpoint for a public giving link.
**Params:** `slug` (GivingLink slug, path).
**Body (typical):** amount, tokenized Finix payment instrument, donor info, fund selection, optional recurring-schedule fields.
**Behavior:** creates a `PaymentAttempt` (idempotency record) before calling Finix; on ambiguous/uncertain outcomes (timeout, process death before the local write) returns a `PAYMENT_STATUS_UNCERTAIN` error rather than retrying the charge — see [`ARCHITECTURE.md`](./ARCHITECTURE.md#data-flow-the-main-donation-request-path).
**Response:** `200` with the created `Payment` summary on success; `4xx/5xx` with a structured error code otherwise (see `src/lib/utils/errorNormalizer.ts`).

### `POST /api/g/[slug]/merchandise`
Merchandise checkout against a giving page's merchandise offerings (see `MerchandiseOrder` in [`DATA_MODELS.md`](./DATA_MODELS.md)).

### `GET /api/g/[slug]/payment-attempt/[clientAttemptId]`
Polls/reconciles the status of a specific donation attempt (used by the giving-page UI while waiting on an async payment method).

### `GET /api/invoice/[token]`
Fetches a public invoice for viewing (by its public token, not an internal id).

### `POST /api/invoice/[token]/pay`
Charges an invoice. Same uncertain-outcome/idempotency posture as the donation route, using `InvoicePaymentAttempt`.

### `GET /api/invoice/[token]/payment-status`
Payer-return verification — re-checks the real Finix transfer state directly (via `reconcileInvoicePaymentAttempt`) rather than trusting a client-side redirect signal, for wallet-style payment flows (Apple Pay/Google Pay) where the payer returns to the page before the webhook may have arrived.

### `GET /api/invoice/[token]/pdf`
Streams a generated PDF of the invoice.

### `POST /api/setup/[token]/route.ts` and `POST /api/setup/[token]/complete`
Recurring-donation "setup link" flow: `GET /api/setup/[token]` resolves link details for the donor-facing setup page; `POST /api/setup/[token]/complete` creates the Finix subscription + local `FinixSubscription`/`SubscriptionConsent` state transactionally, then enqueues a `SETUP_LINK_CONFIRMATION` job (donor + org notification emails) — never sends email synchronously from this route.

---

## Onboarding (merchant application intake)

### `POST /api/onboarding`
Submits a new merchant application (`OnboardingApplication`).

### `POST /api/onboarding/upload`
Uploads a required onboarding document (business license, bank letter, etc.) — validated for file type/size before storage.

### `POST /api/onboarding/verify-captcha`
Server-side reCAPTCHA verification gate for the public application form.

### `GET /api/onboarding/[applicationId]/irs-letter`
Serves a previously-uploaded IRS determination letter for a given application (admin/internal review use).

---

## Cron (scheduled, `CRON_SECRET`-gated)

All scheduled in `vercel.json`. Every route below follows the same auth shape: in production, requires `Authorization: Bearer ${CRON_SECRET}`; outside production, tolerates no secret if `CRON_SECRET` is unset (local dev convenience) but still checks it if set.

| Route | Schedule | Purpose |
|---|---|---|
| `GET /api/cron/reconcile` | daily 13:00 UTC | Re-syncs open settlements, discovers new ones, replays failed webhook-archive events, delegates the stuck-`PaymentAttempt` sweep to `reconcileStalePaymentAttempts()` |
| `GET /api/cron/reconcile-payments` | every 15 min | `reconcileStaleTransfers()` + `reconcileStalePaymentAttempts()` — repairs stuck/orphaned Payments |
| `GET /api/cron/reconcile-invoice-payments` | every 30 min | `reconcileStaleInvoicePaymentAttempts()` |
| `GET /api/cron/reconcile-refunds` | every 15 min | `reconcileStaleRefunds()` — recovers `RefundRequest`s left ambiguous by a crash |
| `GET /api/cron/reconcile-subscriptions` | daily 15:00 UTC | `reconcileWgcSubscriptions()` — WGC's own platform-billing subscription reconciliation |
| `GET /api/cron/invoice-reminders` | daily 14:00 UTC | Sends due/overdue invoice reminder emails |
| `GET /api/cron/promo-shortfall-check` | monthly | Checks promotional-pricing entitlement shortfalls |
| `GET /api/cron/resync-transfer-fees` / `resync-monthly-transfer-fees` | daily / monthly | Re-syncs Finix fee data onto local `FinixFee` records |
| `GET /api/cron/aplos-sync` | (see `vercel.json` — not scheduled there; check for a separate trigger) | Aplos accounting sync |

> ⚠️ Some cron schedules in `vercel.json` (every 15/30 minutes) require a **Vercel Pro** plan — Hobby limits cron to once/day. Verify the current plan before assuming these run at the stated frequency in production.

---

## Internal worker

### `POST /api/internal/jobs/run`
**Purpose:** The background-job worker itself. Claims a batch of `BackgroundJob` rows (`FOR UPDATE SKIP LOCKED`), dispatches each to its handler (`src/lib/jobs/jobHandlers.ts`), marks `COMPLETED`/`RETRY`/`FAILED`. Also reclaims stale leases from a previous crashed run.
**Auth:** `requireWorkerAuth()` — a separate shared secret from `CRON_SECRET`, checked via `src/lib/jobs/workerAuth.ts`.
**maxDuration:** 300s (`WORKER_CONFIG.FUNCTION_MAX_DURATION_MS`) — designed to be safely re-invoked if it doesn't finish; correctness never depends on one invocation completing.
**Response:** `200` with a per-job outcome list (`{ jobId, jobType, result }[]`).

---

## Merchant dashboard API (`/api/merchant/**`, 217 routes)

All require a merchant session (`requireMerchantSession()`), scoped to the session's `churchId`. Organized by subdirectory — see each folder for its own routes:

| Folder | Covers |
|---|---|
| `transactions/` | Payments, authorizations, refunds, deposits, settlements, bank returns, disputes — list/detail/export for each |
| `donors/` | Donor CRUD, notes, import (preview/commit), analytics, annual statements, backfill |
| `recurring-donors/` | Per-subscription detail: payments, refunds, activity, giving-links, payment-update links |
| `subscriptions/` | Subscription list/detail, setup-link creation, frequency/amount changes |
| `giving-links/` | Giving link CRUD, sharing, attempt export |
| `invoices/` (via `invoicing`) | Invoice CRUD, sending, reminders |
| `disputes/` | Dispute list/detail, evidence upload, submission |
| `settlements/` | Settlement list/detail, reconciliation status |
| `settings/` | General/branding/receipts/payment-methods/security/data-privacy/team/audit/sync settings |
| `organization/` | Bank account, contacts, document upload, change requests |
| `support/` | Support ticket creation/management |
| `donations` (dashboard) | Dashboard aggregates/insights |

**Representative example — `POST /api/merchant/transactions/payments/take-payment`:**
Merchant-initiated (card-present-style) charge from the dashboard, not a public giving page. Same transactional-outbox pattern as the public donate route: Finix call happens first, then `Payment.create` + `SEND_RECEIPT`/`QUICKBOOKS_PAYMENT` enqueue in one transaction; returns `PAYMENT_STATUS_UNCERTAIN` rather than retrying on an ambiguous outcome.

**Representative example — `GET /api/merchant/transactions/deposits/export`:**
Streams a CSV export of deposits for the current church, respecting the session's `churchId` scope and any query-filtered date range.

---

## Admin console API (`/api/admin/**`, 74 routes)

All require an admin session (`getAdminSession()`); some further require `wgc_super_admin` specifically (see [`AUTHENTICATION.md`](./AUTHENTICATION.md)).

| Folder | Covers |
|---|---|
| `merchant-applications/` | Onboarding review, approve/reject, regenerate-token, upload-evidence |
| `merchants/[churchId]/` | Per-merchant admin view: users, bank account, request-change flows |
| `email-logs/` | View/resend logged emails (`EmailLog` — see [`DATA_MODELS.md`](./DATA_MODELS.md)) |
| `billing/` | WGC's own platform-billing admin surfaces (monitoring, failed payments) |
| `support/` | Support-ticket admin actions, email-based support replies |
| `documents/[id]` | Onboarding/compliance document retrieval |
| `inquiries/` | Public contact-form inquiries |
| `aplos/`, `printful/` | Integration-specific admin views |
| `settings/` | Admin account/profile settings |

**Representative example — `POST /api/admin/merchants/[churchId]/impersonate`** (if present — see [`AUTHENTICATION.md`](./AUTHENTICATION.md#admin-impersonation-view-as-merchant)): starts a "View as Merchant" session, `wgc_super_admin`-only, creates an audited `AdminImpersonationSession` row.

---

## Error conventions

Most routes return `{ error: string }` or `{ error: string, code: string }` on failure, with the `code` (e.g. `PAYMENT_STATUS_UNCERTAIN`, `REFUND_STATUS_UNCERTAIN`) used by financial-mutation routes specifically to signal "do not retry this as a fresh attempt" to the caller. See `src/lib/utils/errorNormalizer.ts` for the shared mapping and `src/lib/auth/errors.ts` for auth-specific error types (`UnauthorizedError`, `BillingAccessRestrictedError`).

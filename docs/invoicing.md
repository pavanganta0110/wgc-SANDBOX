# WGC Invoicing and Client Payments

Built on branch `feature/invoicing-system`. This document is the reference
several code comments across the invoicing system point to (search for
`docs/invoicing.md`) — it explains the data model, the status state
machine, money-handling rules, the public payment flow, and how this
feature reuses (rather than duplicates) WGC's existing Finix, email, PDF,
and permission infrastructure.

## Contents

- [Architecture summary](#architecture-summary)
- [Data model](#data-model)
- [Client vs. Donor](#client-vs-donor)
- [Invoice status state machine](#invoice-status-state-machine)
- [Payment classification](#payment-classification)
- [Money handling rules](#money-handling-rules)
- [Public payment page and token security](#public-payment-page-and-token-security)
- [Finix payment flow](#finix-payment-flow)
- [Webhook reconciliation](#webhook-reconciliation)
- [Offline payments and refunds](#offline-payments-and-refunds)
- [Reminders](#reminders)
- [Email, SMS, and PDF outputs](#email-sms-and-pdf-outputs)
- [Permissions](#permissions)
- [Routes](#routes)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Known limitations](#known-limitations)

## Architecture summary

Invoicing is additive: it introduces 12 new Prisma models and reuses
everything else — Finix payment processing (`src/lib/finix/client.ts`),
fee calculation (`src/lib/giving/feeCalculator.ts` /
`serverFeeStrategy.ts`), the shared email wrapper (`src/lib/email.ts`),
PDF rendering (`@react-pdf/renderer`, already used for donation receipts),
QR generation (`qrcode`, already used by the giving-link share modal), the
permission system (`src/lib/auth/roles.ts` / `permissions.ts`), and audit
logging (`src/lib/dashboardAudit.ts`).

Like the rest of this codebase, invoicing models use plain strings for
status/enum-like fields (documented in trailing comments, no Prisma
`enum`s) and integer-cents fields for all money, and have no Prisma
`@relation`s to other models — cross-model reads are explicit `findMany`/
`findUnique` calls, and multi-row writes that must be atomic use
`prisma.$transaction`.

## Data model

| Model | Purpose |
|---|---|
| `Client` | A billing contact — **not** a `Donor`. See [Client vs. Donor](#client-vs-donor). |
| `Invoice` | The invoice itself: line-item totals, status, classification, payment-method toggles, branding overrides. |
| `InvoiceLineItem` | One line item; `discountType`/`discountValue`/`taxRateBasisPoints` per line. |
| `InvoicePublicToken` | SHA-256 hash of the public payment-page token; raw token is never stored. |
| `InvoicePaymentAttempt` | One Finix charge attempt; `clientAttemptId` is the idempotency key from the client. |
| `InvoicePayment` | A settled payment (or offline entry) reducing the invoice balance — `source: FINIX \| OFFLINE`. |
| `InvoiceDelivery` | One email/SMS delivery attempt (send, resend, reminder). |
| `InvoiceReminder` | A scheduled BEFORE_DUE/ON_DUE/AFTER_DUE/MANUAL reminder row. |
| `InvoiceActivity` | Append-only event log for one invoice (sent, viewed, paid, refunded, reminder sent, …). |
| `InvoiceRevision` | Reserved for future "financial edit after send" snapshots — not yet written to; `canEditFinancials` currently just blocks post-payment edits outright rather than versioning them. |
| `InvoiceTaxRate` | Reserved for a future named-tax-rate picker; the line-item builder currently takes a raw basis-point tax rate per line rather than referencing this table. |
| `InvoiceSettings` | One row per church: numbering, defaults, reminder cadence, branding. |

Migration `add_invoicing_client_payments_system` was applied directly to
the sandbox Supabase project (`kasbpdsdnhgqogxmfsgm`) via hand-reviewed,
additive-only SQL (no `prisma migrate dev`/`db push` — see this repo's
existing convention of applying schema changes as reviewed SQL diffs).
**It has not been applied to any production database.**

## Client vs. Donor

An invoice's `Client` is a distinct identity from `Donor` and is **never**
auto-merged into one. `Client.linkedDonorId` is an optional, non-merging
cross-reference a merchant can set manually for reporting purposes — it
never triggers a merge and is never used to auto-classify a payment as a
donation. The public payment route (`/api/invoice/[token]/pay`) explicitly
does not create a `Donor` record for the payer, even when the invoice's
classification is `CHARITABLE_DONATION`.

## Invoice status state machine

Defined in `src/lib/invoices/invoiceStatus.ts`. Statuses split into two
groups:

- **Manual** (`DRAFT`, `SCHEDULED`, `VOID`, `UNCOLLECTIBLE`) — only change
  via an explicit merchant action.
- **Derived** (`SENT`, `VIEWED`, `PARTIALLY_PAID`, `PAID`, `PAST_DUE`) —
  recomputed by `computeDerivedInvoiceStatus()` from the invoice's actual
  balance, view history, and due date, every time something relevant
  changes (a payment, a refund, a view, the daily reminder sweep).

This "always recompute from source data" design is what makes two of the
spec's hard rules true by construction rather than by remembering to
update a status field in every code path:

- **Paid invoices never become past due** — `computeDerivedInvoiceStatus`
  checks `balanceCents <= 0` before it checks the due date.
- **Void invoices cannot accept payment** — `canAcceptPayment()` is the
  single gate every payment path (public page, offline recording) calls
  first.

## Payment classification

`GOODS_OR_SERVICES | CHARITABLE_DONATION | PARTIAL_DONATION`
(`src/lib/invoices/invoiceClassification.ts`). This only controls WGC's
own internal accounting/reporting behavior — **WGC does not provide tax
advice**, and every classification's UI discloses that.

- `CHARITABLE_DONATION` requires `noGoodsOrServicesConfirmed: true` before
  it can be sent.
- `PARTIAL_DONATION` requires `goodsServicesValueCents +
  charitablePortionCents === totalCents`.
- `calculateCharitablePortionForPayment()` prorates the charitable share
  of a *partial* payment on a `PARTIAL_DONATION` invoice, so paying 20% of
  the invoice contributes 20% of the charitable portion — not the whole
  charitable amount on the first dollar received.

## Money handling rules

All money is integer cents; every calculation lives in
`src/lib/invoices/invoiceMoney.ts` and is covered by unit tests. Rules
enforced at the API layer, not just documented:

- **Server-computed only.** The client never sends a total; line items are
  sent, the server recomputes `calculateLineItem`/`calculateInvoiceTotals`
  and persists that result.
- **No overpayment — block, don't credit.** Both the public pay route and
  the offline-payment route recompute the balance from the live
  `InvoicePayment` ledger (via `calculateInvoiceBalance`) immediately
  before accepting an amount, and reject anything exceeding it.
- **Idempotent payment attempts.** `InvoicePaymentAttempt.clientAttemptId`
  is unique; a retried/duplicated submit returns the existing attempt's
  result instead of charging Finix again.
- **PENDING never counts as settled.** An ACH payment starts
  `InvoicePayment.status = PENDING` and is excluded from
  `amountPaidCents` until the webhook confirms `SUCCEEDED`.
- **Refunds/disputes never rewrite the original amount.** Only
  `refundedCents`/`status`/`disputeStatus` are ever touched after the
  fact; `grossAmountCents`/`netAmountCents` are immutable once recorded.

## Public payment page and token security

`/invoice/[token]` (`src/app/invoice/[token]/page.tsx` +
`src/components/giving/InvoicePublicView.tsx`) follows the same
server-shell/client-fetch split as `/setup/[token]`: the server component
does a fast, non-mutating token-validity check for the error/SEO shell;
the actual data load (and the view-tracking side effect) happens
client-side via `GET /api/invoice/[token]`.

Token generation (`src/lib/invoices/invoicePublicToken.ts`) mirrors the
existing `SubscriptionSetupLink` pattern: `crypto.randomBytes(32)` for the
raw token, only its SHA-256 hash is ever persisted
(`InvoicePublicToken.tokenHash`). **The raw token is returned exactly
once, at creation** (`ensureInvoicePublicToken`/
`regenerateInvoicePublicToken`), to the authenticated merchant session
that requested it — it cannot be re-displayed later, only rotated (which
revokes the previous link immediately).

This has one real consequence worth knowing: any background process that
needs to build a working invoice link **after** the initial send (the
daily reminders cron, an SMS reminder) has no raw token to reuse, so it
calls `regenerateInvoicePublicToken` and mints a fresh one — which
invalidates whatever link was emailed previously, even if the client never
opened it. This is an accepted tradeoff of the single-active-token design,
not a bug; see `invoiceReminders.ts`'s doc comment.

## Finix payment flow

`POST /api/invoice/[token]/pay` mirrors `take-payment/route.ts`'s
identity → instrument → fee-strategy → transfer flow, unified across
payment methods the same way `/api/g/[slug]/donate/route.ts` already
does:

1. `finixClient.createBuyerIdentity()`
2. `finixClient.createPaymentInstrument()` — card/bank tokens pass
   `{ token, type: "TOKEN" }`; Apple/Google Pay pass
   `{ type: "APPLE_PAY" | "GOOGLE_PAY", third_party_token, merchant_identity: FINIX_APPLICATION_OWNER_ID }` (the wallet token is scoped to whatever identity it was tokenized against client-side, which must be the platform identity, not the church's).
3. `resolveWgcTransferFeeStrategy()` — the existing WGC fee-calculation
   system, selected by `invoice.feeCoveredBy === "CLIENT"` mapping to
   `donorCoversFee: true`. **No second fee system was built.**
4. `finixClient.createTransfer()` with `tags.source: "wgc_invoice_payment"`
   (this is how the webhook and reconciliation code recognize an invoice
   transfer among all the others Finix reports).

Apple Pay reuses the existing, domain-scoped
`/api/wallet/apple-pay/validate-merchant` route unmodified. Google Pay's
`gatewayMerchantId` is `FINIX_APPLICATION_OWNER_ID`, resolved server-side
and threaded into the public `GET` response (not a `NEXT_PUBLIC_` env var,
matching how the giving-link page already does it).

## Webhook reconciliation

`src/app/api/webhooks/finix/route.ts` was **extended**, not duplicated.
Invoice-specific logic is additive inside the existing `TRANSFER`,
`REVERSAL`/`RETURN`, and `DISPUTE` branches:

- **TRANSFER**: on any state change for a transfer tagged
  `wgc_invoice_payment`, updates the matching `InvoicePayment.status` and
  recomputes the invoice's balance/status. This is the only place an ACH
  payment's receipt email gets sent, since it starts `PENDING` and only
  reaches `SUCCEEDED` asynchronously here.
- **REVERSAL / ACH RETURN**: `reconcileInvoicePaymentReversal()` applies
  `refundedCents` and recomputes balance/status — shared by both branches
  since both represent "money came back."
- **DISPUTE**: syncs the display-only `InvoicePayment.disputeStatus`
  field only; never touches `grossAmountCents`/`refundedCents`.

Covered event categories: transfer created/updated (including ACH
settlement), reversal/refund, ACH return, and dispute
created/updated/resolved — the full set of transfer/ACH/refund/dispute
lifecycle events the existing handler already subscribes to.

## Offline payments and refunds

`POST /api/merchant/invoices/[invoiceId]/record-offline-payment`
(`canRecordOfflineInvoicePayments`) logs a payment collected outside Finix
(cash, check, bank transfer, Cash App, an external terminal, or other) —
same balance-recheck and no-overpayment rule as the Finix path, just no
processor call.

`POST /api/merchant/invoices/[invoiceId]/payments/[paymentId]/refund`
(`canRefundInvoicePayments`) branches on `InvoicePayment.source`:

- **FINIX** — calls `finixClient.createTransferReversal()` (the same
  reversal API `/transactions/payments/[transferId]/refund/route.ts`
  already uses) and returns `pending: true`; `refundedCents` is **not**
  applied here — the webhook applies it once Finix confirms the reversal,
  so a declined reversal never leaves the balance wrong.
- **OFFLINE** — applied immediately as a bookkeeping adjustment, since
  there's no processor to confirm with.

## Reminders

`src/lib/invoices/invoiceReminders.ts`:

- `scheduleInvoiceReminders()` — called once from the `/send` route,
  creates `InvoiceReminder` rows (`BEFORE_DUE`/`ON_DUE`/`AFTER_DUE`,
  the latter possibly several, per `InvoiceSettings.reminderAfterDueDaysJson`)
  based on the church's `InvoiceSettings`. Idempotent via a
  day-bucketed key (`invoiceId:type:YYYY-MM-DD`).
- `sendDueInvoiceReminders()` — the cron entry point
  (`GET /api/cron/invoice-reminders`, scheduled daily in `vercel.json`
  alongside the existing `reconcile` cron, same `CRON_SECRET` bearer-auth
  pattern). Skips (marks `SKIPPED`) any reminder for an invoice that's no
  longer eligible (paid/voided/uncollectible).

## Email, SMS, and PDF outputs

- **Email** (`src/lib/invoices/invoiceEmails.ts`) — every invoice email
  (send, resend, payment receipt, reminder) goes through the same shared
  `sendWgcEmail`/`generateWgcEmailHtml` wrapper donation receipts and
  setup links already use. No second email system was built.
  Per-merchant branding lives in the linked page/PDF, not duplicated into
  the email HTML.
- **SMS** (`src/lib/sms/smsProvider.ts`, `src/lib/invoices/invoiceSms.ts`)
  — a small `SmsProvider` interface with a Twilio implementation (raw REST
  API, no SDK dependency added) and a no-op fallback. **Off by default**
  behind `INVOICE_SMS_REMINDERS_ENABLED=true` — the `Client` model has no
  SMS consent field, and unsolicited payment-reminder texts are a real
  TCPA risk.
- **PDF/QR** (`src/lib/invoices/generateInvoicePdf.ts`,
  `src/lib/invoices/pdf/InvoicePdf.tsx`) — reuses `@react-pdf/renderer`
  and `qrcode`, both already dependencies (donation receipts and the
  giving-link share modal respectively). The QR code links to the public
  payment page and is only rendered when a raw token is available at
  generation time (the public PDF route always has one, from its own URL;
  the merchant PDF route never mints one just to render it — see that
  route's doc comment). The initial send email attaches this same PDF.

## Permissions

Ten keys (`src/lib/auth/roles.ts` / `permissions.ts`):
`canViewInvoices`, `canCreateInvoices`, `canEditInvoices`,
`canSendInvoices`, `canVoidInvoices`, `canRecordOfflineInvoicePayments`,
`canRefundInvoicePayments`, `canManageClients`,
`canManageInvoiceSettings`, `canExportInvoices`.

| Permission | Owner | Admin | Fundraiser | Viewer |
|---|---|---|---|---|
| canViewInvoices | ✓ | ✓ | ✓ (own only) | — |
| canCreateInvoices | ✓ | ✓ | ✓ | — |
| canEditInvoices | ✓ | ✓ | ✓ (own only) | — |
| canSendInvoices | ✓ | ✓ | ✓ (own only) | — |
| canVoidInvoices | ✓ | override-only | — | — |
| canRecordOfflineInvoicePayments | ✓ | override-only | — | — |
| canRefundInvoicePayments | ✓ | override-only | — | — |
| canManageClients | ✓ | ✓ | ✓ | — |
| canManageInvoiceSettings | ✓ | ✓ | — | — |
| canExportInvoices | ✓ | ✓ | — | — |

Fundraiser scoping (own-invoices-only) is enforced in route handlers, not
just hidden in the UI. Viewer gets no invoice permissions by default —
read-only access is grant-only via an explicit `permissionsJson`
override, same convention as `canViewAllTransactions`. **WGC admin
platform status never implies any of these** — `WGC_ADMIN_PERMISSIONS` is
its own fixed matrix with none of the ten keys set, kept structurally
separate so it can never fall through to an organization-owner grant.

## Routes

**Merchant dashboard pages:** `/merchant/invoices`, `/merchant/invoices/new`,
`/merchant/invoices/[invoiceId]`, `/merchant/invoices/[invoiceId]/edit`,
`/merchant/clients`, `/merchant/clients/new`, `/merchant/clients/[clientId]`,
`/merchant/clients/[clientId]/edit`, `/merchant/settings/invoicing`.

**Public:** `/invoice/[token]`.

**Key API routes** (all under `/api/merchant/invoices`, `/api/merchant/clients`,
or `/api/invoice/[token]` unless noted):
`create`, `[invoiceId]/update`, `[invoiceId]/void`,
`[invoiceId]/mark-uncollectible`, `[invoiceId]/duplicate`,
`[invoiceId]/send`, `[invoiceId]/link`, `[invoiceId]/link/regenerate`,
`[invoiceId]/record-offline-payment`,
`[invoiceId]/payments/[paymentId]/refund`, `[invoiceId]/pdf`, `export`;
client `create`, `[clientId]/update`, `[clientId]/archive`,
`[clientId]/restore`, `export`; public `GET /api/invoice/[token]`,
`POST /api/invoice/[token]/pay`, `GET /api/invoice/[token]/pdf`; cron
`GET /api/cron/invoice-reminders`.

## Environment variables

Reused (already required for existing Finix/giving features — nothing
new): `NEXT_PUBLIC_FINIX_APPLICATION_ID`, `NEXT_PUBLIC_FINIX_ENV`,
`FINIX_APPLICATION_OWNER_ID`, `WGC_DONOR_COVERED_ZERO_FEE_PROFILE_ID`,
`WGC_ORGANIZATION_PAID_FEE_PROFILE_ID`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID`, `GOOGLE_PAY_PRODUCTION_APPROVED`,
`CRON_SECRET`.

New, optional (SMS only — everything else works with zero new
configuration): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`, `INVOICE_SMS_REMINDERS_ENABLED`.

## Testing

`src/lib/invoices/__tests__/` and `src/app/api/{merchant/invoices,invoice}/__tests__/`
— money math, status derivation, classification rules, invoice-number
generation, branding resolution, public-token security, the public pay
route's full guard-clause set (overpayment, partial-payment rules,
idempotency, disabled payment methods, wallet routing), offline-payment/
refund routes, and CRUD route permission/ownership checks. Run with
`npx vitest run src/lib/invoices src/app/api/merchant/invoices src/app/api/invoice`.

## Known limitations

- `InvoiceRevision` and `InvoiceTaxRate` exist in the schema for future
  use (versioned financial-edit snapshots and a named-tax-rate picker,
  respectively) but nothing currently writes to or reads from them —
  `canEditFinancials` blocks post-payment edits outright rather than
  versioning them, and the line-item builder takes a raw basis-point tax
  rate rather than referencing a named rate.
- Rate limiting on public invoice routes is in-memory/process-local (same
  documented limitation as the existing `setupLinkRateLimit.ts`) — not
  globally enforced across serverless instances.
- SMS reminders require a Twilio account and are off by default; without
  `INVOICE_SMS_REMINDERS_ENABLED=true` and Twilio credentials configured,
  every SMS send is a recorded no-op (see `invoiceSms.ts`).
- WGC's own margin/revenue on invoice payments is not separately tracked
  from donation-page revenue — this mirrors the pre-existing donation-page
  gap (`FinixTransfer.applicationFeeCents` exists but isn't populated
  anywhere in this codebase yet, invoicing or otherwise).

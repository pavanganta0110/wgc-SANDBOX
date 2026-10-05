# Data Models

> Source of truth: [`../prisma/schema.prisma`](../prisma/schema.prisma) — **119 models**, no `prisma/migrations/` history (schema changes are applied with `prisma db push`, see [`README.md`](./README.md)). This document covers the core payments/donor/org models in depth and groups the rest by domain; the schema file itself is extensively commented and is the authoritative reference for any field this doc doesn't mention.

## Core payment models

### `Church`
The tenant/organization ("merchant"). Key fields:
- `finixMerchantId`, `finixIdentityId`, `finixApplicationId` — the Finix-side identifiers this church maps to.
- `billingSetupStatus` (nullable) + `billingAccessRestrictedAt` — WGC's own platform-billing access gate, checked on every merchant dashboard request (see [`AUTHENTICATION.md`](./AUTHENTICATION.md#organization-access-gate)). Independent of whether the church's own donors can be charged.
- `primaryOwnerUserId` — exactly one accountable `owner`-role `User` per church (nullable during backfill migration).
- `status` — church lifecycle status (active/etc.).

**Relationships:** one-to-many with nearly everything (`User`, `Payment`, `Donor`, `GivingLink`, `Invoice`, `FinixSubscription`, `RefundRequest`, ...) via a plain `churchId` string column — **this schema does not use Prisma `@relation` for most cross-model references**, by deliberate, consistent convention (see inline schema comments): relationships are foreign-key-by-convention, not declared Prisma relations, except where noted below (e.g. `DonationReceipt.payment`).

### `Payment`
The record of one successful-or-attempted charge to a donor. Key fields:
- `finixTransferId` (`@unique`) — the idempotency backbone: this constraint is what makes "did we already create a Payment for this Finix transfer" a database-enforced fact, not an application check.
- `status` — mirrors Finix's transfer state (`PENDING`/`SUCCEEDED`/`FAILED`/`CANCELED`), never regressed out of a terminal state by a stale event (`shouldApplyTransferState`).
- `paymentAttemptId` — links back to the `PaymentAttempt` this payment was reconciled/created from, when known.
- `attributedUserId` — snapshotted once at creation time for reporting attribution; never re-derived, never used for anything Finix-facing.
- `goodsServicesProvided`/`goodsServicesDescription`/`goodsServicesFairMarketValueCents` — quid-pro-quo tax disclosure fields, feeding `DonationReceipt`'s immutable snapshot.
- `finixSubscriptionId` — set when this payment resulted from a recurring charge.

**Relationships:** `receipts DonationReceipt[]` (the one real Prisma relation on this model). Every other link (`donorId`, `givingLinkId`, `pledgeId`, `churchId`) is FK-by-convention.

**Invariants:** `@@unique([finixTransferId])` — at most one `Payment` per Finix transfer, full stop; this is the primary defense against duplicate-charge bugs anywhere in the codebase.

### `DonationReceipt`
Immutable per-version snapshot of what was actually shown to a donor for a given `Payment` — a correction creates a new version (`version` increments) rather than mutating the original; the old row gets `supersededAt` set. `@@unique([paymentId, version])` is also the atomic claim mechanism `sendDonationReceipt()` uses to guarantee **at most one receipt send per payment per version**, even under concurrent triggers (e.g. two webhook deliveries racing).

### `PaymentAttempt`
Created **before** the Finix API call, so a browser retry/double-click is recognized as the same logical attempt rather than minting a second charge.
- `clientAttemptId` (`@unique`) — stable key the frontend reuses across its own retries of one submission.
- `idempotencyId` (`@unique`) — generated server-side exactly once per `clientAttemptId`; this is the actual value sent to Finix as its idempotency key.
- `status`: `PROCESSING | PENDING | SUCCEEDED | FAILED | CANCELED`.
- Indexed on `[status, updatedAt]` specifically to support the reconciliation sweep's bounded stale-attempt scan (see [`ARCHITECTURE.md`](./ARCHITECTURE.md#5-reconciliation-sweeps)).

### `RefundRequest`
- `@@unique([finixTransferId, clientRefundId])` — **compound** unique (not unique on `finixTransferId` alone, since one payment can have multiple distinct refund requests, e.g. partial refunds).
- `status`: `PENDING | SUCCEEDED | FAILED`.
- `finixReversalId` — set once the real Finix reversal is confirmed (by the initiating route, or by reconciliation via `reconcileRefundRequest()` matching on `tags.refundRequestId`, never by amount/timing).

### `FinixWebhookEvent`
Durable record of every Finix event received. `finixEventId` (`@unique`) is the primary dedupe key.
- `processingStatus`: `PENDING` (alias of `RECEIVED`) → `PROCESSING` → `COMPLETED` | `FAILED` | `ERROR`.
- `attempts`, `lockedAt`, `leaseUntil`, `workerId` — a lease-based stale-recovery mechanism mirroring `BackgroundJob`'s own (see below), though `BackgroundJob`'s lease is the one that actually governs retry scheduling for `PROCESS_FINIX_WEBHOOK` jobs — this table's own lease fields are informational/legacy.

### `BackgroundJob`
The durable outbox — see [`ARCHITECTURE.md`](./ARCHITECTURE.md#3-the-durable-background-job-outbox) for the full pattern.
- `status`: `PENDING → PROCESSING → COMPLETED`, or `PROCESSING → RETRY → PENDING` (loops until `maxAttempts`), or `PROCESSING → FAILED` (permanent).
- `dedupeKey` (`@unique`) — the enqueue-side idempotency mechanism; convention is `` `{jobType}:{scope}:{id}` ``, e.g. `SEND_RECEIPT:payment:pay_123:version:1`.
- `entityType`/`entityId` — untyped string reference to whatever this job is about (a `Payment`, `InvoicePayment`, `FinixWebhookEvent`, ...) — **not** a Prisma relation; see the [`ARCHITECTURE.md`](./ARCHITECTURE.md) ER-diagram note.
- `nextRunAt`, `lockedAt`, `leaseUntil`, `workerId`, `attempts`/`maxAttempts` — the claim/lease/retry machinery. Composite indexes `[status, nextRunAt]` and `[status, leaseUntil]` back the claim query and stale-lease reclaim scan respectively.

## Organizations, users, and access

### `User`
Shared across both merchant and admin surfaces via one `role` column: `wgc_super_admin | wgc_admin | church_admin (legacy) | owner | admin | fundraiser | viewer`. See [`AUTHENTICATION.md`](./AUTHENTICATION.md) for how these are interpreted differently depending on which session type is resolving them. `authVersion` and `passwordChangedAt` back session invalidation (bumping either invalidates all previously-issued tokens for that user on next check).

### `GivingLink`
A shareable public donation page config, scoped to a `Church` (and optionally a `Fund` via `GivingLinkFund`). `ownerUserId` — snapshotted onto every `Payment.attributedUserId` at creation time for reporting; reassigning a link's owner later does **not** retroactively rewrite past payments' attribution.

### `Donor`
CRM record for a person/entity who has given. `PossibleDonorMatch` + `DonorNote` support dedup and staff annotations.

## Invoicing

### `Invoice`, `InvoiceLineItem`, `InvoicePayment`, `InvoicePaymentAttempt`
Mirrors the `Payment`/`PaymentAttempt` pattern one level up for B2B-style invoicing: `InvoicePayment.@@unique([finixTransferId])` guarantees one Finix transfer maps to at most one recorded payment against an invoice; `InvoicePaymentAttempt` has the same `clientAttemptId`/`idempotencyKey` pre-charge tracking shape as `PaymentAttempt`. `InvoiceActivity` is an append-only audit log of state changes (sent, viewed, paid, reminded) per invoice.

## Recurring giving

### `FinixSubscription`, `SubscriptionConsent`, `SubscriptionSetupLink`, `SubscriptionAction`
A `FinixSubscription` represents a recurring-donation commitment mirrored from Finix's own Subscription resource. `SubscriptionSetupLink` is the donor-facing link used to establish or update the payment method for a subscription (see `POST /api/setup/[token]/complete` in [`API.md`](./API.md)); `supersedesSubscriptionId`-style linkage (see schema) handles the "donor updates their card" flow as create-new + cancel-old rather than mutating Finix's own subscription in place.

## Platform billing (WGC's own SaaS billing, separate from church-donor payments)

`WgcSubscription`, `WgcBillingAccount`, `BillingCharge`, `WgcPricingVersion`, `Promotion`/`PromotionEntitlement`/`PromotionLead`, `BillingActivationToken`, `WgcBillingSettings`, `WgcBillingAuditLog`. This whole cluster is intentionally isolated from the church-donor payment models above — see `src/lib/billing/` and [`ARCHITECTURE.md`](./ARCHITECTURE.md#6-wgcs-own-platform-billing).

## Finix data mirror

`FinixMerchantSnapshot`, `FinixTransfer`, `FinixRefundOrReversal`, `FinixFee`, `FinixSettlement`, `FinixFundingTransferAttempt`, `FinixDispute`, `FinixPaymentInstrumentSnapshot`, `FinixAuthorization`, `FinixMerchantProfile`, `FinixFeeProfile`, `FinixPayoutProfileSnapshot`, `FinixRawEventArchive`, `FinixSyncJob`. These are an **additive local mirror** of Finix's own resources (never the source of truth for money movement — Finix is), populated by `src/lib/finix/sync/*` for reporting/admin-dashboard use and reconciliation.

## Support, compliance, and admin

`SupportTicket`/`SupportTicketMessage`/`SupportTicketAttachment`, `OnboardingApplication`/`OnboardingInternalDocument`/`AssociatedOwner`/`LegalAcceptance`, `ComplianceForm`, `MerchantDocument`, `AuditLog`/`DashboardAuditLog`, `AdminImpersonationSession`, `MerchantStatusHistory`, `EmailLog`/`OrgEmailLog`/`BillingEmailLog`.

## Reporting and statements

`ReportSnapshot`, `SavedReport`, `AnnualDonationStatement`/`AnnualDonationStatementLine`, `BulkStatementJob`, `BulkReceiptJob`.

## Merchandise

`MerchandiseProduct`/`MerchandiseVariant`, `GivingPageMerchandise`, `MerchandiseOrder`/`MerchandiseOrderItem`, `WgcCheckout`, `MerchandiseWebhookEvent`, `MerchandiseSyncLog`, `MerchandiseSettings`, `PrintfulConnection` — the merchandise/fulfillment slice, integrated with Printful.

## Pledges

`PledgeCampaign`, `Pledge` — campaign-goal tracking; a `Payment.pledgeId` can link a donation as evidence toward a pledge's fulfillment.

## External integrations

- **QuickBooks**: `QuickBooksConnection`, `QuickBooksSyncRecord`, `QuickBooksBackfillJob`.
- **Aplos**: `AplosConnection`, `AplosPurposeMapping`, `AplosAccountConfiguration`, `AplosSyncRecord`, `AplosSyncAttempt`.
- **External donation import** (e.g. migrating from another platform): `ExternalDonation`, `ExternalDonationImportBatch`, `ExternalDonationImportRow`, `ExternalDonationAuditLog`.

## Misc

`Client` (invoicing-side "who this invoice bills"), `SynchronizationState` (generic per-church sync-cursor tracking), `FirstLookLead`/`FirstLookLeadNote`/`FirstLookLeadActivity` (a sales/lead-gen feature), `AuthAccount` (auth-adjacent), `ContactInquiry` (public contact form), `Fund`/`GivingLinkFund` (fund designation), `NotificationPreference`, `OrganizationBankAccount`/`PayoutAccountDocument`/`PayoutAccountChangeRequest`, `OrganizationContact`, `BankReturn`, `DisputeEvidence`.

## Cross-cutting invariants worth remembering

- **Idempotency is a schema-level guarantee, not a code-review hope**: `Payment.finixTransferId`, `InvoicePayment.finixTransferId`, `BackgroundJob.dedupeKey`, `PaymentAttempt.idempotencyId`, `InvoicePaymentAttempt.idempotencyKey`/`clientAttemptId`, `RefundRequest.[finixTransferId, clientRefundId]`, `FinixWebhookEvent.finixEventId`, `DonationReceipt.[paymentId, version]` are all real `@unique`/`@@unique` constraints that the application relies on for correctness under concurrency (P2002-catch-and-recover pattern), not just for data cleanliness.
- **No cascading deletes are declared** anywhere in the models reviewed — deletion/archival is handled at the application level where it exists at all (most models appear to be append-only/soft-status in practice).
- **Money is always stored in integer cents** (`amountCents`, `totalCents`, etc.) — never floating point.

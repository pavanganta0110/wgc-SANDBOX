# WGC Profit Report

## Status

Live, admin-only. Admin → Billing & Subscriptions → WGC Profit tab.

## What it shows

For a date range: `(what WGC charged the merchant/donor) − (what Finix
actually charged WGC)`, summed overall and broken down per organization.

## Why this is a separate computation from `Payment.actualFinixFeesCents`

`Payment.actualFinixFeesCents` already exists and is populated by the
Finix webhook handler (`src/app/api/webhooks/finix/route.ts`), but it's
relied on by merchant-facing code — specifically the Aplos export
(`src/lib/integrations/aplos/contributionBuilder.ts`,
`settlementReconciliation.ts`), which pushes it into a merchant's own
Aplos accounting books as `processorFeeCents`. Changing how that field is
computed would change what merchants see in their own accounting
software, which was explicitly out of scope for this feature.

That field is also computed with a heuristic that's confirmed imprecise:
it excludes any `FinixFee.feeType` containing `"APPLICATION"` from the
sum, on the theory that those rows are WGC's own platform fee, not a real
Finix/processor cost. But a real production row was found where
`feeType: "CARD_BASIS_POINTS"` (doesn't contain "APPLICATION", so it's
counted as a cost) actually had `feeSubtype: "PLATFORM_FEE"` — meaning
it's WGC's own revenue, not a Finix cost, and the old heuristic
miscategorizes it.

This report instead:

1. Reconstructs "what WGC charged" fresh from each `Payment`'s own
   snapshotted `percentageBps` / `fixedFeeCents` / `donationAmountCents`
   — the same values `feeCalculator.ts` computed and stored at charge
   time, so this is exact, not an estimate, for either a donor-covered or
   organization-paid transaction.
2. Reconstructs "what Finix charged WGC" fresh from `FinixFee` rows,
   filtering on the network-agnostic `feeSubtype` field (`!=
   "PLATFORM_FEE"`) instead of pattern-matching `feeType`, which varies
   per card network (Visa/Mastercard/Amex/Discover all report different
   `feeType` strings, but `feeSubtype`/`category` do not).

Never writes back to `Payment.actualFinixFeesCents` or anything a
merchant can see — `src/lib/reports/wgcProfit.ts` only reads.

## Known data-completeness gap

Finix's own dashboard can show far more fee line items per transaction
than what WGC currently syncs — interchange, card-network dues and
assessments, etc., in addition to Finix's own processor markup. A single
card transaction can have 5-8+ separate `FinixFee` rows. Two likely
causes, not yet fully diagnosed:

- **Pagination**: `syncFeesForTransfer` (`src/lib/finix/sync/syncFees.ts`)
  now follows Finix's HAL `_links.next` pagination — previously it read
  only the first page of `GET /fees?linked_to={id}`, silently dropping
  any additional fee lines beyond the first page.
- **Timing**: interchange and dues-and-assessments fee lines likely
  settle with the card networks on Finix's own delayed schedule (a real
  synced fee row's `ready_to_settle_at` was observed roughly a day after
  its `created_at`) — meaning a one-time sync triggered by the transfer
  webhook, right when the transfer completes, may run before Finix's own
  backend has finalized those line items. **No delayed re-sync/backfill
  cron exists yet** to catch fee lines that appear on Finix's side after
  the initial sync. Until one exists, `finixCostCents` in this report
  should be read as a floor (the real cost is likely somewhat higher),
  not an exact figure — the `paymentsMissingFeeDataCount` in the API
  response only counts payments with *zero* synced fee rows, not
  payments whose fee rows are present but incomplete.

## Where it lives

- `src/lib/reports/wgcProfit.ts` — `getWgcProfitSummary()`, the
  aggregation itself.
- `src/app/api/admin/billing/wgc-profit/route.ts` — `GET`, gated behind
  `resolveWgcAdminBillingPermissions(...).canViewBilling`.
- `src/app/admin/(dashboard)/billing/page.tsx` — `WgcProfitTab`
  component, added to the existing Billing & Subscriptions admin tabs.
- `FinixFee.category` / `FinixFee.feeSubtype` — new columns
  (`prisma/schema.prisma`) capturing Finix's own network-agnostic fee
  classification, populated going forward by `syncFeesForTransfer`.
  Historical `FinixFee` rows synced before this feature shipped have
  these columns `null` even though the original API response is still
  available in `rawJsonRedacted`.

## Not built yet

- A delayed re-sync/backfill cron to catch interchange/dues-and-assessments
  fee lines that settle on Finix's side after the initial webhook-triggered
  sync (see "Known data-completeness gap" above).
- A backfill script to re-derive `category`/`feeSubtype` for historical
  `FinixFee` rows from their preserved `rawJsonRedacted` payload, without
  a live re-fetch from Finix.
- Per-transaction drill-down in the UI (currently: overall totals +
  per-organization rollup only, no row-per-payment table).

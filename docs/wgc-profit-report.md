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

## Delayed re-sync (built)

`src/app/api/cron/resync-transfer-fees/route.ts`, scheduled daily
(`vercel.json`). Re-runs `syncFeesForTransfer` for every `SUCCEEDED`
payment 1-5 days old — bounded window, not the whole history, to stay
fast. Safe to re-run indefinitely: `syncFeesForTransfer` upserts on
`finixFeeId`, so this can never create duplicate fee rows, only fill in
lines that weren't available at the original sync time.

## Historical backfill (run once, 2026-09-02)

`scripts/backfill-finix-fee-classification.mjs` re-derives
`category`/`feeSubtype` for existing `FinixFee` rows from their preserved
`rawJsonRedacted` payload — no Finix API call, pure DB read/write, safe
to re-run (only touches rows still missing either field). Already applied
directly to both production and sandbox databases.

**Real finding from running it**: every single historical `FinixFee` row
in both databases (40 in production, 88 in sandbox) turned out to have
`feeSubtype: "PLATFORM_FEE"` — meaning **no genuine Finix/processor cost
line item (interchange, dues and assessments, etc.) has ever actually
been synced**, historically, in either environment. Every dollar
previously counted toward `actualFinixFeesCents` (and now correctly
excluded from this report's `finixCostCents`) was WGC's own fee, not a
real cost. Until the new resync cron has had time to run and catch real
cost lines going forward, `finixCostCents` in this report will show
close to $0 for historical date ranges — that's accurate to what's
actually been captured, not a bug, but it means the report currently
understates Finix's real cost (and therefore overstates profit) for
anything before this fix shipped.

## `fee_category` vs `category` (2026-09-02 update)

Finix's own docs describe a `fee_category` field on the Fee object with
three documented values: `PLATFORM_FEE` (WGC's own revenue),
`PASSTHROUGH_FEE` (interchange + card network dues and assessments — the
real cost this report wants), and `PROGRAM_FEE` (Finix's own cut). This
is a **different field** from the wire `category` field already captured
(`FinixFee.category`) — every real response synced so far has
`"category": "PROCESSOR"` and has never included a `fee_category` key at
all. `FinixFee.feeCategory` was added to capture it the moment it does
start appearing. `getWgcProfitSummary()` excludes a fee row from cost if
*either* `feeSubtype` or `feeCategory` equals `"PLATFORM_FEE"`, so real
`PASSTHROUGH_FEE` data is correctly counted the moment it lands, however
Finix ends up populating it.

Finix's own docs (Consolidated Fees Reports) also explain the real
timing: "Due to the time it takes for our processor to deliver data,
this column can be incomplete or blank until Finix receives and
processes all data up to the 15th day of the following month." This is
why the original daily resync (1-5 days back) found nothing even when
manually triggered and confirmed to run cleanly — passthrough/interchange
data isn't available on anywhere near that timescale.

## Monthly resync (built)

`src/app/api/cron/resync-monthly-transfer-fees/route.ts`, scheduled on
the 16th of each month (`vercel.json`) — a full day after Finix's own
"by the 15th" cutoff. Re-syncs every `SUCCEEDED` payment from the entire
previous calendar month (not just a short recent window, unlike the
daily job). Same idempotent guarantee as the daily resync — safe to
re-run, can never create duplicate fee rows.

## Not built yet

- Per-transaction drill-down in the UI (currently: overall totals +
  per-organization rollup only, no row-per-payment table).
- Confirmation from Finix that `GET /fees?linked_to={id}` is even the
  correct endpoint for `PASSTHROUGH_FEE` data — as of this writing, no
  real `PASSTHROUGH_FEE`/interchange data has ever been observed from
  this endpoint (via API or the matching `fee.created` webhook), only
  `PLATFORM_FEE`. The monthly cron is built and ready to capture it the
  moment it appears, but whether it appears via this exact endpoint is
  still unconfirmed.

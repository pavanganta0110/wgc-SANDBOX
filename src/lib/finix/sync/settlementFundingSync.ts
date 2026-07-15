import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";
import { toSettlementFieldsForCreate, toSettlementFieldsForUpdate, linkTransfersToSettlement, recomputeSettlementAggregates } from "@/lib/finix/sync/syncSettlements";

/**
 * Live settlement + merchant-deposit refresh, following the same
 * "webhook is the primary mechanism, this is the self-healing fallback"
 * pattern as reconcilePendingPayoutAccountsForChurch — called whenever a
 * merchant opens a settlement's detail view (see settlementDetail.ts) or
 * the settlements list (see settlementsList.ts), so a missing/stale/
 * mis-scoped webhook row is never the only chance to get this right.
 */

// Shared throttle — a settlement triggers a real Finix API round trip
// (settlement + funding transfers) at most this often across every caller
// (detail view, list view), so rapid re-renders/navigation/pagination
// don't hammer Finix, while staying well within the range where a
// merchant sees corrected data shortly after a missed/delayed webhook
// instead of a permanently stale UNKNOWN/unlinked row.
export const LIVE_REFRESH_THROTTLE_MS = 30_000;

export function isStaleEnoughToRefresh(lastSyncedAt: Date | null | undefined): boolean {
  return !lastSyncedAt || Date.now() - lastSyncedAt.getTime() > LIVE_REFRESH_THROTTLE_MS;
}

/**
 * Identifies the merchant's own bank-deposit funding transfer among
 * Finix's settlement funding-transfer response — confirmed against a real
 * sandbox settlement (GET /settlements/{id}/funding_transfers): the
 * response's `_embedded.transfers` array contains one entry per deposit,
 * each with a `subtype` of either "SETTLEMENT_MERCHANT" (the church's own
 * payout) or "SETTLEMENT_PLATFORM" (WGC's own revenue transfer) — this is
 * the authoritative field, not a guess. The merchant dashboard must never
 * show the platform's transfer. `merchant` (confirmed real field) is used
 * as a second check when available, purely as defense-in-depth.
 */
export function selectMerchantFundingTransfer(fundingTransfers: any[], finixMerchantId: string | null): any | null {
  if (!Array.isArray(fundingTransfers) || fundingTransfers.length === 0) return null;

  const merchantCandidates = fundingTransfers.filter((t) => t?.subtype === "SETTLEMENT_MERCHANT");
  if (merchantCandidates.length === 0) return null;

  if (finixMerchantId) {
    const exact = merchantCandidates.find((t) => t?.merchant === finixMerchantId);
    if (exact) return exact;
  }

  // No merchant id to disambiguate, or none matched exactly — only safe to
  // guess when there's just one SETTLEMENT_MERCHANT candidate.
  return merchantCandidates.length === 1 ? merchantCandidates[0] : null;
}

/**
 * Maps one raw Finix funding-transfer object to this app's DB field shape.
 * Confirmed against a real sandbox response: this Transfer object has no
 * bank_name/masked_account_number/account_type/funding_speed fields at
 * all — those were an earlier, incorrect assumption. Bank display info
 * comes exclusively from resolving `destination` (a payment-instrument
 * id) against OrganizationBankAccount (see settlementDetail.ts), never
 * from this object directly.
 */
export function mapFundingTransferFields(transfer: any) {
  return {
    state: transfer.state ?? null,
    amountCents: transfer.amount ?? null,
    netAmountCents: transfer.amount ?? null,
    currency: transfer.currency ?? null,
    fundingSpeed: null,
    bankAccountLast4: null,
    bankAccountType: null,
    bankName: null,
    accountHolderName: null,
    destinationPaymentInstrumentId: transfer.destination ?? null,
    failureCode: transfer.failure_code ?? null,
    failureMessage: transfer.failure_message ?? null,
    traceId: transfer.trace_id ?? null,
    estimatedArrivalDate: null,
    sentAt: null,
    arrivedAt: null,
    createdAtFinix: transfer.created_at ? new Date(transfer.created_at) : null,
    updatedAtFinix: transfer.updated_at ? new Date(transfer.updated_at) : null,
  };
}

/**
 * Looks for a funding-transfer/deposit-related HAL link on a settlement
 * response's own `_links` object — Finix's dashboard clearly ties
 * "Merchant Deposits"/"Platform Deposits" back to a settlement (confirmed
 * visually against a real settlement's detail view), so the settlement
 * resource itself is the most likely place to find the authoritative href
 * for that related data, rather than guessing a REST sub-path. Matches any
 * link key containing "funding" or "deposit", case-insensitively.
 */
export function findFundingTransfersHref(settlement: any): string | null {
  const links = settlement?._links;
  if (!links || typeof links !== "object") return null;
  for (const [key, value] of Object.entries(links)) {
    if (!/funding|deposit/i.test(key)) continue;
    const href = (value as any)?.href;
    if (typeof href === "string" && href) return href;
  }
  return null;
}

/**
 * True when the incoming Finix timestamp is not older than what's already
 * stored — an out-of-order webhook/refresh must never overwrite a newer
 * state with an older one. When either side is missing a timestamp, this
 * defaults to allowing the update (matches this codebase's existing
 * "trust the latest sync" behavior when timestamps aren't available).
 */
export function isFreshEnoughToApply(existingUpdatedAtFinix: Date | null | undefined, incomingUpdatedAtFinix: Date | null | undefined): boolean {
  if (!existingUpdatedAtFinix || !incomingUpdatedAtFinix) return true;
  return incomingUpdatedAtFinix.getTime() >= existingUpdatedAtFinix.getTime();
}

export interface SettlementFundingRefreshResult {
  refreshed: boolean;
  hasFundingTransferData: boolean;
  error?: string;
}

/**
 * Re-pulls a settlement and its merchant funding transfer directly from
 * Finix and upserts both into the DB — the live-refresh half of "read
 * local first, then confirm against Finix" (see loadSettlementDetail).
 * Never throws; a Finix-side failure just means the caller falls back to
 * whatever's already in the DB.
 */
export async function refreshSettlementAndDepositFromFinix(
  finixSettlementId: string,
  churchId: string,
  finixMerchantId: string | null,
): Promise<SettlementFundingRefreshResult> {
  try {
    const settlement = await finixClient.getSettlement(finixSettlementId);

    await prisma.finixSettlement.upsert({
      where: { finixSettlementId },
      create: {
        finixSettlementId,
        churchId,
        finixMerchantId: finixMerchantId ?? settlement?.merchant_id ?? null,
        ...toSettlementFieldsForCreate(settlement),
        rawJsonRedacted: redactFinixPayload(settlement),
        createdAtFinix: settlement.created_at ? new Date(settlement.created_at) : null,
        updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        ...toSettlementFieldsForUpdate(settlement),
        rawJsonRedacted: redactFinixPayload(settlement),
        updatedAtFinix: settlement.updated_at ? new Date(settlement.updated_at) : undefined,
        lastSyncedAt: new Date(),
      },
    });

    try {
      await linkTransfersToSettlement(finixSettlementId);
      await recomputeSettlementAggregates(finixSettlementId);
    } catch (err) {
      console.error("Failed to link transfers during settlement live refresh:", err);
    }

    let hasFundingTransferData = false;
    try {
      // Confirmed against a real sandbox settlement: the settlement's own
      // _links.funding_transfers.href is real (GET .../funding_transfers),
      // and its response envelope is _embedded.transfers (an array of
      // Transfer objects, distinguished by `subtype` — see
      // selectMerchantFundingTransfer). Prefer following the settlement's
      // own href when present; fall back to the constructed path only if
      // Finix ever omits that link.
      const fundingHref = findFundingTransfersHref(settlement);
      const response = fundingHref ? await finixClient.fetchByHref(fundingHref) : await finixClient.getSettlementFundingTransfers(finixSettlementId);
      const fundingTransfers: any[] =
        response?._embedded?.transfers ?? response?._embedded?.funding_transfers ?? response?.funding_transfers ?? (Array.isArray(response) ? response : []);
      hasFundingTransferData = true;

      const merchantTransfer = selectMerchantFundingTransfer(fundingTransfers, finixMerchantId);
      if (merchantTransfer?.id) {
        const existing = await prisma.finixFundingTransferAttempt.findUnique({
          where: { finixFundingTransferAttemptId: merchantTransfer.id },
        });
        const mapped = mapFundingTransferFields(merchantTransfer);

        if (isFreshEnoughToApply(existing?.updatedAtFinix, mapped.updatedAtFinix)) {
          await prisma.finixFundingTransferAttempt.upsert({
            where: { finixFundingTransferAttemptId: merchantTransfer.id },
            create: {
              finixFundingTransferAttemptId: merchantTransfer.id,
              churchId,
              finixMerchantId,
              finixSettlementId,
              ...mapped,
              rawJsonRedacted: redactFinixPayload(merchantTransfer),
              lastSyncedAt: new Date(),
            },
            update: {
              churchId: churchId ?? undefined,
              finixSettlementId: finixSettlementId ?? undefined,
              state: mapped.state ?? undefined,
              amountCents: mapped.amountCents ?? undefined,
              netAmountCents: mapped.netAmountCents ?? undefined,
              currency: mapped.currency ?? undefined,
              fundingSpeed: mapped.fundingSpeed ?? undefined,
              bankAccountLast4: mapped.bankAccountLast4 ?? undefined,
              bankAccountType: mapped.bankAccountType ?? undefined,
              bankName: mapped.bankName ?? undefined,
              accountHolderName: mapped.accountHolderName ?? undefined,
              destinationPaymentInstrumentId: mapped.destinationPaymentInstrumentId ?? undefined,
              failureCode: mapped.failureCode ?? undefined,
              failureMessage: mapped.failureMessage ?? undefined,
              traceId: mapped.traceId ?? undefined,
              estimatedArrivalDate: mapped.estimatedArrivalDate ?? undefined,
              sentAt: mapped.sentAt ?? undefined,
              arrivedAt: mapped.arrivedAt ?? undefined,
              rawJsonRedacted: redactFinixPayload(merchantTransfer),
              updatedAtFinix: mapped.updatedAtFinix ?? undefined,
              lastSyncedAt: new Date(),
            },
          });
        }
      }
    } catch (err) {
      // Funding-transfer endpoint is unconfirmed (see client.ts comment) —
      // a 404/unexpected-shape failure here must not fail the whole
      // refresh; the settlement itself was already synced above, and the
      // caller falls back to whatever's already in FinixFundingTransferAttempt.
      console.error(`Settlement funding-transfer refresh failed for ${finixSettlementId}:`, err);
    }

    if (process.env.FINIX_SYNC_DEBUG === "true") {
      const currentDeposit = await prisma.finixFundingTransferAttempt.findFirst({
        where: { finixSettlementId, churchId },
        orderBy: { createdAtFinix: "desc" },
      });
      console.info("Finix settlement sync", {
        settlementId: finixSettlementId,
        merchantId: finixMerchantId,
        settlementStatus: settlement?.status ?? null,
        fundingTransferCount: hasFundingTransferData ? 1 : 0,
        merchantDepositState: currentDeposit?.state ?? null,
        destinationLast4: currentDeposit?.bankAccountLast4 ?? null,
      });
    }

    return { refreshed: true, hasFundingTransferData };
  } catch (err) {
    console.error(`Settlement live refresh failed for ${finixSettlementId}:`, err);
    return { refreshed: false, hasFundingTransferData: false, error: err instanceof Error ? err.message : String(err) };
  }
}

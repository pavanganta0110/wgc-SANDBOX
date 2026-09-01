import { prisma } from "@/lib/prisma";
import { getResourceClientForChurch } from "./service";
import { isQuickBooksIntegrationEnabled, isQuickBooksIntegrationConfigured } from "./config";
import type { NormalizedQuickBooksError } from "./errors";

/** Both QuickBooksNormalizedApiError (resourceClient.ts) and
 * QuickBooksAuthError (authProvider.ts) carry a `.normalized` field with
 * the real diagnostic detail (intuit_tid, raw Intuit fault text, fault
 * code) — logged here for troubleshooting, never stored in the DB's
 * merchant-facing errorMessage/lastSyncError fields, which stay limited
 * to the safe, generic message. */
function extractDiagnostics(err: unknown): NormalizedQuickBooksError | undefined {
  if (err && typeof err === "object" && "normalized" in err) {
    return (err as { normalized: NormalizedQuickBooksError }).normalized;
  }
  return undefined;
}

/**
 * Best-effort, fire-after-success sync of one completed donation into
 * QuickBooks as a Customer + Payment — never throws, never delays or
 * affects the donor's own payment response. Call sites use a plain
 * `await` immediately after the donation is confirmed SUCCEEDED, wrapped
 * in their own try/catch exactly like sendDonationReceipt already is, as
 * a second layer of protection.
 *
 * Idempotent via QuickBooksSyncRecord: a payment already SUCCEEDED here
 * is never re-synced (e.g. on a webhook retry). A prior FAILED attempt
 * is retried in place (same row updated), not duplicated.
 *
 * Money-mixing safety: this only ever calls QuickBooks for a church with
 * an actual CONNECTED QuickBooksConnection row (opt-in, per organization,
 * set only via a real completed OAuth flow) — a church that never
 * connected is untouched, and which Intuit company (sandbox vs. real
 * production company) receives the data is entirely determined by that
 * organization's own OAuth connection, not by this code.
 */
export async function syncPaymentToQuickBooks(paymentId: string): Promise<void> {
  try {
    if (!isQuickBooksIntegrationEnabled() || !isQuickBooksIntegrationConfigured()) return;

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return;

    // Payment.donorId is a plain string FK (no Prisma relation), matching
    // this schema's established convention — fetched separately.
    const donor = payment.donorId ? await prisma.donor.findUnique({ where: { id: payment.donorId } }) : null;

    const connection = await prisma.quickBooksConnection.findUnique({ where: { churchId: payment.churchId } });
    if (!connection || connection.status !== "CONNECTED") return;

    const existing = await prisma.quickBooksSyncRecord.findFirst({
      where: { quickBooksConnectionId: connection.id, entityType: "PAYMENT", localEntityId: payment.id },
    });
    if (existing?.status === "SUCCEEDED") return;

    const syncRecord =
      existing ??
      (await prisma.quickBooksSyncRecord.create({
        data: {
          quickBooksConnectionId: connection.id,
          churchId: payment.churchId,
          entityType: "PAYMENT",
          localEntityId: payment.id,
          status: "PENDING",
        },
      }));

    try {
      const client = await getResourceClientForChurch(payment.churchId);

      const donorName = donor?.name?.trim() || donor?.email?.trim() || "WGC Donor";
      let customer = await client.findCustomerByDisplayName(donorName);
      if (!customer) {
        customer = await client.createCustomer({
          DisplayName: donorName,
          ...(donor?.email ? { PrimaryEmailAddr: { Address: donor.email } } : {}),
        });
      }

      // The gift amount the donor designated, not the total they were
      // charged (which can include a donor-covered processing fee) —
      // matches how donationAmountCents is already treated as the
      // canonical "the donation" figure everywhere else in this codebase
      // (receipts, thank-you screens, statements).
      const qbPayment = await client.createPayment({
        CustomerRef: { value: customer.Id! },
        TotalAmt: (payment.donationAmountCents ?? payment.amountCents) / 100,
        PrivateNote: payment.finixSubscriptionId
          ? `Recurring donation (WGC subscription ${payment.finixSubscriptionId})`
          : "One-time donation (WGC Payments)",
      });

      await prisma.quickBooksSyncRecord.update({
        where: { id: syncRecord.id },
        data: { status: "SUCCEEDED", quickBooksEntityId: qbPayment.Id ?? null, errorMessage: null },
      });
      await prisma.quickBooksConnection.update({
        where: { id: connection.id },
        data: { lastSuccessfulSyncAt: new Date(), lastSyncAt: new Date(), lastSyncStatus: "SUCCESS", lastSyncError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown QuickBooks sync error";
      await prisma.quickBooksSyncRecord.update({
        where: { id: syncRecord.id },
        data: { status: "FAILED", errorMessage: message },
      });
      await prisma.quickBooksConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: new Date(), lastSyncStatus: "FAILED", lastSyncError: message },
      });
      console.error("QuickBooks sync failed for payment", paymentId, {
        message,
        diagnostics: extractDiagnostics(err),
        raw: err,
      });
    }
  } catch (err) {
    // Outer guard: a failure resolving the connection/payment itself
    // (not the QuickBooks API call) must still never propagate to the
    // donor-facing request.
    console.error("QuickBooks sync setup failed for payment", paymentId, {
      diagnostics: extractDiagnostics(err),
      raw: err,
    });
  }
}

import { prisma } from "@/lib/prisma";
import { notifyEvent } from "@/lib/settings/notificationDispatch";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Tells the organization an external (offline / non-WGC-processed) donation
 * was recorded — the counterpart of notifyMerchantOfNewDonation for gifts
 * that never touch Finix. Goes through notifyEvent, so it honours the org's
 * notification preference, is logged in Email Logs, and never throws.
 *
 * Call only from the single-entry route, never from the CSV import (that
 * would send one email per row).
 */
export async function notifyMerchantOfExternalDonation(externalDonationId: string, churchId: string) {
  const donation = await prisma.externalDonation.findFirst({ where: { id: externalDonationId, churchId } });
  if (!donation) return;

  const donor = donation.donorId ? await prisma.donor.findUnique({ where: { id: donation.donorId } }) : null;
  const donorName = donation.isAnonymous ? "An anonymous donor" : donor?.name ? formatPersonName(donor.name) : "An unmatched donor";
  const methodLabel = donation.paymentMethod === "OTHER" ? donation.otherPaymentMethodName || "Other" : donation.paymentMethod.replace(/_/g, " ").toLowerCase();
  const amount = formatCents(donation.donationAmountCents);

  await notifyEvent({
    churchId,
    eventKey: "EXTERNAL_DONATION_RECORDED",
    relatedEntityType: "ExternalDonation",
    relatedEntityId: donation.id,
    subject: `External donation recorded: ${amount}`,
    title: "External donation recorded",
    badgeText: "External Donation",
    badgeColor: "#0EA5E9",
    bodyHtml: `
      <p>An external donation of <strong>${amount}</strong> was recorded${donation.fundName ? ` to <strong>${donation.fundName}</strong>` : ""}. It was not processed through WGC Payments.</p>
      <table style="width:100%;text-align:left;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Amount:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${amount}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Donor:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${donorName}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Method:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${methodLabel}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Date:</strong></td><td style="padding:8px 0;">${donation.donationDate.toISOString().slice(0, 10)}</td></tr>
      </table>
    `,
  });

  await logDashboardAction({ churchId, action: "external_donation.merchant_notified", entityType: "ExternalDonation", entityId: donation.id });
}

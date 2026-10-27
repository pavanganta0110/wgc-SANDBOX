import { sendWgcEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

/**
 * Recurring-signup confirmation only — sent when a donor sets up a new
 * recurring schedule, before any individual charge has actually occurred.
 * This is intentionally NOT the IRS-style tax receipt (no receipt number,
 * no acknowledgment/goods-or-services section, no PDF) since no completed
 * contribution exists yet to receipt. The real, settings-driven, PDF tax
 * receipt for a completed donation is sendDonationReceipt() in
 * @/lib/giving/generateReceipt, used for every one-time gift and should be
 * used for each individual recurring charge once one is recorded as a
 * Payment.
 */
export async function sendReceiptEmail(
  to: string,
  name: string,
  organizationName: string,
  amountCents: number,
  isRecurring: boolean,
  interval?: string,
  churchId?: string,
  donorId?: string
) {
  const amount = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  try {
    // Link to the donor portal (sign-in is by emailed code, so the link itself carries no credential).
    const church = churchId ? await prisma.church.findUnique({ where: { id: churchId }, select: { slug: true } }) : null;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
    const portalHtml = church
      ? `<p><a href="${appUrl}/give/${church.slug}/account">View or manage your giving</a></p>`
      : "";

    await sendWgcEmail({
      to,
      subject: `Thank you for your gift to ${organizationName}`,
      title: "Thank You for Your Gift",
      badgeText: "Receipt",
      badgeColor: "#10B981",
      bodyHtml: `
        <p>Hi ${name},</p>
        <p>Thank you for your ${isRecurring ? `recurring (${(interval || "monthly").toLowerCase()})` : ""} gift of <strong>${amount}</strong> to <strong>${organizationName}</strong>.</p>
        <p>This receipt is confirmation of your generosity. Keep it for your tax records.</p>
        ${portalHtml}
      `,
      ...(churchId
        ? { log: { churchId, donorId: donorId ?? null, recipientName: name, category: "RECURRING_CONFIRMATION" as const } }
        : {}),
    });
  } catch (err) {
    console.error("Failed to send donation receipt:", err);
  }
}

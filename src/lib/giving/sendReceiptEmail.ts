import { sendWgcEmail } from "@/lib/email";

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
  interval?: string
) {
  const amount = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  try {
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
      `,
    });
  } catch (err) {
    console.error("Failed to send donation receipt:", err);
  }
}

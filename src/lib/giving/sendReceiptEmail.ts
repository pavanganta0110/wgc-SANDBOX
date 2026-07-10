import { sendWgcEmail } from "@/lib/email";

/**
 * Shared donation receipt email — used by both the public giving page and
 * the church admin's "Take a Payment" flow, so a donation looks identical
 * to the donor regardless of how it was entered.
 */
export async function sendReceiptEmail(
  to: string,
  name: string,
  churchName: string,
  amountCents: number,
  isRecurring: boolean,
  interval?: string
) {
  const amount = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  try {
    await sendWgcEmail({
      to,
      subject: `Thank you for your gift to ${churchName}`,
      title: "Thank You for Your Gift",
      badgeText: "Receipt",
      badgeColor: "#10B981",
      bodyHtml: `
        <p>Hi ${name},</p>
        <p>Thank you for your ${isRecurring ? `recurring (${(interval || "monthly").toLowerCase()})` : ""} gift of <strong>${amount}</strong> to <strong>${churchName}</strong>.</p>
        <p>This receipt is confirmation of your generosity. Keep it for your tax records.</p>
      `,
    });
  } catch (err) {
    console.error("Failed to send donation receipt:", err);
  }
}

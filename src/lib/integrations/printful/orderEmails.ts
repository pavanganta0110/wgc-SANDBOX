import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { notifyEvent } from "@/lib/settings/notificationDispatch";
import { formatCents } from "@/lib/format";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Merchandise orders previously sent zero emails — no donor confirmation,
 * no seller notification — unlike donations, which already had
 * sendDonationReceipt. A donor buying a T-shirt got the exact same silence
 * as if nothing had happened; the church had no way to learn about a new
 * order except by checking the dashboard. Both gaps are filled here,
 * following the existing patterns exactly: sendWgcEmail for the donor side
 * (same as sendDonationReceipt), notifyEvent for the seller side (same
 * preference-gated, best-effort pattern already used for disputes/payouts/
 * subscription failures — see notificationDispatch.ts).
 *
 * Both are best-effort: a failure here must never undo or block the
 * already-successful payment and order creation that happened before
 * either of these is called (same rule createMerchandiseOrder itself
 * already follows for Printful submission failures).
 */

function orderItemsHtml(items: { productName: string; variantName: string | null; quantity: number; lineTotal: number }[]): string {
  return items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${i.productName}${i.variantName ? ` — ${i.variantName}` : ""} × ${i.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;text-align:right;">${formatCents(i.lineTotal)}</td></tr>`
    )
    .join("");
}

/** Sent to the donor once their merchandise order is created (regardless
 * of whether Printful submission succeeds immediately — the payment
 * already succeeded, so the donor's confirmation shouldn't wait on or be
 * blocked by a downstream fulfillment-provider call). */
export async function sendMerchandiseOrderConfirmation(orderId: string) {
  const order = await prisma.merchandiseOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new Error("Order not found");
  if (!order.customerEmail) return { success: false, error: "Order has no customer email on file" };

  const church = await prisma.church.findUnique({ where: { id: order.churchId }, select: { name: true } });
  const orgName = church?.name || "the organization you supported";

  const addressLines = [order.shippingName, order.shippingAddress1, order.shippingAddress2, [order.shippingCity, order.shippingState, order.shippingPostalCode].filter(Boolean).join(", "), order.shippingCountry]
    .filter(Boolean)
    .join("<br>");

  const result = await sendWgcEmail({
    to: order.customerEmail,
    subject: `Your order ${order.wgcOrderNumber} from ${orgName}`,
    title: "Order confirmed",
    badgeText: "Order Confirmation",
    badgeColor: "#0B5DBC",
    bodyHtml: `
      <p>Thanks for your order from <strong>${orgName}</strong>! Here's your confirmation.</p>
      <p style="color:#64748B;font-size:13px;">Order ${order.wgcOrderNumber}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${orderItemsHtml(order.items)}
        <tr><td style="padding:8px 0;">Shipping</td><td style="padding:8px 0;text-align:right;">${formatCents(order.shippingAmount)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:700;">Total</td><td style="padding:8px 0;text-align:right;font-weight:700;">${formatCents(order.totalMerchandiseAmount)}</td></tr>
      </table>
      <p style="color:#64748B;font-size:13px;">Shipping to:<br>${addressLines || "—"}</p>
      <p>We'll email you again once your order ships.</p>
    `,
    log: {
      churchId: order.churchId,
      donorId: order.donorId,
      recipientName: order.shippingName,
      category: "MERCHANDISE_ORDER",
      relatedEntityType: "MerchandiseOrder",
      relatedEntityId: orderId,
    },
  });

  await prisma.emailLog.create({
    data: {
      type: "MERCHANDISE_ORDER_CONFIRMATION",
      to: order.customerEmail,
      subject: `Your order ${order.wgcOrderNumber} from ${orgName}`,
      status: result.success ? "SENT" : "ERROR",
      sentAt: result.success ? new Date() : null,
      error: result.success ? null : String(result.error ?? "unknown error"),
    },
  });

  return result;
}

/** Sent to the church/seller — routes through notifyEvent so it respects
 * the org's own NotificationPreference for NEW_MERCHANDISE_ORDER (same
 * opt-out mechanism every other WGC notification already uses) and picks
 * the same recipient priority (supportEmail -> financeEmail ->
 * primaryContactEmail) as every other seller-facing notification. */
export async function notifyNewMerchandiseOrder(orderId: string) {
  const order = await prisma.merchandiseOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return;

  const itemSummary = order.items.map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ""} × ${i.quantity}`).join(", ");

  await notifyEvent({
    churchId: order.churchId,
    eventKey: "NEW_MERCHANDISE_ORDER",
    subject: `New merchandise order ${order.wgcOrderNumber}`,
    title: "New merchandise order",
    badgeText: "New Order",
    badgeColor: "#16A34A",
    bodyHtml: `
      <p>A donor placed a new merchandise order.</p>
      <table style="width:100%;text-align:left;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Order:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${order.wgcOrderNumber}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Items:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${itemSummary}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Total:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${formatCents(order.totalMerchandiseAmount)}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Ship to:</strong></td><td style="padding:8px 0;">${[order.shippingCity, order.shippingState].filter(Boolean).join(", ") || "—"}</td></tr>
      </table>
    `,
  });

  await logDashboardAction({ churchId: order.churchId, action: "merchandise_order.seller_notified", entityType: "MerchandiseOrder", entityId: order.id });
}

/**
 * Sent to the donor the first time a tracking number appears on their
 * order — previously nothing notified them at all once an order shipped;
 * the confirmation email at checkout was the only email an order ever
 * generated. Called from webhooks.ts only when trackingNumber transitions
 * from unset to set (see the caller's own comment) so a later webhook
 * carrying the same tracking number — e.g. a "delivered" status update —
 * never re-sends this. Includes the shipping amount the donor already
 * paid at checkout, for their own reference against the carrier's charge.
 */
export async function sendShipmentNotification(orderId: string) {
  const order = await prisma.merchandiseOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new Error("Order not found");
  if (!order.customerEmail) return { success: false, error: "Order has no customer email on file" };
  if (!order.trackingNumber) return { success: false, error: "Order has no tracking number yet" };

  const church = await prisma.church.findUnique({ where: { id: order.churchId }, select: { name: true } });
  const orgName = church?.name || "the organization you supported";

  const result = await sendWgcEmail({
    to: order.customerEmail,
    subject: `Your order ${order.wgcOrderNumber} has shipped`,
    title: "Your order has shipped",
    badgeText: "Shipped",
    badgeColor: "#16A34A",
    bodyHtml: `
      <p>Good news — your order from <strong>${orgName}</strong> is on its way!</p>
      <table style="width:100%;text-align:left;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Order:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${order.wgcOrderNumber}</td></tr>
        ${order.carrier ? `<tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Carrier:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${order.carrier}</td></tr>` : ""}
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;"><strong>Tracking number:</strong></td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;">${order.trackingNumber}</td></tr>
        <tr><td style="padding:8px 0;"><strong>Shipping paid:</strong></td><td style="padding:8px 0;">${formatCents(order.shippingAmount)}</td></tr>
      </table>
      ${order.trackingUrl ? `<p><a href="${order.trackingUrl}">Track your package</a></p>` : ""}
    `,
  });

  await prisma.emailLog.create({
    data: {
      type: "MERCHANDISE_ORDER_SHIPPED",
      to: order.customerEmail,
      subject: `Your order ${order.wgcOrderNumber} has shipped`,
      status: result.success ? "SENT" : "ERROR",
      sentAt: result.success ? new Date() : null,
      error: result.success ? null : String(result.error ?? "unknown error"),
    },
  });

  return result;
}

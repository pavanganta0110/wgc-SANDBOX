import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getProviderForChurch } from "./service";
import { mapProviderOrderStatusToWgc } from "./mapper";
import { OrderSubmissionError, ProductUnavailableError, ShippingUnavailableError, VariantUnavailableError } from "./errors";
import { sendMerchandiseOrderConfirmation, notifyNewMerchandiseOrder } from "./orderEmails";
import type { WgcAddress } from "./types";

/** WGC-MERCH-XXXXXXXX — the stable external reference used both for WGC's
 * own idempotency and (once real integration is live) as Printful's
 * external order reference, per spec item 37. */
export function generateOrderNumber(): string {
  return `WGC-MERCH-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export interface CartItemInput {
  variantId: string; // MerchandiseVariant.id (WGC internal id, not externalVariantId — the browser never sees externalVariantId)
  quantity: number;
}

export interface ServerPricedCart {
  items: {
    variantId: string;
    productId: string;
    externalVariantId: string;
    productName: string;
    variantName: string;
    size: string | null;
    color: string | null;
    sku: string | null;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    providerUnitCost: number;
    providerLineCost: number;
  }[];
  subtotal: number;
  providerCost: number;
}

/**
 * Server-side price recalculation — never trusts a client-submitted price
 * (spec item 34/62). Every quantity/variant is validated against the live
 * database record (churchId-scoped) before any total is computed. Throws
 * VariantUnavailableError for an inactive/unavailable/out-of-stock variant,
 * or if the variant doesn't belong to this church's currently-enabled
 * catalog for the given giving page.
 */
export async function priceCartServerSide(params: { churchId: string; givingPageId: string; items: CartItemInput[] }): Promise<ServerPricedCart> {
  if (!params.items.length) {
    return { items: [], subtotal: 0, providerCost: 0 };
  }
  for (const item of params.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 25) {
      throw new OrderSubmissionError("Invalid quantity for one or more items.", false);
    }
  }

  const variantIds = params.items.map((i) => i.variantId);
  const variants = await prisma.merchandiseVariant.findMany({
    where: { id: { in: variantIds }, churchId: params.churchId },
    include: { product: { include: { givingPageAssignments: { where: { givingPageId: params.givingPageId } } } } },
  });

  const priced: ServerPricedCart["items"] = [];
  let subtotal = 0;
  let providerCost = 0;

  for (const item of params.items) {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) throw new VariantUnavailableError();
    if (!variant.active || !variant.product.active) throw new ProductUnavailableError();
    if (!variant.available || variant.stockStatus === "OUT_OF_STOCK" || variant.stockStatus === "DISCONTINUED") {
      throw new VariantUnavailableError(`${variant.name} is currently unavailable.`);
    }
    const assignment = variant.product.givingPageAssignments[0];
    if (!assignment || !assignment.enabled) {
      throw new ProductUnavailableError("This product is not available on this giving page.");
    }

    const unitPrice = assignment.priceOverride ?? variant.merchantPrice;
    const lineTotal = unitPrice * item.quantity;
    const providerLineCost = variant.providerCost * item.quantity;
    subtotal += lineTotal;
    providerCost += providerLineCost;

    priced.push({
      variantId: variant.id,
      productId: variant.productId,
      externalVariantId: variant.externalVariantId,
      productName: variant.product.name,
      variantName: variant.name,
      size: variant.size,
      color: variant.color,
      sku: variant.sku,
      imageUrl: variant.imageUrl,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      providerUnitCost: variant.providerCost,
      providerLineCost,
    });
  }

  return { items: priced, subtotal, providerCost };
}

export async function getShippingQuote(params: { churchId: string; address: WgcAddress; items: CartItemInput[]; pricedCart: ServerPricedCart }) {
  if (!params.pricedCart.items.length) return { options: [] as { id: string; name: string; rate: number; minDays: number | null; maxDays: number | null }[] };
  const provider = await getProviderForChurch(params.churchId);
  try {
    const rates = await provider.getShippingRates({
      address: params.address,
      items: params.pricedCart.items.map((i) => ({ externalVariantId: i.externalVariantId, quantity: i.quantity })),
    });
    return { options: rates.map((r) => ({ id: r.id, name: r.name, rate: r.rate, minDays: r.minDeliveryDays, maxDays: r.maxDeliveryDays })) };
  } catch (err) {
    if (err instanceof ShippingUnavailableError) throw err;
    // Previously discarded the real Printful error and always threw the
    // generic default message — the donor (and we, debugging it) never
    // saw what actually failed. Printful's own error messages are already
    // safe to show (see PrintfulApiError — built from Printful's own
    // error.message/result field, never a raw stack trace).
    throw new ShippingUnavailableError(err instanceof Error ? err.message : undefined);
  }
}

/**
 * Creates the DB-side merchandise order + line items in FULFILLMENT_PENDING
 * state, AFTER payment has already succeeded (see checkoutService.ts —
 * this function never charges anything itself). Then attempts to submit it
 * to the provider. If provider submission fails, the order is left exactly
 * as PAYMENT_SUCCESS/FULFILLMENT_PENDING (spec item 36) — the donor was
 * already charged once and is never charged again; retrySubmission below
 * is the safe re-entry point.
 */
export async function createMerchandiseOrder(params: {
  churchId: string;
  donorId: string | null;
  givingPageId: string | null;
  clientAttemptId: string;
  pricedCart: ServerPricedCart;
  shippingAmount: number;
  taxAmount: number;
  discountAmount?: number;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingOptionId?: string | null;
  address: WgcAddress;
  paymentId: string | null;
}) {
  const existing = await prisma.merchandiseOrder.findUnique({ where: { clientAttemptId: params.clientAttemptId } });
  if (existing) return existing; // idempotent — a retried request never creates a second order

  const connection = await prisma.printfulConnection.findUnique({ where: { churchId: params.churchId } });
  const totalMerchandiseAmount = params.pricedCart.subtotal + params.shippingAmount + params.taxAmount - (params.discountAmount ?? 0);

  const order = await prisma.merchandiseOrder.create({
    data: {
      churchId: params.churchId,
      donorId: params.donorId,
      givingPageId: params.givingPageId,
      wgcOrderNumber: generateOrderNumber(),
      printfulConnectionId: connection?.id ?? null,
      status: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      paymentStatus: "SUCCEEDED",
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone,
      shippingName: params.address.name || [params.address.firstName, params.address.lastName].filter(Boolean).join(" ") || null,
      shippingAddress1: params.address.addressLine1,
      shippingAddress2: params.address.addressLine2 ?? null,
      shippingCity: params.address.city,
      shippingState: params.address.state,
      shippingPostalCode: params.address.postalCode,
      shippingCountry: params.address.country,
      subtotal: params.pricedCart.subtotal,
      shippingAmount: params.shippingAmount,
      shippingOptionId: params.shippingOptionId ?? null,
      taxAmount: params.taxAmount,
      discountAmount: params.discountAmount ?? 0,
      totalMerchandiseAmount,
      providerCost: params.pricedCart.providerCost,
      merchantRevenue: totalMerchandiseAmount - params.pricedCart.providerCost,
      clientAttemptId: params.clientAttemptId,
      paymentId: params.paymentId,
      placedAt: new Date(),
      items: {
        create: params.pricedCart.items.map((i) => ({
          churchId: params.churchId,
          productId: i.productId,
          variantId: i.variantId,
          externalProductId: null,
          externalVariantId: i.externalVariantId,
          productName: i.productName,
          variantName: i.variantName,
          size: i.size,
          color: i.color,
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
          providerUnitCost: i.providerUnitCost,
          providerLineCost: i.providerLineCost,
          imageUrl: i.imageUrl,
        })),
      },
    },
    include: { items: true },
  });

  await logDashboardAction({ churchId: params.churchId, action: "merchandise_order.created", entityType: "MerchandiseOrder", entityId: order.id, metadata: { wgcOrderNumber: order.wgcOrderNumber, total: totalMerchandiseAmount } });

  // Best-effort, non-blocking — the payment and order already succeeded;
  // a failure to email either the donor or the seller must never undo or
  // delay that (same rule the Printful submission below follows).
  await sendMerchandiseOrderConfirmation(order.id).catch((err) => console.error(`Order confirmation email failed for ${order.wgcOrderNumber}:`, err?.message));
  await notifyNewMerchandiseOrder(order.id).catch((err) => console.error(`Seller notification failed for ${order.wgcOrderNumber}:`, err?.message));

  // Best-effort immediate submission — failure here is expected and safe
  // (spec item 36); the order stays in a retryable state either way.
  await submitOrderToProvider(order.id).catch((err) => console.error(`Deferred: order ${order.wgcOrderNumber} submission will need retry:`, err?.message));

  return prisma.merchandiseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
}

/**
 * Idempotent submission to the provider. Safe to call multiple times for
 * the same order — if it's already SUBMITTED/IN_FULFILLMENT/etc, this is a
 * no-op rather than creating a duplicate provider-side order (spec item
 * 37).
 */
export async function submitOrderToProvider(orderId: string) {
  const order = await prisma.merchandiseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });

  if (order.status !== "PAID" && order.status !== "FULFILLMENT_PENDING" && order.status !== "FAILED") {
    // Already submitted (or further along) — nothing to do.
    return order;
  }

  try {
    const provider = await getProviderForChurch(order.churchId);
    const providerOrder = await provider.createOrder({
      externalOrderReference: order.wgcOrderNumber,
      recipient: {
        name: order.shippingName,
        addressLine1: order.shippingAddress1 || "",
        addressLine2: order.shippingAddress2,
        city: order.shippingCity || "",
        state: order.shippingState || "",
        postalCode: order.shippingPostalCode || "",
        country: order.shippingCountry || "",
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      items: order.items.map((i) => ({ externalVariantId: i.externalVariantId || "", quantity: i.quantity, productName: i.productName, variantName: i.variantName })),
      // Previously omitted entirely: the donor's selected/priced shipping
      // rate was validated at checkout but never reached Printful's own
      // order-creation call, so Printful would fall back to its own
      // default shipping method instead of the one shippingAmount was
      // actually computed from.
      shippingOptionId: order.shippingOptionId,
    });

    const mapped = mapProviderOrderStatusToWgc(providerOrder.status);
    const updated = await prisma.merchandiseOrder.update({
      where: { id: order.id },
      data: {
        externalOrderId: providerOrder.externalOrderId,
        status: mapped.status,
        fulfillmentStatus: mapped.fulfillmentStatus,
        externalStatus: providerOrder.status,
        trackingNumber: providerOrder.trackingNumber,
        trackingUrl: providerOrder.trackingUrl,
        carrier: providerOrder.carrier,
        submittedToProviderAt: new Date(),
        failureReason: null,
      },
      include: { items: true },
    });

    await logDashboardAction({ churchId: order.churchId, action: "merchandise_order.submitted_to_provider", entityType: "MerchandiseOrder", entityId: order.id, metadata: { externalOrderId: providerOrder.externalOrderId } });
    return updated;
  } catch (err: any) {
    // Payment already succeeded — NEVER lose the order. Leave it retryable
    // (spec item 36) rather than marking it FAILED terminally.
    await prisma.merchandiseOrder.update({
      where: { id: order.id },
      data: { status: "FULFILLMENT_PENDING", failureReason: err?.message ?? "Provider order submission failed." },
    });
    throw new OrderSubmissionError(err?.message ?? "Provider order submission failed.");
  }
}

export async function retryOrderSubmission(params: { orderId: string; churchId: string; actorUserId?: string | null; actorEmail?: string | null; actorRole?: string | null; req?: Request }) {
  const order = await prisma.merchandiseOrder.findFirst({ where: { id: params.orderId, churchId: params.churchId } });
  if (!order) throw new Error("Order not found.");

  const result = await submitOrderToProvider(order.id);

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId ?? undefined,
    actorEmail: params.actorEmail ?? undefined,
    actorRole: params.actorRole ?? undefined,
    action: "order.manually_retried",
    entityType: "MerchandiseOrder",
    entityId: order.id,
    req: params.req,
  });

  return result;
}

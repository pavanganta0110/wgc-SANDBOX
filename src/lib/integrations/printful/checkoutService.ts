import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { resolveProcessingMerchant, buildIdempotencyKey } from "@/lib/billing/paymentRouting";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";
import { priceCartServerSide, getShippingQuote, createMerchandiseOrder, type CartItemInput } from "./orderService";
import { OrderSubmissionError } from "./errors";
import { resolveWgcTransferFeeStrategy } from "@/lib/giving/serverFeeStrategy";
import { FEE_CALCULATION_VERSION } from "@/lib/giving/feeCalculator";
import type { WgcAddress } from "./types";

/**
 * The ONLY place donation + merchandise + shipping + tax combine into one
 * charge (spec item 14/34). This is a NEW, additive code path — it does
 * NOT modify /api/g/[slug]/donate/route.ts. A giving link with
 * merchandiseEnabled=false never reaches this file; the frontend calls the
 * existing donate route unchanged in that case (see spec item 31/backwards
 * compatibility requirement).
 *
 * Critical accounting rule (spec item 66): WgcCheckout.donationAmount is
 * the ONLY value ever counted as a charitable donation. This function
 * writes a normal Payment row (donationAmountCents = the actual donation
 * portion only) exactly the same way the existing donate route does, and a
 * completely separate MerchandiseOrder row for the merchandise/shipping/tax
 * portion. Reporting code must read Payment.donationAmountCents for
 * donation totals and MerchandiseOrder.totalMerchandiseAmount for
 * merchandise sales — never Payment.amountCents (the full charge) as "the
 * donation."
 *
 * Payment-failure rule (spec item 35): if the Finix charge fails, nothing
 * is written except the failed attempt is surfaced as an error — no
 * Payment, no MerchandiseOrder, and definitely no Printful order are ever
 * created.
 */

export interface WalletBillingContact {
  name: string;
  email?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface CheckoutInput {
  churchId: string;
  givingLinkId: string;
  clientAttemptId: string;
  donationAmountCents: number; // 0 = merchandise-only checkout (architecturally supported per spec item 31)
  cartItems: CartItemInput[];
  shippingOptionId: string | null;
  address: WgcAddress | null; // required only if cartItems is non-empty
  donor: { name: string; email: string; phone?: string | null };
  paymentInstrumentId?: string;
  token?: string;
  // Apple Pay / Google Pay — mirrors the existing donate route's wallet
  // instrument shape exactly (type GOOGLE_PAY/APPLE_PAY, third_party_token,
  // merchant_identity scoped to FINIX_APPLICATION_OWNER_ID, never the
  // church's own Finix identity — wallet tokens are scoped to whichever
  // identity they were tokenized against client-side, see googlePay.ts/
  // applePay.ts).
  paymentMethod?: "card" | "apple_pay" | "google_pay";
  walletToken?: string;
  walletBillingContact?: WalletBillingContact;
  fraudSessionId: string;
  isAnonymous?: boolean;
  // Mirrors the existing donation flow's coverFees flag exactly (see
  // /api/g/[slug]/donate) — only takes effect when the giving link has
  // feeCoverEnabled, same gate donations already respect.
  coverFees?: boolean;
}

export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

export async function processCombinedCheckout(input: CheckoutInput) {
  const church = await prisma.church.findUnique({ where: { id: input.churchId } });
  if (!church?.finixMerchantId) throw new CheckoutValidationError("This organization is not currently approved to accept payments.");

  const link = await prisma.givingLink.findUnique({ where: { id: input.givingLinkId } });
  if (!link || link.churchId !== input.churchId) throw new CheckoutValidationError("Giving page not found.");
  if (!link.merchandiseEnabled && input.cartItems.length > 0) {
    throw new CheckoutValidationError("Merchandise is not enabled on this giving page.");
  }

  if (input.donationAmountCents > 0 && input.donationAmountCents < 100) {
    throw new CheckoutValidationError("Invalid donation amount (minimum $1.00).");
  }
  if (input.donationAmountCents === 0 && input.cartItems.length === 0) {
    throw new CheckoutValidationError("Please enter a donation amount or add an item to your order.");
  }

  // Idempotency: a retried submission with the same clientAttemptId returns
  // the original result rather than double-charging (spec item 37, mirrors
  // PaymentAttempt.clientAttemptId elsewhere in this codebase).
  const existingCheckout = await prisma.wgcCheckout.findUnique({ where: { clientAttemptId: input.clientAttemptId } });
  if (existingCheckout) return existingCheckout;

  // --- Server-side pricing (never trust the browser) ---
  const pricedCart = await priceCartServerSide({ churchId: input.churchId, givingPageId: input.givingLinkId, items: input.cartItems });

  let shippingAmount = 0;
  if (pricedCart.items.length > 0) {
    if (!input.address?.addressLine1) throw new CheckoutValidationError("A shipping address is required for this order.");
    if (!input.shippingOptionId) throw new CheckoutValidationError("Please select a shipping option.");
    const quote = await getShippingQuote({ churchId: input.churchId, address: input.address, items: input.cartItems, pricedCart });
    const chosen = quote.options.find((o) => o.id === input.shippingOptionId);
    if (!chosen) throw new CheckoutValidationError("Selected shipping option is no longer available.");
    shippingAmount = chosen.rate;
  }

  // Tax: no tax engine exists in this codebase yet (spec item 55) — left
  // at 0 and explicitly flagged as pending, never silently assumed
  // tax-exempt as a business conclusion. See MerchandiseSettings for where
  // a real tax integration would eventually plug in.
  const taxAmount = 0;

  // baseTotal is what the cart/donation/shipping/tax actually cost before
  // WGC's own processing fee is added — the fee itself is only computable
  // once cardBrand is known (Amex prices differently), which requires the
  // payment instrument to exist first, same ordering the donate route uses.
  const baseTotal = input.donationAmountCents + pricedCart.subtotal + shippingAmount + taxAmount;
  if (baseTotal < 50) throw new CheckoutValidationError("Order total is too small to process.");

  // --- Donor identity + payment instrument (mirrors donate route's pattern) ---
  const isWallet = input.paymentMethod === "apple_pay" || input.paymentMethod === "google_pay";
  let identityId: string;
  let instrumentId: string;
  let cardBrand: string | null = null;
  if (input.paymentInstrumentId) {
    instrumentId = input.paymentInstrumentId;
    const instrument = await finixClient.getPaymentInstrument(instrumentId);
    if (!instrument?.id) throw new CheckoutValidationError("Payment method not found.");
    identityId = instrument.identity;
    cardBrand = instrument.card?.brand || null;
  } else if (isWallet) {
    if (!input.walletToken) throw new CheckoutValidationError("Missing wallet payment token.");
    const [firstName, ...rest] = input.donor.name.trim().split(" ");
    const identity = await finixClient.createBuyerIdentity({ entity: { first_name: firstName, last_name: rest.join(" ") || firstName, email: input.donor.email, phone: input.donor.phone || undefined } });
    identityId = identity?.id;
    if (!identityId) throw new CheckoutValidationError("Could not verify identity with processor.");
    // merchant_identity is FINIX_APPLICATION_OWNER_ID (application-wide),
    // never the church's own Finix identity — a wallet token is scoped to
    // whichever identity it was tokenized against client-side (see
    // googlePay.ts/loadPublicGivingPageData.ts), confirmed by Finix's own
    // rejection when this was tried with a per-church identity in the
    // existing donate route. Actual per-church settlement routing still
    // happens on the transfer call below via resolveProcessingMerchant.
    const applicationOwnerId = process.env.FINIX_APPLICATION_OWNER_ID;
    if (!applicationOwnerId) throw new CheckoutValidationError("Wallet payments are not configured for this environment.");
    const instrument = await finixClient.createPaymentInstrument({
      identity: identityId,
      merchant_identity: applicationOwnerId,
      type: input.paymentMethod === "google_pay" ? "GOOGLE_PAY" : "APPLE_PAY",
      third_party_token: input.walletToken,
      name: input.walletBillingContact?.name,
      address: {
        line1: input.walletBillingContact?.address?.line1,
        line2: input.walletBillingContact?.address?.line2,
        city: input.walletBillingContact?.address?.city,
        region: input.walletBillingContact?.address?.region,
        postal_code: input.walletBillingContact?.address?.postal_code,
        country: input.walletBillingContact?.address?.country,
      },
    });
    instrumentId = instrument?.id;
    if (!instrumentId) throw new CheckoutValidationError("Could not process wallet payment instrument.");
    cardBrand = instrument?.card?.brand || null;
  } else if (input.token) {
    const [firstName, ...rest] = input.donor.name.trim().split(" ");
    const identity = await finixClient.createBuyerIdentity({ entity: { first_name: firstName, last_name: rest.join(" ") || firstName, email: input.donor.email, phone: input.donor.phone || undefined } });
    identityId = identity?.id;
    if (!identityId) throw new CheckoutValidationError("Could not verify identity with processor.");
    const instrument = await finixClient.createPaymentInstrument({ identity: identityId, token: input.token, type: "TOKEN" });
    instrumentId = instrument?.id;
    if (!instrumentId) throw new CheckoutValidationError("Could not process payment instrument.");
    cardBrand = instrument?.card?.brand || null;
  } else {
    throw new CheckoutValidationError("Missing payment token.");
  }

  const donorRecord = await resolveOrCreateDonor({ churchId: input.churchId, finixIdentityId: identityId, name: input.donor.name, email: input.donor.email, phone: input.donor.phone ?? null });

  // --- WGC processing fee — same fee matrix, same donor-covers-fee
  // toggle, and same Finix fee_profile mechanism as the plain donation
  // flow (/api/g/[slug]/donate). Previously entirely absent from
  // merchandise checkout: the Finix transfer carried no fee_profile at
  // all, so WGC collected nothing on merch/shipping regardless of the
  // org's donation fee settings.
  let feeStrategy;
  try {
    feeStrategy = resolveWgcTransferFeeStrategy({
      donationAmountCents: baseTotal,
      paymentMethod: "CARD",
      cardBrand,
      donorCoversFee: Boolean(link.feeCoverEnabled && input.coverFees),
    });
  } catch (err: any) {
    throw new CheckoutValidationError(err?.message || "Pricing configuration error for this organization.");
  }
  const grandTotal = feeStrategy.amountToChargeCents;

  // --- One single Finix charge for the whole grand total (spec item 73 —
  // Printful never sees card data, never receives a payment token, and
  // there is exactly one charge). ---
  const resolved = await resolveProcessingMerchant("MERCHANT_MERCHANDISE_ORDER", input.churchId);
  const idempotencyId = buildIdempotencyKey("merch_checkout", input.clientAttemptId);

  const transferPayload: Record<string, unknown> = {
    merchant: resolved.merchantId,
    amount: grandTotal,
    currency: "USD",
    source: instrumentId,
    fee_profile: feeStrategy.feeProfileId,
    ...(input.fraudSessionId && { fraud_session_id: input.fraudSessionId }),
    idempotency_id: idempotencyId,
    statement_descriptor: (link.statementDescriptor || church.name).slice(0, 18).toUpperCase(),
    tags: {
      source: "wgc_merchandise_checkout",
      givingLinkId: link.id,
      churchId: church.id,
      donation_amount_cents: String(input.donationAmountCents),
      merchandise_amount_cents: String(pricedCart.subtotal),
      shipping_amount_cents: String(shippingAmount),
      processing_fee_cents: String(feeStrategy.expectedFeeCents),
      donor_covers_fee: String(Boolean(link.feeCoverEnabled && input.coverFees)),
      fee_strategy: feeStrategy.feePaidBy,
      card_brand: feeStrategy.normalizedCardBrand || "NONE",
      fee_percentage_bps: String(feeStrategy.percentageBasisPoints),
      fee_fixed_cents: String(feeStrategy.fixedFeeCents),
      fee_calculation_version: FEE_CALCULATION_VERSION,
    },
  };
  if (feeStrategy.feePaidBy === "DONOR" && feeStrategy.supplementalFeeCents > 0) {
    transferPayload.supplemental_fee = feeStrategy.supplementalFeeCents;
  }

  let transfer;
  try {
    transfer = await finixClient.createTransfer(transferPayload as any);
  } catch (err: any) {
    // Payment-failure rule: nothing else is created (spec item 35).
    throw new CheckoutValidationError(err?.message || "We couldn't complete your payment. No charge was made.");
  }

  const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED" || (transfer.state || "").toUpperCase() === "PENDING";
  if (!succeeded) {
    throw new CheckoutValidationError("Payment was not successful. No order was created.");
  }

  // --- Payment record for the donation portion ONLY (never the grand total) ---
  let paymentId: string | null = null;
  if (input.donationAmountCents > 0) {
    const payment = await prisma.payment.create({
      data: {
        churchId: input.churchId,
        donorId: donorRecord.id,
        givingLinkId: link.id,
        finixTransferId: transfer.id,
        finixBuyerIdentityId: identityId,
        finixPaymentInstrumentId: instrumentId,
        // amountCents intentionally mirrors donationAmountCents here (not
        // grandTotal) — the merchandise/shipping/tax portion is recorded
        // exclusively on MerchandiseOrder, never folded into this Payment,
        // so donation reporting is never inflated by a merchandise
        // purchase (spec item 66).
        amountCents: input.donationAmountCents,
        donationAmountCents: input.donationAmountCents,
        currency: "USD",
        paymentMethodType: input.paymentInstrumentId ? "PAYMENT_CARD" : "PAYMENT_CARD",
        status: transfer.state ?? "PENDING",
        isAnonymous: Boolean(input.isAnonymous),
        donorCoversFee: Boolean(link.feeCoverEnabled && input.coverFees),
        cardBrand: feeStrategy.normalizedCardBrand || null,
        percentageBps: feeStrategy.percentageBasisPoints,
        fixedFeeCents: feeStrategy.fixedFeeCents,
        feeCalculationVersion: FEE_CALCULATION_VERSION,
      },
    });
    paymentId = payment.id;
    await sendDonationReceipt(payment.id, church.id).catch((err) => console.error("Failed to send donation receipt for combined checkout:", err));
  }

  // --- Merchandise order for the merchandise portion ONLY ---
  let merchandiseOrder = null;
  if (pricedCart.items.length > 0) {
    try {
      merchandiseOrder = await createMerchandiseOrder({
        churchId: input.churchId,
        donorId: donorRecord.id,
        givingPageId: link.id,
        clientAttemptId: input.clientAttemptId,
        pricedCart,
        shippingAmount,
        taxAmount,
        customerEmail: input.donor.email,
        customerPhone: input.donor.phone ?? null,
        shippingOptionId: input.shippingOptionId,
        address: input.address as WgcAddress,
        paymentId,
      });
    } catch (err) {
      // Payment already succeeded — this must never throw the donor's
      // successful payment away (spec item 36). Log loudly; the checkout
      // row below still gets created so the order can be reconciled/
      // retried from the merchant dashboard.
      console.error("Merchandise order creation failed after successful payment — requires manual follow-up:", err);
    }
  }

  const checkout = await prisma.wgcCheckout.create({
    data: {
      churchId: input.churchId,
      donorId: donorRecord.id,
      givingPageId: link.id,
      donationAmount: input.donationAmountCents,
      merchandiseAmount: pricedCart.subtotal,
      shippingAmount,
      taxAmount,
      processingFeeAmount: feeStrategy.supplementalFeeCents,
      grandTotal,
      finixTransferId: transfer.id,
      paymentStatus: "SUCCEEDED",
      paymentId,
      merchandiseOrderId: merchandiseOrder?.id ?? null,
      clientAttemptId: input.clientAttemptId,
    },
  });

  return checkout;
}

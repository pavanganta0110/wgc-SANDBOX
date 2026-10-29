import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession } from "@/lib/partners/partnerSession";
import { PARTNER_NEW_CARD_EXTRA_ATTEMPTS } from "@/lib/partners/partnerInvoicing";

export const PARTNER_BILLING_AUTHORIZATION_TERMS_VERSION = "partner-billing-authorization-v1";

/**
 * Saves the partner's card. The card number never reaches this server: the browser gives
 * Finix the card and sends back only a one-time token, which is turned into a payment
 * instrument here (same two steps as the organization billing activation). The partner must
 * tick the authorization to charge the card monthly. Saving a card also lets any unpaid
 * invoice try again straight away.
 */
export async function POST(req: Request) {
  try {
    const session = await requirePartnerSession();
    const body = await req.json().catch(() => ({}));
    const token = typeof body.financeInstrumentToken === "string" ? body.financeInstrumentToken : "";
    if (!token) return NextResponse.json({ error: "Missing card token." }, { status: 400 });
    if (body.authorizationAccepted !== true) {
      return NextResponse.json({ error: "Please authorize the monthly charge to save your card." }, { status: 400 });
    }

    const headerList = await headers();
    const identity = await finixClient.createBuyerIdentity({ entity: { email: session.email } });
    const instrument = await finixClient.createPaymentInstrument({ identity: identity.id, token, type: "TOKEN" });

    // Cards only: a bank account would be charged differently and fail differently.
    if (!instrument?.brand || !instrument?.last_four || instrument?.bank_account_type) {
      return NextResponse.json({ error: "Please use a credit or debit card." }, { status: 400 });
    }

    const now = new Date();
    await prisma.partner.update({
      where: { id: session.partnerId },
      data: {
        billingIdentityId: identity.id,
        billingPaymentInstrumentId: instrument.id,
        cardBrand: instrument.brand,
        cardLast4: instrument.last_four,
        cardExpMonth: instrument.expiration_month ?? null,
        cardExpYear: instrument.expiration_year ?? null,
        billingContactEmail: session.email,
        billingAuthAcceptedAt: now,
        billingAuthTermsVersion: PARTNER_BILLING_AUTHORIZATION_TERMS_VERSION,
      },
    });

    // A new card is a reason to try an unpaid invoice again now. The attempt number keeps
    // counting up, so no earlier Finix idempotency id is ever reused.
    const unpaid = await prisma.partnerInvoice.findMany({
      where: { partnerId: session.partnerId, status: { in: ["FAILED", "AWAITING_CARD"] } },
      select: { id: true, status: true, attemptCount: true, attemptBudget: true },
    });
    for (const invoice of unpaid) {
      await prisma.partnerInvoice.update({
        where: { id: invoice.id },
        data: {
          // One that never had a card goes back to waiting its turn; a failed one retries now.
          status: invoice.status === "AWAITING_CARD" ? "PENDING" : "FAILED",
          nextAttemptAt: now,
          attemptBudget: Math.max(invoice.attemptBudget, invoice.attemptCount + PARTNER_NEW_CARD_EXTRA_ATTEMPTS),
        },
      });
    }

    await createAuditLog({
      action: "PARTNER_BILLING_CARD_SAVED",
      actorEmail: session.email,
      ipAddress: headerList.get("x-forwarded-for") || headerList.get("x-real-ip") || undefined,
      userAgent: headerList.get("user-agent") || undefined,
      metadata: { partnerId: session.partnerId, brand: instrument.brand, last4: instrument.last_four, termsVersion: PARTNER_BILLING_AUTHORIZATION_TERMS_VERSION },
    });

    return NextResponse.json({ card: { brand: instrument.brand, last4: instrument.last_four, expMonth: instrument.expiration_month ?? null, expYear: instrument.expiration_year ?? null } });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Saving partner billing card failed:", err);
    return NextResponse.json({ error: "We couldn't save that card. Nothing was charged. Please try again." }, { status: 502 });
  }
}

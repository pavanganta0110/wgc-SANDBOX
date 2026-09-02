import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";
import { resolveBillingActivationToken, consumeBillingActivationToken } from "@/lib/billing/billingActivation";
import { activateWgcSubscription, WgcSubscriptionError } from "@/lib/billing/wgcSubscriptionService";
import { sendActivationConfirmationEmail } from "@/lib/billing/billingEmails";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

export const BILLING_AUTHORIZATION_TERMS_VERSION = "billing-authorization-v1";

/**
 * Completes WGC platform-subscription activation: verifies the org owns the
 * activation token (never trusts organizationId from the request body —
 * only from the resolved token + the authenticated session, and requires
 * both to agree), creates a Finix buyer identity + tokenized payment
 * instrument for the organization's WGC billing account (never raw card/
 * bank data touches this server), records the required affirmative
 * authorization, then creates the Finix subscription via the one trusted
 * subscription service.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession(true); // allowlisted: billing setup/management must remain reachable while restricted
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // canManageSubscription is a structural (non-overridable) permission that
  // only the "owner" role grants (see ROLE_PERMISSIONS in roles.ts). Check
  // the permission rather than the literal role string: orgs provisioned by
  // provisionChurchAccount.ts don't always end up with an "owner"-role user
  // (see canManageSubscription's own gate on the subscription page), so a
  // hardcoded role check here could leave an org with no one able to
  // activate billing at all.
  if (!hasPermission(auth, "canManageSubscription")) {
    return NextResponse.json({ error: "Only the organization owner can activate the subscription." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { token, financeInstrumentToken, paymentMethodType, authorizationAccepted } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing activation token." }, { status: 400 });
  }
  if (!financeInstrumentToken || typeof financeInstrumentToken !== "string") {
    return NextResponse.json({ error: "Missing billing method token." }, { status: 400 });
  }
  if (authorizationAccepted !== true) {
    return NextResponse.json({ error: "You must authorize the subscription to continue." }, { status: 400 });
  }

  const resolvedToken = await resolveBillingActivationToken(token);
  if (!resolvedToken) {
    return NextResponse.json({ error: "This activation link is invalid or has expired. Please request a new one." }, { status: 400 });
  }
  // The token must belong to THIS authenticated user's organization —
  // never trust the token's organizationId alone, and never accept an
  // organizationId from the request body at all.
  if (resolvedToken.organizationId !== auth.churchId) {
    return NextResponse.json({ error: "This activation link does not belong to your organization." }, { status: 403 });
  }

  const reqHeaders = await headers();
  const ipAddress = reqHeaders.get("x-forwarded-for") || reqHeaders.get("x-real-ip") || null;
  const userAgent = reqHeaders.get("user-agent") || null;

  try {
    // Buyer identity + tokenized instrument for WGC's billing side —
    // completely separate identity from the organization's own Finix
    // identity/merchant used for donations.
    const identity = await finixClient.createBuyerIdentity({
      entity: { email: auth.email },
    });
    const instrument = await finixClient.createPaymentInstrument({
      identity: identity.id,
      token: financeInstrumentToken,
      type: "TOKEN",
    });

    const maskedDetails =
      instrument?.brand && instrument?.last_four
        ? `${instrument.brand} ••••${instrument.last_four}`
        : instrument?.bank_account_type && instrument?.last_four
          ? `Bank •••• ${instrument.last_four}`
          : "On file";

    await prisma.wgcBillingAccount.upsert({
      where: { organizationId: auth.churchId },
      create: {
        organizationId: auth.churchId,
        billingIdentityId: identity.id,
        billingPaymentInstrumentId: instrument.id,
        billingMethodType: paymentMethodType === "bank" ? "BANK_ACCOUNT" : "CARD",
        cardBrand: instrument?.brand ?? null,
        cardLast4: instrument?.last_four ?? null,
        cardExpMonth: instrument?.expiration_month ?? null,
        cardExpYear: instrument?.expiration_year ?? null,
        bankLast4: instrument?.bank_account_type ? instrument?.last_four ?? null : null,
        maskedBillingDetails: maskedDetails,
        billingContactEmail: auth.email,
        authorizationAcceptedAt: new Date(),
        authorizationTermsVersion: BILLING_AUTHORIZATION_TERMS_VERSION,
        authorizationIpAddress: ipAddress,
        authorizationUserAgent: userAgent,
        authorizingUserId: auth.userId,
        status: "PENDING",
        lastUpdatedByUserId: auth.userId,
      },
      update: {
        billingIdentityId: identity.id,
        billingPaymentInstrumentId: instrument.id,
        billingMethodType: paymentMethodType === "bank" ? "BANK_ACCOUNT" : "CARD",
        cardBrand: instrument?.brand ?? null,
        cardLast4: instrument?.last_four ?? null,
        maskedBillingDetails: maskedDetails,
        authorizationAcceptedAt: new Date(),
        authorizationTermsVersion: BILLING_AUTHORIZATION_TERMS_VERSION,
        authorizationIpAddress: ipAddress,
        authorizationUserAgent: userAgent,
        authorizingUserId: auth.userId,
        lastUpdatedByUserId: auth.userId,
      },
    });

    await logBillingAuditEvent({
      organizationId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      action: "billing.authorization_accepted",
      entityType: "WgcBillingAccount",
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
      newValue: { termsVersion: BILLING_AUTHORIZATION_TERMS_VERSION },
    });

    const result = await activateWgcSubscription({
      organizationId: auth.churchId,
      billingIdentityId: identity.id,
      billingPaymentInstrumentId: instrument.id,
      actorUserId: auth.userId,
      actorEmail: auth.email,
    });

    await consumeBillingActivationToken(resolvedToken.tokenId);

    const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { name: true } });
    await sendActivationConfirmationEmail({
      organizationId: auth.churchId,
      organizationName: church?.name || "your organization",
      recipientEmail: auth.email,
      isPromotional: result.isPromotional,
      trialEndsAt: result.subscription.trialEndsAt,
      firstChargeAt: result.subscription.firstChargeAt,
      amountCents: result.subscription.amountCents,
      promotionDurationDays: result.promotionDurationDays,
    }).catch(() => {}); // best-effort; activation itself already succeeded

    return NextResponse.json({
      success: true,
      subscription: result.subscription,
      isPromotional: result.isPromotional,
    });
  } catch (err) {
    if (err instanceof WgcSubscriptionError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("Billing activation failed:", err);
    return NextResponse.json({ error: "Could not complete billing activation. No charge was made. Please try again or contact support." }, { status: 500 });
  }
}

import { prisma } from "@/lib/prisma";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";

export type PaymentMethodKey = "CARD" | "ACH" | "APPLE_PAY" | "GOOGLE_PAY";

export type PaymentMethodDisplayStatus =
  | "ENABLED"
  | "DISABLED"
  | "PENDING_APPROVAL"
  | "DOMAIN_VERIFICATION_REQUIRED"
  | "CONFIGURATION_REQUIRED"
  | "REQUIRES_ACTION"
  | "NOT_AVAILABLE";

export interface PaymentMethodAvailability {
  method: PaymentMethodKey;
  enabledForOrganization: boolean;
  configuredForWgc: boolean;
  approved: boolean | null; // null = cannot be confirmed server-side with a real API today
  domainVerified: boolean | null;
  environment: "sandbox" | "live" | null;
  availableForOneTime: boolean;
  availableForRecurring: boolean;
  deviceCheckRequired: boolean;
  displayStatus: PaymentMethodDisplayStatus;
  actionRequired: string | null;
  lastCheckedAt: string;
}

const APPLE_PAY_DOMAIN_CHECK_TIMEOUT_MS = 2500;

/**
 * Real, best-effort check that this deployment's Apple Pay domain
 * association file is actually being served — this is the one piece of
 * "domain verification" this codebase can confirm without a Finix API call
 * (Finix's createApplePaySession only validates during a live payment
 * session, not ahead of time). Never throws; returns null when unconfirmed
 * rather than guessing.
 */
async function checkApplePayDomainAssociation(): Promise<boolean | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), APPLE_PAY_DOMAIN_CHECK_TIMEOUT_MS);
    const res = await fetch(`${appUrl}/.well-known/apple-developer-merchantid-domain-association`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return null;
  }
}

/**
 * The single, centralized, server-side source of truth for whether a
 * payment method should be offered to donors of a given organization. The
 * Giving Page, Giving Page Preview, Settings > Payment Methods, and any
 * future Create Subscription / Take a Payment surface must all call this
 * instead of re-deriving availability independently — this was the actual
 * bug: three separate, inconsistent computations existed before this.
 *
 * Real per-device capability (ApplePaySession.canMakePayments(),
 * google.payments.api.isReadyToPay()) can only run in the browser and is
 * intentionally NOT duplicated here — deviceCheckRequired tells the caller
 * a client-side check is still needed before actually showing the button.
 */
export async function getPaymentMethodAvailability(churchId: string): Promise<PaymentMethodAvailability[]> {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { onboardingApplicationId: true, finixMerchantId: true },
  });

  const onboarding = church?.onboardingApplicationId
    ? await prisma.onboardingApplication.findUnique({ where: { id: church.onboardingApplicationId } })
    : church?.finixMerchantId
      ? await prisma.onboardingApplication.findFirst({ where: { finixMerchantId: church.finixMerchantId } })
      : null;

  const now = new Date().toISOString();
  const cardEnabled = Boolean(onboarding?.hasAcceptedCreditCardsPreviously || onboarding?.processingEnabled);

  const bankAccount = await resolveActiveBankAccount(churchId);
  const bankVerified = bankAccount?.displayStatus === "ACTIVE" || bankAccount?.displayStatus === "APPROVED";
  const achEnabled = Boolean(bankVerified && onboarding?.processingEnabled);

  const applePayConfigured = Boolean(process.env.NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID);
  // FINIX_APPLICATION_OWNER_ID is what's actually required to build a valid
  // Google Pay request (it's the gatewayMerchantId — see loadPublicGivingPageData.ts
  // and googlePay.ts). GOOGLE_PAY_MERCHANT_ID (Google's own merchantInfo.merchantId)
  // is real but per Google's own docs is "Required when PaymentsClient is
  // initialized with an environment property of PRODUCTION" — optional in
  // TEST. Gating "configured" on it unconditionally meant Google Pay could
  // never render in sandbox/TEST even with everything else correctly set up.
  const googlePayConfigured = Boolean(process.env.FINIX_APPLICATION_OWNER_ID);
  const domainVerified = applePayConfigured ? await checkApplePayDomainAssociation() : null;

  const card: PaymentMethodAvailability = {
    method: "CARD",
    enabledForOrganization: cardEnabled,
    configuredForWgc: true,
    approved: onboarding ? Boolean(onboarding.processingEnabled) : null,
    domainVerified: null,
    environment: null,
    availableForOneTime: cardEnabled,
    availableForRecurring: cardEnabled,
    deviceCheckRequired: false,
    displayStatus: cardEnabled ? "ENABLED" : onboarding ? "PENDING_APPROVAL" : "NOT_AVAILABLE",
    actionRequired: cardEnabled ? null : "Card processing has not been approved for this organization yet.",
    lastCheckedAt: now,
  };

  const ach: PaymentMethodAvailability = {
    method: "ACH",
    enabledForOrganization: achEnabled,
    configuredForWgc: true,
    approved: onboarding ? Boolean(onboarding.processingEnabled) : null,
    domainVerified: null,
    environment: null,
    availableForOneTime: achEnabled,
    availableForRecurring: achEnabled,
    deviceCheckRequired: false,
    displayStatus: achEnabled ? "ENABLED" : bankAccount ? "PENDING_APPROVAL" : "REQUIRES_ACTION",
    actionRequired: achEnabled ? null : bankAccount ? "Awaiting processor approval of the bank account on file." : "Add a bank account to enable ACH payments.",
    lastCheckedAt: now,
  };

  const applePayEnabled = applePayConfigured && cardEnabled && domainVerified === true;
  const applePay: PaymentMethodAvailability = {
    method: "APPLE_PAY",
    enabledForOrganization: applePayEnabled,
    configuredForWgc: applePayConfigured,
    approved: null,
    domainVerified,
    environment: null,
    availableForOneTime: applePayEnabled,
    availableForRecurring: applePayEnabled,
    deviceCheckRequired: true,
    displayStatus: !applePayConfigured
      ? "CONFIGURATION_REQUIRED"
      : domainVerified === false
        ? "DOMAIN_VERIFICATION_REQUIRED"
        : !cardEnabled
          ? "PENDING_APPROVAL"
          : "ENABLED",
    actionRequired: !applePayConfigured
      ? "Apple Pay is not configured for this WGC deployment."
      : domainVerified === false
        ? "The Apple Pay domain association file is not being served correctly."
        : !cardEnabled
          ? "Card processing must be approved before Apple Pay can be offered."
          : null,
    lastCheckedAt: now,
  };

  const googlePayEnabled = googlePayConfigured && cardEnabled;
  const googlePay: PaymentMethodAvailability = {
    method: "GOOGLE_PAY",
    enabledForOrganization: googlePayEnabled,
    configuredForWgc: googlePayConfigured,
    approved: null,
    domainVerified: null,
    environment: (process.env.NEXT_PUBLIC_FINIX_ENV as "sandbox" | "live") || "sandbox",
    availableForOneTime: googlePayEnabled,
    availableForRecurring: googlePayEnabled,
    deviceCheckRequired: true,
    displayStatus: !googlePayConfigured ? "CONFIGURATION_REQUIRED" : !cardEnabled ? "PENDING_APPROVAL" : "ENABLED",
    actionRequired: !googlePayConfigured
      ? "Google Pay is not configured for this WGC deployment."
      : !cardEnabled
        ? "Card processing must be approved before Google Pay can be offered."
        : null,
    lastCheckedAt: now,
  };

  return [card, ach, applePay, googlePay];
}

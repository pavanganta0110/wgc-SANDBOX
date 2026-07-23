import { prisma } from "@/lib/prisma";
import { resolveGivingLinkStatus } from "@/lib/givingLinks/status";
import { getPaymentMethodAvailability } from "@/lib/payments/paymentMethodAvailability";
import {
  parseDonorFieldSettings,
  parseAllowedPaymentMethods,
  parseAllowedFrequencies,
  parseBrandingSettings,
  resolveGivingPageLogo,
  type BrandingSettings,
  type DonorFieldSettings,
} from "@/lib/givingLinks/types";
import { checkNonprofitVerificationStatus } from "@/lib/onboarding/nonprofitVerificationGuard";
import type { Church, GivingLink } from "@prisma/client";
import type { FrequencyKey, PaymentMethodKey } from "@/lib/givingLinks/types";
import { loadAssignedActiveFunds, type AssignedActiveFund } from "@/lib/giving/fundAssignment";

export type PublicGivingPageData =
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; message: string; church: Church; light: BrandingSettings["light"] }
  | {
      ok: true;
      link: GivingLink;
      church: Church;
      branding: BrandingSettings;
      light: BrandingSettings["light"];
      pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
      donorFieldSettings: DonorFieldSettings;
      allowedPaymentMethods: PaymentMethodKey[];
      allowedFrequencies: FrequencyKey[];
      suggestedAmountsCents: number[];
      googlePayGatewayMerchantId: string | null;
      googlePayMerchantId: string | null;
      googlePayEnvironment: "TEST" | "PRODUCTION";
      serverAvailability: { APPLE_PAY: { enabledForOrganization: boolean }; GOOGLE_PAY: { enabledForOrganization: boolean } };
      logoUrl: string | null;
      fundSelectionEnabled: boolean;
      assignedFunds: AssignedActiveFund[];
    };

export async function loadPublicGivingPageData(slug: string): Promise<PublicGivingPageData> {
  const link = await prisma.givingLink.findUnique({ where: { publicSlug: slug } });
  if (!link) return { ok: false, notFound: true };

  const church = await prisma.church.findUnique({ where: { id: link.churchId } });
  if (!church || !church.finixMerchantId) return { ok: false, notFound: true };

  const branding = parseBrandingSettings(link.brandingSettingsJson);
  const light = branding.light;

  const verification = await checkNonprofitVerificationStatus(church.id);
  if (!verification.isApproved) {
    return {
      ok: false,
      notFound: false,
      message: "This organization is not currently approved to accept donations.",
      church,
      light,
    };
  }

  const status = resolveGivingLinkStatus(link);
  const branding = parseBrandingSettings(link.brandingSettingsJson);
  const light = branding.light;

  if (status !== "ACTIVE") {
    const message =
      status === "EXPIRED"
        ? "This giving link has expired."
        : status === "ARCHIVED"
          ? "This giving link is no longer available."
          : link.successfulDonations > 0 && link.linkType === "ONE_TIME"
            ? "This giving link has already been used."
            : "This giving link is not currently accepting gifts.";

    return { ok: false, notFound: false, message, church, light };
  }

  const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });
  const donorFieldSettings = parseDonorFieldSettings(link.donorFieldSettingsJson);
  const allowedPaymentMethods = parseAllowedPaymentMethods(link.allowedPaymentMethodsJson);
  const allowedFrequencies = parseAllowedFrequencies(link.allowedFrequenciesJson);
  const suggestedAmountsCents = Array.isArray(link.suggestedAmountsJson)
    ? (link.suggestedAmountsJson as number[])
    : [2500, 5000, 10000, 25000];

  // Google Pay's gatewayMerchantId is not a secret (Google's own JS requires
  // it in the client-side PaymentDataRequest) but it's still read server-side
  // and passed down as a prop rather than a NEXT_PUBLIC_ env var, matching
  // how finixMerchantId already flows through this page. PRODUCTION mode is
  // only used once Google has approved WGC's production Google Pay access —
  // otherwise every environment (including live Finix) runs Google Pay TEST.
  const googlePayGatewayMerchantId = process.env.FINIX_APPLICATION_OWNER_ID || null;
  const googlePayMerchantId = process.env.GOOGLE_PAY_MERCHANT_ID || null;
  const googlePayEnvironment: "TEST" | "PRODUCTION" =
    process.env.NEXT_PUBLIC_FINIX_ENV === "live" && process.env.GOOGLE_PAY_PRODUCTION_APPROVED === "true"
      ? "PRODUCTION"
      : "TEST";

  const availability = await getPaymentMethodAvailability(church.id);
  const serverAvailability = {
    APPLE_PAY: { enabledForOrganization: availability.find((a) => a.method === "APPLE_PAY")?.enabledForOrganization ?? false },
    GOOGLE_PAY: { enabledForOrganization: availability.find((a) => a.method === "GOOGLE_PAY")?.enabledForOrganization ?? false },
  };

  const logoUrl = resolveGivingPageLogo({
    givingPageLogoUrl: light.logoUrl,
    organizationLogoUrl: church.logoUrl,
  });

  const assignedFunds = link.fundSelectionEnabled ? await loadAssignedActiveFunds(link.id) : [];

  return {
    ok: true,
    link,
    church,
    branding,
    light,
    pricing: {
      cardPercentageFee: pricing?.cardPercentageFee ?? null,
      cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
      achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
    },
    donorFieldSettings,
    allowedPaymentMethods,
    allowedFrequencies,
    suggestedAmountsCents,
    googlePayGatewayMerchantId,
    googlePayMerchantId,
    googlePayEnvironment,
    serverAvailability,
    logoUrl,
    fundSelectionEnabled: link.fundSelectionEnabled,
    assignedFunds,
  };
}

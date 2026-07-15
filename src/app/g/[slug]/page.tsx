import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import { resolveGivingLinkStatus } from "@/lib/givingLinks/status";
import { getPaymentMethodAvailability } from "@/lib/payments/paymentMethodAvailability";
import {
  parseDonorFieldSettings,
  parseAllowedPaymentMethods,
  parseAllowedFrequencies,
  parseBrandingSettings,
  resolveGivingPageLogo,
} from "@/lib/givingLinks/types";

export default async function GivingLinkPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const link = await prisma.givingLink.findUnique({ where: { publicSlug: slug } });
  if (!link) notFound();

  const church = await prisma.church.findUnique({ where: { id: link.churchId } });
  if (!church || !church.finixMerchantId) notFound();

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

    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: light.pageBackground }}>
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border p-8" style={{ borderColor: light.borderColor }}>
          <h1 className="text-xl font-bold mb-2" style={{ color: light.headingColor }}>
            {message}
          </h1>
          <p className="text-sm" style={{ color: light.bodyTextColor }}>
            Please contact {church.name} for another way to give.
          </p>
        </div>
      </div>
    );
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

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: light.pageBackground }}>
      <div
        className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border p-8"
        style={{ borderColor: light.borderColor, backgroundColor: light.headerBackground }}
      >
        {branding.campaignImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.campaignImageUrl} alt="" className="w-full h-32 object-cover rounded-xl mb-6" />
        )}
        {logoUrl && (
          <div className="flex justify-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={`${church.name} Logo`}
              className="max-w-[160px] max-h-[96px] object-contain"
            />
          </div>
        )}
        <h1 className="text-lg font-bold text-center mb-1" style={{ color: light.headingColor }}>
          {link.publicTitle}
        </h1>
        {link.description && (
          <p className="text-sm text-center mb-6" style={{ color: light.bodyTextColor }}>
            {link.description}
          </p>
        )}

        <GivingLinkForm
          slug={slug}
          finixMerchantId={church.finixMerchantId}
          churchName={church.name}
          light={light}
          amountType={link.amountType as "FIXED" | "VARIABLE"}
          fixedAmountCents={link.fixedAmountCents}
          minAmountCents={link.minAmountCents}
          maxAmountCents={link.maxAmountCents}
          suggestedAmountsCents={suggestedAmountsCents}
          allowCustomAmount={link.allowCustomAmount}
          recurringEnabled={link.recurringEnabled}
          allowedFrequencies={allowedFrequencies}
          allowedPaymentMethods={allowedPaymentMethods}
          feeCoverEnabled={link.feeCoverEnabled}
          feeCoverDefaultOn={link.feeCoverDefaultOn}
          donorFieldSettings={donorFieldSettings}
          pricing={{
            cardPercentageFee: pricing?.cardPercentageFee ?? null,
            cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
            achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
          }}
          thankYouMessage={branding.thankYouMessage}
          googlePayGatewayMerchantId={googlePayGatewayMerchantId}
          googlePayMerchantId={googlePayMerchantId}
          googlePayEnvironment={googlePayEnvironment}
          serverAvailability={serverAvailability}
        />

        {!branding.hideFooter && (
          <p className="text-center text-xs text-slate-300 mt-6">Powered by WGC Payments</p>
        )}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import { resolveGivingLinkStatus } from "@/lib/givingLinks/status";
import {
  parseDonorFieldSettings,
  parseAllowedPaymentMethods,
  parseAllowedFrequencies,
  parseBrandingSettings,
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
        />

        {!branding.hideFooter && (
          <p className="text-center text-xs text-slate-300 mt-6">Powered by WGC Payments</p>
        )}
      </div>
    </div>
  );
}

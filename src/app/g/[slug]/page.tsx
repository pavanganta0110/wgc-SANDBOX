import { notFound } from "next/navigation";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import OrganizationLogo from "@/components/merchant/OrganizationLogo";
import { loadPublicGivingPageData } from "@/lib/givingLinks/loadPublicGivingPageData";

export default async function GivingLinkPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pledgeId?: string }>;
}) {
  const { slug } = await params;
  const { pledgeId } = await searchParams;

  const data = await loadPublicGivingPageData(slug);

  if (!data.ok) {
    if (data.notFound) notFound();
    const { light, church } = data;
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: light.pageBackground }}>
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border p-8" style={{ borderColor: light.borderColor }}>
          <h1 className="text-xl font-bold mb-2" style={{ color: light.headingColor }}>
            {data.message}
          </h1>
          <p className="text-sm" style={{ color: light.bodyTextColor }}>
            Please contact {church.name} for another way to give.
          </p>
        </div>
      </div>
    );
  }

  const { light, church } = data;

  const { link, branding, pricing, donorFieldSettings, allowedPaymentMethods, allowedFrequencies, suggestedAmountsCents, googlePayGatewayMerchantId, googlePayMerchantId, googlePayEnvironment, serverAvailability, logoUrl, fundSelectionEnabled, assignedFunds } = data;

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
        <OrganizationLogo logoUrl={logoUrl} churchName={church.name} mode="main" />
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
          finixMerchantId={church.finixMerchantId!}
          churchName={church.name}
          light={light}
          amountType={link.amountType as "FIXED" | "VARIABLE" | "FIXED_QUANTITY"}
          fixedAmountCents={link.fixedAmountCents}
          minAmountCents={link.minAmountCents}
          maxAmountCents={link.maxAmountCents}
          suggestedAmountsCents={suggestedAmountsCents}
          allowCustomAmount={link.allowCustomAmount}
          quantityItemLabel={link.quantityItemLabel}
          recurringEnabled={link.recurringEnabled}
          allowedFrequencies={allowedFrequencies}
          allowedPaymentMethods={allowedPaymentMethods}
          feeCoverEnabled={link.feeCoverEnabled}
          feeCoverDefaultOn={link.feeCoverDefaultOn}
          donorFieldSettings={donorFieldSettings}
          collectMailingAddress={link.collectMailingAddress}
          pricing={pricing}
          thankYouMessage={branding.thankYouMessage}
          googlePayGatewayMerchantId={googlePayGatewayMerchantId}
          googlePayMerchantId={googlePayMerchantId}
          googlePayEnvironment={googlePayEnvironment}
          serverAvailability={serverAvailability}
          fundSelectionEnabled={fundSelectionEnabled}
          assignedFunds={assignedFunds}
          pledgeId={pledgeId}
        />

        {(() => {
          const wgcUrl = (() => {
            const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
            if (url.includes("vercel.app") || url.includes("localhost") || url.includes("sandbox")) {
              return "https://www.wgcpayments.com";
            }
            return url;
          })();
          return (
            branding.showPoweredByWgc !== false && (
              <div className="text-center mt-6">
                <a
                  href={wgcUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Powered by WGC
                </a>
              </div>
            )
          );
        })()}
      </div>
    </div>
  );
}

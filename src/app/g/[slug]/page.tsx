import { notFound } from "next/navigation";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import { loadPublicGivingPageData } from "@/lib/givingLinks/loadPublicGivingPageData";

export default async function GivingLinkPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

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

  const { link, branding, pricing, donorFieldSettings, allowedPaymentMethods, allowedFrequencies, suggestedAmountsCents, googlePayGatewayMerchantId, googlePayMerchantId, googlePayEnvironment, serverAvailability, logoUrl } = data;

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
          finixMerchantId={church.finixMerchantId!}
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
          pricing={pricing}
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

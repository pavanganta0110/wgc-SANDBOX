import { notFound } from "next/navigation";
import { headers } from "next/headers";
import EmbedBridge from "@/components/embed/EmbedBridge";
import { loadPublicGivingPageData } from "@/lib/givingLinks/loadPublicGivingPageData";
import { isEmbedOriginAllowed, parseEmbedAllowedDomains } from "@/lib/giving/embedDomainCheck";

/**
 * Full-bleed, chrome-free giving page meant to be iframed on third-party
 * websites via public/embed/wgc-giving.js — never linked to directly from
 * WGC's own UI. See next.config.ts for the frame-ancestors override that
 * makes this route (and only this route) embeddable cross-origin.
 */
export default async function EmbedGivingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const data = await loadPublicGivingPageData(slug);

  if (!data.ok) {
    if (data.notFound) notFound();
    const { light, church } = data;
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: light.pageBackground }}>
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: light.borderColor }}>
          <h1 className="text-lg font-bold mb-2" style={{ color: light.headingColor }}>
            {data.message}
          </h1>
          <p className="text-sm" style={{ color: light.bodyTextColor }}>
            Please contact {church.name} for another way to give.
          </p>
        </div>
      </div>
    );
  }

  const { link, church, branding, light, pricing, donorFieldSettings, allowedPaymentMethods, allowedFrequencies, suggestedAmountsCents, googlePayGatewayMerchantId, googlePayMerchantId, googlePayEnvironment, serverAvailability, logoUrl } = data;

  if (church.embedDomainRestrictionEnabled) {
    const requestHeaders = await headers();
    const referer = requestHeaders.get("referer");
    const allowedDomains = parseEmbedAllowedDomains(church.embedAllowedDomainsJson);
    const allowed = isEmbedOriginAllowed(referer, allowedDomains);
    if (!allowed) {
      console.warn("[embed] rejected — unauthorized parent origin", {
        slug,
        churchId: church.id,
        referer: referer || "(none)",
      });
      return (
        <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: light.pageBackground }}>
          <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: light.borderColor }}>
            <h1 className="text-lg font-bold mb-2" style={{ color: light.headingColor }}>
              This giving page is not authorized to be embedded on this website.
            </h1>
            <p className="text-sm" style={{ color: light.bodyTextColor }}>
              Please contact {church.name} if you believe this is an error.
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen py-6 px-4" style={{ backgroundColor: light.pageBackground }}>
      <div
        className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border p-6"
        style={{ borderColor: light.borderColor, backgroundColor: light.headerBackground }}
      >
        {branding.campaignImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.campaignImageUrl} alt="" className="w-full h-28 object-cover rounded-xl mb-5" />
        )}
        {logoUrl && (
          <div className="flex justify-center mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt={`${church.name} Logo`} className="max-w-[140px] max-h-[84px] object-contain" />
          </div>
        )}
        <h1 className="text-lg font-bold text-center mb-1" style={{ color: light.headingColor }}>
          {link.publicTitle}
        </h1>
        {link.description && (
          <p className="text-sm text-center mb-5" style={{ color: light.bodyTextColor }}>
            {link.description}
          </p>
        )}

        <EmbedBridge
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
          <p className="text-center text-xs text-slate-300 mt-5">Powered by WGC Payments</p>
        )}
      </div>
    </div>
  );
}

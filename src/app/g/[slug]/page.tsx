import { notFound } from "next/navigation";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import MerchandiseGivingExperience from "@/components/giving/MerchandiseGivingExperience";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import PoweredByWgc from "@/components/merchant/PoweredByWgc";
import { loadPublicGivingPageData } from "@/lib/givingLinks/loadPublicGivingPageData";
import { recordGivingLinkShareOpened } from "@/lib/givingLinks/recordShareOpened";

export default async function GivingLinkPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pledgeId?: string; share?: string; give?: string; amount?: string }>;
}) {
  const { slug } = await params;
  const { pledgeId, share, give, amount } = await searchParams;

  const data = await loadPublicGivingPageData(slug);

  if (data.ok && share) {
    // Best-effort, never blocks the page render — a failed/slow tracking
    // write must never keep a real donor from seeing the giving form.
    void recordGivingLinkShareOpened(share, data.link.id);
  }

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
        <OrganizationBrandHeader logoUrl={logoUrl} organizationName={church.name} kind="Secure Giving" nameColor={light.headingColor} kindColor={light.bodyTextColor} />
        <h1 className="text-lg font-bold text-center mb-1" style={{ color: light.headingColor }}>
          {link.publicTitle}
        </h1>
        {link.description && (
          <p className="text-sm text-center mb-6" style={{ color: light.bodyTextColor }}>
            {link.description}
          </p>
        )}

        {link.merchandiseEnabled ? (
          // Separate, additive donation+merchandise checkout experience —
          // see MerchandiseGivingExperience's doc comment. Every giving
          // link defaults to merchandiseEnabled=false, so this branch is
          // unreachable for any link that hasn't explicitly opted in, and
          // the existing GivingLinkForm below is completely untouched.
          <MerchandiseGivingExperience
            slug={slug}
            finixMerchantId={church.finixMerchantId!}
            churchName={church.name}
            allowedPaymentMethods={allowedPaymentMethods}
            googlePayGatewayMerchantId={googlePayGatewayMerchantId}
            googlePayMerchantId={googlePayMerchantId}
            googlePayEnvironment={googlePayEnvironment}
            serverAvailability={serverAvailability}
            feeCoverEnabled={link.feeCoverEnabled}
            feeCoverDefaultOn={link.feeCoverDefaultOn}
          />
        ) : (
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
            // ?give=monthly&amount=2500 opens the form on a monthly gift of that
            // amount (e.g. from an event registration's "make it monthly"
            // option) — only a starting point the donor can change, and only
            // when this page actually offers recurring giving.
            defaultDonationType={give === "monthly" && link.recurringEnabled ? "RECURRING" : link.defaultDonationType}
            defaultRecurringAmountCents={
              give === "monthly" && link.recurringEnabled && /^\d{3,9}$/.test(amount ?? "") && Number(amount) >= 100 ? Number(amount) : link.defaultRecurringAmountCents
            }
            allowedPaymentMethods={allowedPaymentMethods}
            feeCoverEnabled={link.feeCoverEnabled}
            feeCoverDefaultOn={link.feeCoverDefaultOn}
            donorFieldSettings={donorFieldSettings}
            collectMailingAddress={link.collectMailingAddress}
            pricing={pricing}
            thankYouMessage={branding.thankYouMessage}
            thankYouVideoUrl={branding.thankYouVideoUrl}
            googlePayGatewayMerchantId={googlePayGatewayMerchantId}
            googlePayMerchantId={googlePayMerchantId}
            googlePayEnvironment={googlePayEnvironment}
            serverAvailability={serverAvailability}
            fundSelectionEnabled={fundSelectionEnabled}
            assignedFunds={assignedFunds}
            pledgeId={pledgeId}
          />
        )}

        {branding.showPoweredByWgc !== false && <PoweredByWgc />}
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import PoweredByWgc from "@/components/merchant/PoweredByWgc";
import { loadOrganizationGivingPage } from "@/lib/givingLinks/loadOrganizationGivingPage";

// Reads live giving-link data, so this must render per request.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ link?: string }> };

// A generated page nobody opted into: keep it out of search results.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { link } = await searchParams;
  const page = await loadOrganizationGivingPage(slug, link).catch(() => null);
  const name = page?.ok ? page.data.church.name : null;
  return {
    title: name ? `Give to ${name}` : "Give",
    robots: { index: false, follow: false },
  };
}

export default async function OrganizationGivingPageRoute({ params, searchParams }: Props) {
  const { slug } = await params;
  const { link: preferredLink } = await searchParams;

  const page = await loadOrganizationGivingPage(slug, preferredLink);
  if (!page.ok) notFound();

  const { data, linkSlug } = page;
  const { light, church, link, branding, logoUrl } = data;
  const website = church.website && /^https?:\/\//i.test(church.website) ? church.website : null;

  return (
    <div className="min-h-screen px-4 py-10" style={{ backgroundColor: light.pageBackground }}>
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: light.borderColor, backgroundColor: light.headerBackground }}>
          {branding.campaignImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.campaignImageUrl} alt="" className="h-44 w-full object-cover" />
          )}
          <div className="p-6 sm:p-8">
            <OrganizationBrandHeader logoUrl={logoUrl} organizationName={church.name} kind="Secure Giving" nameColor={light.headingColor} kindColor={light.bodyTextColor} />
            <h1 className="mb-1 text-center text-xl font-bold" style={{ color: light.headingColor }}>
              {link.publicTitle}
            </h1>
            {link.description && (
              <p className="mb-6 whitespace-pre-line text-center text-sm leading-relaxed" style={{ color: light.bodyTextColor }}>
                {link.description}
              </p>
            )}
            <GivingLinkForm
              slug={linkSlug}
              finixMerchantId={church.finixMerchantId!}
              churchName={church.name}
              light={light}
              amountType={link.amountType as "FIXED" | "VARIABLE" | "FIXED_QUANTITY"}
              fixedAmountCents={link.fixedAmountCents}
              minAmountCents={link.minAmountCents}
              maxAmountCents={link.maxAmountCents}
              suggestedAmountsCents={data.suggestedAmountsCents}
              allowCustomAmount={link.allowCustomAmount}
              quantityItemLabel={link.quantityItemLabel}
              recurringEnabled={link.recurringEnabled}
              allowedFrequencies={data.allowedFrequencies}
              defaultDonationType={link.defaultDonationType}
              defaultRecurringAmountCents={link.defaultRecurringAmountCents}
              allowedPaymentMethods={data.allowedPaymentMethods}
              feeCoverEnabled={link.feeCoverEnabled}
              feeCoverDefaultOn={link.feeCoverDefaultOn}
              donorFieldSettings={data.donorFieldSettings}
              collectMailingAddress={link.collectMailingAddress}
              pricing={data.pricing}
              thankYouMessage={branding.thankYouMessage}
              thankYouVideoUrl={branding.thankYouVideoUrl}
              googlePayGatewayMerchantId={data.googlePayGatewayMerchantId}
              googlePayMerchantId={data.googlePayMerchantId}
              googlePayEnvironment={data.googlePayEnvironment}
              serverAvailability={data.serverAvailability}
              fundSelectionEnabled={data.fundSelectionEnabled}
              assignedFunds={data.assignedFunds}
            />
          </div>
        </div>

        {website && (
          <p className="mt-4 text-center text-sm" style={{ color: light.bodyTextColor }}>
            <a href={website} className="underline" rel="noopener noreferrer">
              Visit {church.name}
            </a>
          </p>
        )}
        {branding.showPoweredByWgc !== false && <PoweredByWgc />}
      </div>
    </div>
  );
}

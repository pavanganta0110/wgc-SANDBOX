import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DonationForm from "@/components/giving/DonationForm";

export default async function GivingPagePublic({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const givingPage = await prisma.givingPage.findUnique({
    where: { slug },
    include: {
      givingPagePersons: {
        include: { person: true },
        orderBy: { displayOrder: "asc" }
      }
    }
  });
  if (!givingPage) notFound();

  const church = await prisma.church.findUnique({ where: { id: givingPage.churchId } });
  if (!church || !church.finixMerchantId) notFound();

  if (!givingPage.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            {church.name} isn't accepting gifts here right now
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            This giving page has been temporarily disabled by the organization. You can try our demo giving
            experience below to see how WGC Payments works.
          </p>
          <a
            href="/demo/donation"
            className="inline-flex items-center px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            View Demo Giving Page
          </a>
        </div>
      </div>
    );
  }

  const pricing = await prisma.churchPricing.findUnique({ where: { churchId: church.id } });
  const suggestedAmountsCents = Array.isArray(givingPage.suggestedAmountsJson)
    ? (givingPage.suggestedAmountsJson as number[])
    : [2500, 5000, 10000, 25000, 50000, 100000];

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        {givingPage.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={givingPage.logoUrl} alt={church.name} className="h-12 mb-6 mx-auto object-contain" />
        )}
        <h1 className="text-lg font-bold text-slate-900 text-center mb-1">
          {givingPage.headline || `Give to ${church.name}`}
        </h1>
        {givingPage.description && (
          <p className="text-sm text-slate-500 text-center mb-6">{givingPage.description}</p>
        )}

        <DonationForm
          slug={slug}
          finixMerchantId={church.finixMerchantId}
          primaryColorHex={givingPage.primaryColorHex}
          suggestedAmountsCents={suggestedAmountsCents}
          allowRecurring={givingPage.allowRecurring}
          allowFeeCoverage={givingPage.allowFeeCoverage}
          pricing={{
            cardPercentageFee: pricing?.cardPercentageFee ?? null,
            cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
            achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
          }}
          givingPageType={givingPage.givingPageType}
          people={givingPage.givingPagePersons.map(p => ({
            id: p.person.id,
            displayName: p.person.displayName,
            profileImageUrl: p.person.profileImageUrl,
            title: p.person.title,
            ministryOrDepartment: p.person.ministryOrDepartment,
            publicDescription: p.person.publicDescription,
            isActive: p.person.isActive,
          })).filter(p => p.isActive)}
        />
      </div>
    </div>
  );
}

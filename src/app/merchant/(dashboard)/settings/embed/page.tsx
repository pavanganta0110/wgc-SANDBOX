import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import WebsiteEmbedForm from "@/components/merchant/WebsiteEmbedForm";

export default async function WebsiteEmbedSettingsPage() {
  const session = await getSession();
  const church = await prisma.church.findUnique({
    where: { id: session!.churchId! },
    select: { embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: true },
  });
  if (!church) return null;

  const givingLinks = await prisma.givingLink.findMany({
    where: { churchId: session!.churchId!, status: "ACTIVE" },
    select: { id: true, publicSlug: true, publicTitle: true },
    orderBy: { createdAt: "desc" },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Website Embed</h3>
      <p className="text-xs text-slate-500 mb-6">
        Add a donate button or inline giving form to your website — no coding required. Copy the generated snippet and
        paste it into your site.
      </p>
      <WebsiteEmbedForm
        appUrl={appUrl}
        givingLinks={givingLinks}
        initialEmbedDomainRestrictionEnabled={church.embedDomainRestrictionEnabled}
        initialAllowedDomains={Array.isArray(church.embedAllowedDomainsJson) ? (church.embedAllowedDomainsJson as string[]) : []}
      />
    </div>
  );
}

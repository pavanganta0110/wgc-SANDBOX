import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import GivingSettingsForm from "@/components/merchant/GivingSettingsForm";
import CopyDonorPortalLink from "@/components/merchant/CopyDonorPortalLink";

export default async function GivingSettingsPage() {
  const session = await getSession();
  const churchId = session!.churchId!;
  const [church, givingLinks] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.givingLink.findMany({ where: { churchId, status: "ACTIVE" }, select: { id: true, internalName: true, publicTitle: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  if (!church) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";

  return (
    <div className="space-y-6">
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Donor portal</h3>
      <p className="text-xs text-slate-500 mb-4">
        Share this link so donors can sign in with their email to see their giving, receipts and statements, and manage their recurring gifts.
        It also appears on your public giving pages and in recurring-gift confirmation emails.
      </p>
      <CopyDonorPortalLink url={`${appUrl}/give/${church.slug}/account`} organizationName={church.name} />
    </div>
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Giving</h3>
      <p className="text-xs text-slate-500 mb-6">
        Organization-wide giving preferences. Amount, payment method, and branding settings live on each individual{" "}
        <a href="/merchant/giving-links" className="text-blue-600 hover:underline">Giving Link</a>, where you can see a live preview of exactly what donors see.
      </p>
      <GivingSettingsForm
        initial={{
          defaultGivingLinkId: church.defaultGivingLinkId || "",
          givingTermsUrl: church.givingTermsUrl || "",
          givingPrivacyUrl: church.givingPrivacyUrl || "",
          givingSupportEmail: church.givingSupportEmail || "",
          defaultCollectMailingAddressOnNewLinks: church.defaultCollectMailingAddressOnNewLinks,
        }}
        givingLinks={givingLinks}
      />
    </div>
    </div>
  );
}

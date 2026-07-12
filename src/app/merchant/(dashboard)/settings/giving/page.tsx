import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import GivingSettingsForm from "@/components/merchant/GivingSettingsForm";

export default async function GivingSettingsPage() {
  const session = await getSession();
  const churchId = session!.churchId!;
  const [church, givingLinks] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.givingLink.findMany({ where: { churchId, status: "ACTIVE" }, select: { id: true, internalName: true, publicTitle: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  if (!church) return null;

  return (
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
        }}
        givingLinks={givingLinks}
      />
    </div>
  );
}

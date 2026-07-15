import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import BrandingSettingsForm from "@/components/merchant/BrandingSettingsForm";

export default async function BrandingSettingsPage() {
  const session = await getSession();
  const church = await prisma.church.findUnique({
    where: { id: session!.churchId! },
    select: { logoUrl: true, faviconUrl: true, primaryColor: true, secondaryColor: true, accentColor: true },
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Branding</h3>
      <p className="text-xs text-slate-500 mb-6">
        Your logo and colors appear on donor-facing giving pages, receipts, and statements.
      </p>
      <BrandingSettingsForm
        initial={{
          logoUrl: church?.logoUrl || "",
          faviconUrl: church?.faviconUrl || "",
          primaryColor: church?.primaryColor || "#0B5DBC",
          secondaryColor: church?.secondaryColor || "#111827",
          accentColor: church?.accentColor || "#10B981",
        }}
      />
    </div>
  );
}

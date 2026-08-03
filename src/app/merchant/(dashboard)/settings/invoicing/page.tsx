import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import InvoiceSettingsForm from "@/components/merchant/InvoiceSettingsForm";

export default async function InvoiceSettingsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageInvoiceSettings")) redirect("/merchant/settings");

  const [settings, church] = await Promise.all([
    prisma.invoiceSettings.upsert({ where: { churchId: auth.churchId }, create: { churchId: auth.churchId }, update: {} }),
    prisma.church.findUnique({ where: { id: auth.churchId }, select: { name: true, logoUrl: true } }),
  ]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Invoicing</h3>
      <p className="text-xs text-slate-500 mb-6">
        Configure your invoice numbering, branding, default terms, and reminder schedule. WGC does not determine your organization&apos;s tax obligations —
        enter tax rates and terms according to your own guidance.
      </p>
      <InvoiceSettingsForm initial={settings} fallbackOrgName={church?.name || "Your Organization"} fallbackLogoUrl={church?.logoUrl || null} />
    </div>
  );
}

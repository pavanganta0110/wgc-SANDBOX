import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import GeneralSettingsForm from "@/components/merchant/GeneralSettingsForm";

export default async function GeneralSettingsPage() {
  const session = await getSession();
  const church = await prisma.church.findUnique({ where: { id: session!.churchId! } });
  if (!church) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">General</h3>
      <p className="text-xs text-slate-500 mb-6">Your organization's identity and contact information.</p>
      <GeneralSettingsForm
        initial={{
          name: church.name,
          publicDisplayName: church.publicDisplayName || "",
          organizationType: church.organizationType || "",
          website: church.website || "",
          phone: church.phone || "",
          primaryContactEmail: church.primaryContactEmail,
          supportEmail: church.supportEmail || "",
          financeEmail: church.financeEmail || "",
          technicalContactEmail: church.technicalContactEmail || "",
          addressLine1: church.addressLine1 || "",
          addressLine2: church.addressLine2 || "",
          city: church.city || "",
          state: church.state || "",
          postalCode: church.postalCode || "",
          country: church.country || "",
          mailingAddressLine1: church.mailingAddressLine1 || "",
          mailingCity: church.mailingCity || "",
          mailingState: church.mailingState || "",
          mailingPostalCode: church.mailingPostalCode || "",
          timezone: church.timezone || "",
          dateFormat: church.dateFormat || "MM/DD/YYYY",
          fiscalYearStartMonth: church.fiscalYearStartMonth ?? 1,
          publicSupportContact: church.publicSupportContact || "",
        }}
      />
    </div>
  );
}

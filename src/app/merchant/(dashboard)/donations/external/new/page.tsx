import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import RecordExternalDonationForm from "@/components/merchant/RecordExternalDonationForm";

export default async function NewExternalDonationPage() {
  try {
    const auth = await requireMerchantSession();
    requirePermission(auth, "canCreateExternalDonation");
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/donations/external");
    throw err;
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-2xl mb-6">
        <h1 className="text-xl font-bold text-slate-900">Record External Donation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Record a donation received outside WGC Payments — cash, check, Cash App, Zelle, Venmo, PayPal, bank transfer, external card terminal, money order, or another method.
          This is never processed by WGC Payments and never affects your processing volume, fees, or settlements.
        </p>
      </div>
      <RecordExternalDonationForm />
    </div>
  );
}

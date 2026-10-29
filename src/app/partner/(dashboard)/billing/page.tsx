import PartnerBillingPanel from "@/components/partner/PartnerBillingPanel";

export const metadata = { title: "Billing | Partner dashboard" };

export default function PartnerBillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Billing</h2>
        <p className="text-sm text-slate-500 mt-1">What you pay WGC, your card on file, and your invoices.</p>
      </div>
      <PartnerBillingPanel />
    </div>
  );
}

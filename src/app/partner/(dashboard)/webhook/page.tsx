import { requireSoftwarePartner } from "@/lib/partners/partnerPageGuards";
import PartnerWebhookPanel from "@/components/partner/PartnerWebhookPanel";

export const metadata = { title: "Webhook | Partner dashboard" };

export default async function PartnerWebhookPage() {
  await requireSoftwarePartner();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Webhook</h2>
        <p className="text-sm text-slate-500 mt-1">One endpoint receives the events of all your organizations, each tagged with the organization it came from.</p>
      </div>
      <PartnerWebhookPanel />
    </div>
  );
}

import PartnerApiKeysPanel from "@/components/partner/PartnerApiKeysPanel";

export const metadata = { title: "API Key | Partner dashboard" };

export default function PartnerApiKeysPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">API Key</h2>
        <p className="text-sm text-slate-500 mt-1">One read-only key gives you the gifts and organizations of everyone linked to your account, for your own reporting.</p>
      </div>
      <PartnerApiKeysPanel />
    </div>
  );
}

import PartnerMenuPanel from "@/components/partner/PartnerMenuPanel";

export const metadata = { title: "Menu | Partner dashboard" };

export default function PartnerMenuPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Menu</h2>
        <p className="text-sm text-slate-500 mt-1">
          Choose which items your organizations see in the side menu when WGC is shown inside your platform. It applies to all your organizations. Signing in at wgcpayments.com directly still shows everything.
        </p>
      </div>
      <PartnerMenuPanel />
    </div>
  );
}

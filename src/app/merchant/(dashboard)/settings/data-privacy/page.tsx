import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import DataPrivacyPanel from "@/components/merchant/DataPrivacyPanel";

const EXPORTS = [
  { label: "Donors", href: "/api/merchant/donors/export" },
  { label: "Recurring Donors", href: "/api/merchant/recurring-donors/export" },
  { label: "Subscriptions", href: "/api/merchant/subscriptions/export" },
  { label: "Payments", href: "/api/merchant/transactions/payments/export" },
  { label: "Settlements", href: "/api/merchant/transactions/settlements/export" },
  { label: "Disputes", href: "/api/merchant/transactions/disputes/export" },
  { label: "Deposits", href: "/api/merchant/transactions/deposits/export" },
  { label: "Refunds", href: "/api/merchant/transactions/refunds/export" },
  { label: "Giving Links", href: "/api/merchant/giving-links/export" },
];

export default async function DataPrivacySettingsPage() {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — see the
  // matching API-route guard comment for why this back door exists
  // otherwise.
  if (session?.role === "wgc_admin") {
    redirect("/merchant/dashboard");
  }
  const permissions = getSettingsPermissions(session?.role);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Data &amp; Privacy</h3>
      <p className="text-xs text-slate-500 mb-6">Export your organization's data or request account closure.</p>

      <div className="mb-8">
        <p className="text-xs font-semibold text-slate-500 mb-3">Export Data (CSV)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {EXPORTS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 text-center"
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {permissions.canRequestAccountClosure && <DataPrivacyPanel />}
    </div>
  );
}

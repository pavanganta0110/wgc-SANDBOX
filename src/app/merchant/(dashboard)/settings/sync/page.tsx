import { getSession } from "@/lib/auth/session";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import SyncSettingsPanel from "@/components/merchant/SyncSettingsPanel";

export default async function SyncSettingsPage() {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Webhooks &amp; Sync</h3>
      <p className="text-xs text-slate-500 mb-6">
        Recent updates received from your payment processor and applied to this dashboard.
      </p>
      <SyncSettingsPanel canTriggerSync={permissions.canTriggerSync} />
    </div>
  );
}

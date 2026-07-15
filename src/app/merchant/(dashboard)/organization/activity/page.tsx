import AuditHistoryPanel from "@/components/merchant/AuditHistoryPanel";

export default function OrganizationActivityPage() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Activity</h3>
      <p className="text-xs text-slate-500 mb-6">A record of changes made to your organization's account.</p>
      <AuditHistoryPanel />
    </div>
  );
}

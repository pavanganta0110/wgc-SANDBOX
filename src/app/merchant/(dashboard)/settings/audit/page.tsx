import AuditHistoryPanel from "@/components/merchant/AuditHistoryPanel";

export default function AuditHistorySettingsPage() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Audit History</h3>
      <p className="text-xs text-slate-500 mb-6">A record of settings and account changes made in this dashboard.</p>
      <AuditHistoryPanel />
    </div>
  );
}

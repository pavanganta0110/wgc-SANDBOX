import { getSession } from "@/lib/auth/session";
import { loadOrganizationProfile } from "@/lib/organization/organizationProfileLoader";
import StateBadge from "@/components/merchant/StateBadge";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default async function OrganizationVerificationPage() {
  const session = await getSession();
  const profile = await loadOrganizationProfile(session!.churchId!);
  if (!profile) return null;
  const { onboarding } = profile;

  if (!onboarding) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <p className="text-sm text-slate-500">No verification record found for this organization yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Verification Status</h3>
          <StateBadge state={onboarding.verificationState || "NOT_STARTED"} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Row label="Onboarding Status" value={onboarding.onboardingStatus || onboarding.status} />
          <Row label="Submitted" value={onboarding.submittedAt ? new Date(onboarding.submittedAt).toLocaleDateString() : "—"} />
          <Row label="Approved" value={onboarding.approvedAt ? new Date(onboarding.approvedAt).toLocaleDateString() : "—"} />
          <Row label="Last Status Change" value={onboarding.lastStatusChangedAt ? new Date(onboarding.lastStatusChangedAt).toLocaleDateString() : "—"} />
        </div>
      </div>

      {onboarding.updateRequestedAt && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-amber-900 mb-2">Additional Information Requested</h3>
          <p className="text-sm text-amber-800">{onboarding.updateRequestedReason || "WGC has requested additional information to complete verification."}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Processing Capabilities</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500 mb-1">Payment Processing</p>
            <StateBadge state={onboarding.processingEnabled ? "ENABLED" : "DISABLED"} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Settlement</p>
            <StateBadge state={onboarding.settlementEnabled ? "ENABLED" : "DISABLED"} />
          </div>
        </div>
      </div>
    </div>
  );
}

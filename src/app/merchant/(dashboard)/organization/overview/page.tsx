import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { loadOrganizationProfile } from "@/lib/organization/organizationProfileLoader";
import RequestChangeButton from "@/components/merchant/RequestChangeButton";

function Row({ label, value, area, canRequest }: { label: string; value: string; area?: string; canRequest?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
      {area && canRequest && (
        <div className="mt-1">
          <RequestChangeButton area={area} label={`Request: ${label}`} />
        </div>
      )}
    </div>
  );
}

export default async function OrganizationOverviewPage() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  const profile = await loadOrganizationProfile(session!.churchId!);
  if (!profile) return null;
  const { church, onboarding } = profile;

  const legalName = church.name || onboarding?.legalBusinessName || onboarding?.organizationName || "—";
  const orgType = church.organizationType || onboarding?.organizationType || "—";
  const legalAddress = [church.addressLine1 || onboarding?.businessAddressLine1, church.city || onboarding?.businessCity, church.state || onboarding?.businessState, church.postalCode || onboarding?.businessPostalCode]
    .filter(Boolean)
    .join(", ") || "—";
  const taxId = church.taxId ? `••••${church.taxId.slice(-4)}` : onboarding?.businessTaxIdProvided ? "On file" : "Not on file";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Legal Identity</h3>
          <span className="text-xs text-slate-400">Restricted — changes require WGC review</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Row label="Legal Business Name" value={legalName} area="LEGAL_NAME" canRequest={permissions.canRequestRestrictedChange} />
          <Row label="Doing Business As" value={onboarding?.doingBusinessAs || "—"} />
          <Row label="Organization Type" value={orgType} area="ORGANIZATION_TYPE" canRequest={permissions.canRequestRestrictedChange} />
          <Row label="Tax ID" value={taxId} area="TAX_ID" canRequest={permissions.canRequestRestrictedChange} />
          <Row label="Legal/Business Address" value={legalAddress} area="LEGAL_ADDRESS" canRequest={permissions.canRequestRestrictedChange} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Organization Details</h3>
          <Link href="/merchant/settings/general" className="text-xs font-semibold text-blue-600 hover:underline">
            Edit in Settings
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Row label="Public Display Name" value={church.publicDisplayName || church.name} />
          <Row label="Website" value={church.website || "—"} />
          <Row label="Support Email" value={church.supportEmail || church.primaryContactEmail} />
          <Row label="Phone" value={church.phone || onboarding?.businessPhone || "—"} />
          <Row
            label="Mailing Address"
            value={[church.mailingAddressLine1, church.mailingCity, church.mailingState, church.mailingPostalCode].filter(Boolean).join(", ") || "—"}
          />
          <Row label="Timezone" value={church.timezone || "America/Chicago (default)"} />
        </div>
      </div>

      {onboarding && onboarding.associatedOwners.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Owners</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3 text-right">Ownership</th>
              </tr>
            </thead>
            <tbody>
              {onboarding.associatedOwners.map((owner) => (
                <tr key={owner.id} className="border-t border-slate-50">
                  <td className="px-6 py-3 text-slate-700">{owner.firstName} {owner.lastName}</td>
                  <td className="px-6 py-3 text-slate-600">{owner.title || "—"}</td>
                  <td className="px-6 py-3 text-slate-600">{owner.email}</td>
                  <td className="px-6 py-3 text-right text-slate-600">{owner.ownershipPercentage != null ? `${owner.ownershipPercentage}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {permissions.canRequestRestrictedChange && (
            <div className="px-6 py-4 border-t border-slate-100">
              <RequestChangeButton area="OWNERSHIP" label="Request Ownership Change" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

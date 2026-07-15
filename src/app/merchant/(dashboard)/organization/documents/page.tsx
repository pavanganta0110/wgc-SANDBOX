import { getSession } from "@/lib/auth/session";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import DocumentsPanel from "@/components/merchant/DocumentsPanel";

export default async function OrganizationDocumentsPage() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Documents</h3>
      <p className="text-xs text-slate-500 mb-6">Verification and compliance documents on file with WGC Payments.</p>
      <DocumentsPanel canUpload={permissions.canUploadDocuments} />
    </div>
  );
}

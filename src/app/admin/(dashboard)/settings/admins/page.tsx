import { getAdminSession } from "@/lib/auth/session";
import AdminManagementClient from "@/components/admin/AdminManagementClient";

export default async function AdminManagementPage() {
  const session = await getAdminSession();
  if (!session || session.role !== "wgc_super_admin") {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <h1 className="text-lg font-bold text-slate-900 mb-2">403 — Access denied</h1>
        <p className="text-sm text-slate-500">Only Super Admins can manage admin accounts.</p>
      </div>
    );
  }

  return <AdminManagementClient />;
}

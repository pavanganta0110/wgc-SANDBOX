import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import PartnersPanel from "@/components/admin/PartnersPanel";

export const metadata = { title: "Partners | WGC Admin" };

export default async function AdminPartnersPage() {
  const session = await getAdminSession();
  if (!session || session.role !== "wgc_super_admin") redirect("/admin");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Partners</h2>
        <p className="text-sm text-slate-500 mt-1">
          Software partners whose customers use WGC. Partner staff sign in at /partner/login and see only the organizations linked here.
        </p>
      </div>
      <PartnersPanel />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import PartnerCommissionAdmin from "@/components/admin/PartnerCommissionAdmin";

export const metadata = { title: "Partner commission | WGC Admin" };

export default async function AdminPartnerCommissionPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const session = await getAdminSession();
  if (!session || session.role !== "wgc_super_admin") redirect("/admin");
  const { partnerId } = await params;
  return <PartnerCommissionAdmin partnerId={partnerId} />;
}

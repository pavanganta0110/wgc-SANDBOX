import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import PartnerPerformance from "@/components/admin/PartnerPerformance";

export const metadata = { title: "Partner performance | WGC Admin" };

export default async function AdminPartnerPerformancePage({ params }: { params: Promise<{ partnerId: string }> }) {
  const session = await getAdminSession();
  if (!session || session.role !== "wgc_super_admin") redirect("/admin");
  const { partnerId } = await params;
  return <PartnerPerformance partnerId={partnerId} />;
}

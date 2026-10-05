import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import IncidentDetailClient from "./IncidentDetailClient";

export default async function SystemHealthIncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  const { incidentId } = await params;

  return <IncidentDetailClient incidentId={incidentId} />;
}

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import ErrorDetailClient from "./ErrorDetailClient";

export default async function SystemHealthErrorDetailPage({ params }: { params: Promise<{ errorGroupId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  const { errorGroupId } = await params;

  return <ErrorDetailClient errorGroupId={errorGroupId} />;
}

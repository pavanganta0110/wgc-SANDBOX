import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import JobDetailClient from "./JobDetailClient";

export default async function SystemHealthJobDetailPage({ params }: { params: Promise<{ jobName: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  const { jobName } = await params;

  return <JobDetailClient jobName={jobName} />;
}

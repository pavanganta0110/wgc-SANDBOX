import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import JobsListClient from "./JobsListClient";

export default async function SystemHealthJobsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return <JobsListClient />;
}

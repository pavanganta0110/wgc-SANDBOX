import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import AlertHistoryClient from "./AlertHistoryClient";

export default async function SystemHealthAlertsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return <AlertHistoryClient />;
}

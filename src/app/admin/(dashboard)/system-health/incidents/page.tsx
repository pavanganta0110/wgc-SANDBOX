import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import IncidentsListClient from "./IncidentsListClient";

export default async function SystemHealthIncidentsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return <IncidentsListClient />;
}

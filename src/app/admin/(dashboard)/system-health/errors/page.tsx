import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import ErrorsListClient from "./ErrorsListClient";

export default async function SystemHealthErrorsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return <ErrorsListClient />;
}

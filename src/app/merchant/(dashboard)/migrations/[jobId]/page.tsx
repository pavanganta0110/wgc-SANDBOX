import { redirect, notFound } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { getMigrationJob } from "@/lib/migrations/migrationEngine";
import MigrationWizardClient from "@/components/merchant/MigrationWizardClient";

export default async function MigrationJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageMigrations")) redirect("/merchant/dashboard");

  const job = await getMigrationJob(jobId, auth.churchId);
  if (!job) notFound();

  return <MigrationWizardClient initialJob={job} />;
}

import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { getMigrationReconciliation } from "@/lib/migrations/migrationEngine";

export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageMigrations");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const report = await getMigrationReconciliation(jobId, auth.churchId);
  if (!report) return NextResponse.json({ error: "Migration job not found" }, { status: 404 });

  return NextResponse.json(report);
}

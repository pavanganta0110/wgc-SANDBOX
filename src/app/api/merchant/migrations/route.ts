import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { createMigrationJob, listMigrationJobs } from "@/lib/migrations/migrationEngine";
import { IMPLEMENTED_SOURCE_SYSTEMS, MIGRATION_SOURCE_SYSTEMS } from "@/lib/migrations/types";

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageMigrations");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const jobs = await listMigrationJobs(auth.churchId);
  return NextResponse.json({ jobs, availableSourceSystems: MIGRATION_SOURCE_SYSTEMS, implementedSourceSystems: IMPLEMENTED_SOURCE_SYSTEMS });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageMigrations");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const sourceSystem = typeof body.sourceSystem === "string" ? body.sourceSystem : "";
  if (!MIGRATION_SOURCE_SYSTEMS.includes(sourceSystem as (typeof MIGRATION_SOURCE_SYSTEMS)[number])) {
    return NextResponse.json({ error: "Invalid source system" }, { status: 400 });
  }
  if (!IMPLEMENTED_SOURCE_SYSTEMS.includes(sourceSystem as (typeof IMPLEMENTED_SOURCE_SYSTEMS)[number])) {
    return NextResponse.json({ error: "This source isn't available yet — it needs a connection to be set up first. Contact support to get started." }, { status: 400 });
  }

  const job = await createMigrationJob(auth.churchId, auth.userId, sourceSystem);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "migration_job.created",
    entityType: "MigrationJob",
    entityId: job.id,
    metadata: { sourceSystem },
    req,
  });

  return NextResponse.json({ job });
}

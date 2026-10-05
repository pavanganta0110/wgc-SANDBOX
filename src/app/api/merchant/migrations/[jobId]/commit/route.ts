import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getMigrationJob, commitMigrationEntitySource } from "@/lib/migrations/migrationEngine";
import { MIGRATION_ENTITY_TYPES } from "@/lib/migrations/types";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageMigrations");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const job = await getMigrationJob(jobId, auth.churchId);
  if (!job) return NextResponse.json({ error: "Migration job not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const entityType = typeof body.entityType === "string" ? body.entityType : "";
  if (!MIGRATION_ENTITY_TYPES.includes(entityType as (typeof MIGRATION_ENTITY_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }
  const csvText: string = typeof body.csvText === "string" ? body.csvText : "";
  if (!csvText.trim()) return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  const fileName: string = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim().slice(0, 200) : "import.csv";
  const mapping = body.columnMapping && typeof body.columnMapping === "object" ? body.columnMapping : {};
  const skipRowNumbers: number[] = Array.isArray(body.skipRowNumbers) ? body.skipRowNumbers : [];

  try {
    const updated = await commitMigrationEntitySource({
      jobId,
      churchId: auth.churchId,
      entityType: entityType as (typeof MIGRATION_ENTITY_TYPES)[number],
      csvText,
      fileName,
      mapping,
      skipRowNumbers,
    });

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      action: "migration_job.source_committed",
      entityType: "MigrationJob",
      entityId: jobId,
      metadata: { forEntityType: entityType, totalRecords: updated.totalRecords },
      req,
    });

    return NextResponse.json({ job: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to commit source";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

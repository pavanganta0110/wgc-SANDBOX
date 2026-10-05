import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { getMigrationJob, previewMigrationSource } from "@/lib/migrations/migrationEngine";
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
  const mapping = body.columnMapping && typeof body.columnMapping === "object" ? body.columnMapping : undefined;

  try {
    const preview = await previewMigrationSource(auth.churchId, entityType as (typeof MIGRATION_ENTITY_TYPES)[number], csvText, mapping);
    return NextResponse.json(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to preview file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

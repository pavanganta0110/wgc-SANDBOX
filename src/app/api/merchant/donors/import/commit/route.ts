import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { buildImportPreview } from "@/lib/donors/csvImport";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

/**
 * Re-parses and re-validates the CSV server-side rather than trusting the
 * client's preview response — the preview step is read-only and its output
 * could be stale (donors created since) or tampered with.
 *
 * Every row with a usable normalized email (whether brand-new or already
 * matching a donor in this church) goes through the same
 * resolveOrCreateDonor() every payment/subscription flow uses — importing
 * the same normalized email twice reuses/updates that one donor rather
 * than creating a duplicate. Only rows the server itself classifies as an
 * unusable input (validation error) or a same-file repeat are rejected/
 * skipped without ever calling the resolver.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const csvText: string = typeof body.csvText === "string" ? body.csvText : "";
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  const existingDonors = await prisma.donor.findMany({
    where: { churchId: auth.churchId, archivedAt: null, normalizedEmail: { not: null } },
    select: { normalizedEmail: true },
  });
  const existingNormalizedEmails = new Set(existingDonors.map((d) => d.normalizedEmail!));

  const rows = buildImportPreview(csvText, existingNormalizedEmails);
  // "duplicate_in_file" rows repeat a normalized email already claimed by
  // an earlier row in this same file — only the first occurrence is
  // resolved, so the same file never races itself into two donors for one
  // email. "error" rows failed field-level validation and are rejected.
  const toResolve = rows.filter((r) => r.status === "valid" || r.status === "duplicate_in_org");

  let created = 0;
  let updated = 0;
  let reused = 0;
  const failed: { rowNumber: number; error: string }[] = [];

  for (const row of toResolve) {
    try {
      const result = await resolveOrCreateDonor({
        churchId: auth.churchId,
        name: row.input.name,
        email: row.input.email,
        phone: row.input.phone,
        addressLine1: row.input.addressLine1,
        addressLine2: row.input.addressLine2,
        city: row.input.city,
        state: row.input.state,
        postalCode: row.input.postalCode,
        country: row.input.country,
        companyName: row.input.companyName,
      });
      if (result.created) created += 1;
      else if (result.updated) updated += 1;
      else reused += 1;
    } catch (err: any) {
      failed.push({ rowNumber: row.rowNumber, error: err.message || "Failed to import donor" });
    }
  }

  const rejected = rows.length - toResolve.length;

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.csv_import",
    entityType: "donor",
    metadata: { totalRows: rows.length, created, updated, reused, rejected, failed: failed.length },
    req,
  });

  // "skipped" kept alongside "rejected" for backward compatibility with
  // the existing import-result UI, which reads that field name.
  return NextResponse.json({ created, updated, reused, rejected, skipped: rejected, failed });
}

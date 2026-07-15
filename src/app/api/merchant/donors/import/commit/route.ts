import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";
import { buildImportPreview } from "@/lib/donors/csvImport";

/**
 * Re-parses and re-validates the CSV server-side rather than trusting the
 * client's preview response — the preview step is read-only and its output
 * could be stale (donors created since) or tampered with. Only rows the
 * server itself classifies as "valid" (not error/duplicate) are written.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const csvText: string = typeof body.csvText === "string" ? body.csvText : "";
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  const existingDonors = await prisma.donor.findMany({
    where: { churchId: session.churchId, archivedAt: null, normalizedEmail: { not: null } },
    select: { normalizedEmail: true },
  });
  const existingNormalizedEmails = new Set(existingDonors.map((d) => d.normalizedEmail!));

  const rows = buildImportPreview(csvText, existingNormalizedEmails);
  const toCreate = rows.filter((r) => r.status === "valid");

  let created = 0;
  const failed: { rowNumber: number; error: string }[] = [];

  for (const row of toCreate) {
    try {
      await prisma.donor.create({
        data: {
          churchId: session.churchId,
          name: row.input.name,
          email: row.input.email,
          normalizedEmail: normalizeEmail(row.input.email),
          phone: row.input.phone,
          normalizedPhone: normalizePhone(row.input.phone),
          addressLine1: row.input.addressLine1,
          addressLine2: row.input.addressLine2,
          city: row.input.city,
          state: row.input.state,
          postalCode: row.input.postalCode,
          country: row.input.country,
          companyName: row.input.companyName,
        },
      });
      created += 1;
    } catch (err: any) {
      failed.push({ rowNumber: row.rowNumber, error: err.message || "Failed to create donor" });
    }
  }

  const skipped = rows.length - toCreate.length;

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "donor.csv_import",
    entityType: "donor",
    metadata: { totalRows: rows.length, created, skipped, failed: failed.length },
    req,
  });

  return NextResponse.json({ created, skipped, failed });
}

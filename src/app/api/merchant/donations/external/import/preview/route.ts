import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { normalizeEmail } from "@/lib/donors/donorContact";
import {
  parseCsv,
  suggestColumnMapping,
  findDuplicateMappings,
  mapRow,
  validateMappedRow,
  computeRowFingerprint,
  IMPORT_ROW_CAP,
  REQUIRED_IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  type ColumnMapping,
} from "@/lib/donations/externalDonationImport";

export interface PreviewRow {
  rowNumber: number;
  input: Record<string, string | null>;
  status: "valid" | "warning" | "invalid" | "duplicate";
  errors: string[];
  warnings: string[];
  amountCents: number | null;
  donationDateISO: string | null;
  fund: string | null;
  fundResolved: boolean;
  donorResolution: "MATCHED_EXISTING" | "CREATED_NEW" | "ANONYMOUS" | "UNMATCHED";
  possibleDuplicate: boolean;
  duplicateReason: string | null;
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canImportExternalDonations");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const csvText: string = typeof body.csvText === "string" ? body.csvText : "";
  if (!csvText.trim()) return NextResponse.json({ error: "csvText is required" }, { status: 400 });

  const rows = parseCsv(csvText);
  if (rows.length === 0) return NextResponse.json({ error: "The file appears to be empty" }, { status: 400 });

  const [headerRow, ...dataRows] = rows;
  const mapping: ColumnMapping =
    body.columnMapping && typeof body.columnMapping === "object" ? (body.columnMapping as ColumnMapping) : suggestColumnMapping(headerRow);

  const missingRequired = REQUIRED_IMPORT_FIELDS.filter((f) => !Object.values(mapping).includes(f));
  const duplicateMappings = findDuplicateMappings(mapping);

  const capped = dataRows.slice(0, IMPORT_ROW_CAP);

  // Existing org data needed to classify rows: normalized donor emails, fund
  // names, and a bounded recent window of existing donations for duplicate
  // matching (matching the same "nearby date" rule used by manual entry).
  const [existingDonors, existingFunds, existingDonations] = await Promise.all([
    prisma.donor.findMany({ where: { churchId: auth.churchId, archivedAt: null, normalizedEmail: { not: null } }, select: { normalizedEmail: true } }),
    prisma.fund.findMany({ where: { churchId: auth.churchId, isActive: true }, select: { name: true } }),
    prisma.externalDonation.findMany({
      where: { churchId: auth.churchId, status: { not: "VOIDED" } },
      select: { donationAmountCents: true, donationDate: true, externalTransactionId: true, confirmationNumber: true, checkNumber: true, importFingerprint: true },
      take: 5000,
    }),
  ]);
  const existingEmails = new Set(existingDonors.map((d) => d.normalizedEmail!));
  const existingFundNames = new Set(existingFunds.map((f) => f.name.toLowerCase()));
  const existingFingerprints = new Set(existingDonations.map((d) => d.importFingerprint).filter(Boolean));

  const seenFingerprintsInFile = new Set<string>();
  const unresolvedFunds = new Set<string>();
  const previewRows: PreviewRow[] = [];

  capped.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const mapped = mapRow(headerRow, row, mapping);
    const validation = validateMappedRow(mapped);

    const fingerprint = computeRowFingerprint(auth.churchId, {
      donorEmail: mapped.donorEmail,
      donorFirstName: mapped.donorFirstName,
      donorLastName: mapped.donorLastName,
      amountCents: validation.amountCents,
      donationDate: mapped.donationDate,
      referenceNumber: mapped.referenceNumber,
    });

    let possibleDuplicate = false;
    let duplicateReason: string | null = null;
    if (existingFingerprints.has(fingerprint)) {
      possibleDuplicate = true;
      duplicateReason = "Matches a donation already recorded (same donor, amount, date, and reference)";
    } else if (seenFingerprintsInFile.has(fingerprint)) {
      possibleDuplicate = true;
      duplicateReason = "Duplicate of another row in this file";
    } else if (mapped.referenceNumber && existingDonations.some((d) => [d.externalTransactionId, d.confirmationNumber, d.checkNumber].includes(mapped.referenceNumber))) {
      possibleDuplicate = true;
      duplicateReason = "Reference number matches an existing donation";
    }
    seenFingerprintsInFile.add(fingerprint);

    let fundResolved = true;
    if (mapped.fund) {
      fundResolved = existingFundNames.has(mapped.fund.toLowerCase());
      if (!fundResolved) unresolvedFunds.add(mapped.fund);
    }

    const normalizedEmail = normalizeEmail(mapped.donorEmail);
    let donorResolution: PreviewRow["donorResolution"] = "UNMATCHED";
    if (validation.isAnonymous) donorResolution = "ANONYMOUS";
    else if (normalizedEmail && existingEmails.has(normalizedEmail)) donorResolution = "MATCHED_EXISTING";
    else if (validation.donorName || mapped.donorEmail || mapped.donorPhone) donorResolution = "CREATED_NEW";

    const status: PreviewRow["status"] =
      validation.errors.length > 0 ? "invalid" : possibleDuplicate ? "duplicate" : validation.warnings.length > 0 ? "warning" : "valid";

    previewRows.push({
      rowNumber,
      input: mapped as unknown as Record<string, string | null>,
      status,
      errors: validation.errors,
      warnings: validation.warnings,
      amountCents: validation.amountCents,
      donationDateISO: validation.donationDate ? validation.donationDate.toISOString() : null,
      fund: mapped.fund,
      fundResolved,
      donorResolution,
      possibleDuplicate,
      duplicateReason,
    });
  });

  const summary = {
    totalRows: previewRows.length,
    validRows: previewRows.filter((r) => r.status === "valid").length,
    warningRows: previewRows.filter((r) => r.status === "warning").length,
    invalidRows: previewRows.filter((r) => r.status === "invalid").length,
    possibleDuplicates: previewRows.filter((r) => r.possibleDuplicate).length,
    totalAmountCents: previewRows.filter((r) => r.status !== "invalid").reduce((sum, r) => sum + (r.amountCents ?? 0), 0),
  };

  return NextResponse.json({
    headers: headerRow,
    suggestedMapping: suggestColumnMapping(headerRow),
    mapping,
    missingRequiredFields: missingRequired.map((f) => IMPORT_FIELD_LABELS[f]),
    duplicateMappedFields: duplicateMappings.map((f) => IMPORT_FIELD_LABELS[f]),
    rows: previewRows,
    unresolvedFunds: [...unresolvedFunds],
    summary,
    cappedAt: dataRows.length > IMPORT_ROW_CAP ? IMPORT_ROW_CAP : null,
  });
}

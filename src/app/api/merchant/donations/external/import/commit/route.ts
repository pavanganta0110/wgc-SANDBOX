import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { canManageFunds } from "@/lib/giving/fundPermissions";
import { classifySource } from "@/lib/donations/externalDonationTypes";
import {
  parseCsv,
  suggestColumnMapping,
  mapRow,
  validateMappedRow,
  computeRowFingerprint,
  IMPORT_ROW_CAP,
  type ColumnMapping,
} from "@/lib/donations/externalDonationImport";

/**
 * Re-parses and re-validates the CSV server-side — the preview step is
 * read-only and its response could be stale or client-tampered, same rule
 * as the donor CSV import commit route. Every resolvable row goes through
 * the same resolveOrCreateDonor() every other donation entry path uses.
 */

function rowDonorResolution(
  donorMatchStatus: "MATCHED" | "ANONYMOUS" | "UNMATCHED",
  donorId: string | null,
  donorWasCreated: boolean
): "ANONYMOUS" | "CREATED_NEW" | "MATCHED_EXISTING" | "UNMATCHED" {
  if (donorMatchStatus === "ANONYMOUS") return "ANONYMOUS";
  if (!donorId) return "UNMATCHED";
  return donorWasCreated ? "CREATED_NEW" : "MATCHED_EXISTING";
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

  type FundResolution = { action: "use_existing" | "create" | "none"; fundId?: string };

  const csvText: string = typeof body.csvText === "string" ? body.csvText : "";
  const fileName: string = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim().slice(0, 200) : "import.csv";
  const columnMapping: ColumnMapping | undefined =
    body.columnMapping && typeof body.columnMapping === "object" ? (body.columnMapping as ColumnMapping) : undefined;
  // fundResolutions: raw fund name (as it appeared in the file) -> { action, fundId? }
  const fundResolutions: Record<string, FundResolution> =
    body.fundResolutions && typeof body.fundResolutions === "object" ? (body.fundResolutions as Record<string, FundResolution>) : {};
  // Row numbers (1-indexed, matching preview) the organization chose to skip — usually possible duplicates.
  const skipRowNumbers = new Set<number>(Array.isArray(body.skipRowNumbers) ? (body.skipRowNumbers as number[]) : []);
  const receiptOptionRaw = typeof body.receiptOption === "string" ? body.receiptOption : "";
  const receiptOption: string = ["NONE", "AFTER_IMPORT", "ONLY_FLAGGED", "REVIEW_BEFORE_SENDING"].includes(receiptOptionRaw) ? receiptOptionRaw : "NONE";

  if (!csvText.trim()) return NextResponse.json({ error: "csvText is required" }, { status: 400 });

  const rows = parseCsv(csvText);
  if (rows.length === 0) return NextResponse.json({ error: "The file appears to be empty" }, { status: 400 });
  const [headerRow, ...dataRows] = rows;
  const mapping = columnMapping || suggestColumnMapping(headerRow);
  const capped = dataRows.slice(0, IMPORT_ROW_CAP);

  const batch = await prisma.externalDonationImportBatch.create({
    data: {
      churchId: auth.churchId,
      fileName,
      uploadedByUserId: auth.userId,
      status: "IMPORTING",
      totalRows: capped.length,
      receiptOption,
      columnMappingJson: mapping,
      startedAt: new Date(),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: "external_donation_import.uploaded",
    entityType: "ExternalDonationImportBatch",
    entityId: batch.id,
    metadata: { fileName, totalRows: capped.length },
    req,
  });

  const existingFunds = await prisma.fund.findMany({ where: { churchId: auth.churchId }, select: { id: true, name: true } });
  const fundByLowerName = new Map(existingFunds.map((f) => [f.name.toLowerCase(), f]));
  const canCreateFund = canManageFunds(auth);

  let successRows = 0;
  let failedRows = 0;
  let skippedRows = 0;
  let totalAmountCents = 0;
  let receiptsQueued = 0;
  let newDonorsCreated = 0;
  let donorsMatched = 0;

  for (let idx = 0; idx < capped.length; idx++) {
    const rowNumber = idx + 1;
    const row = capped[idx];
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

    if (skipRowNumbers.has(rowNumber)) {
      skippedRows++;
      await prisma.externalDonationImportRow.create({
        data: { importBatchId: batch.id, rowNumber, rawDataJson: mapped as unknown as Prisma.InputJsonValue, fingerprint, status: "SKIPPED" },
      });
      continue;
    }

    if (validation.errors.length > 0) {
      failedRows++;
      await prisma.externalDonationImportRow.create({
        data: { importBatchId: batch.id, rowNumber, rawDataJson: mapped as unknown as Prisma.InputJsonValue, fingerprint, status: "FAILED", errorsJson: validation.errors },
      });
      continue;
    }

    try {
      // Fund resolution: explicit per-file-name decision from the wizard's
      // Step 4, falling back to a direct name match, then "no fund" if
      // neither applies — a row is never rejected for an unresolved fund.
      let fundId: string | null = null;
      let fundName: string | null = mapped.fund;
      if (mapped.fund) {
        const decision = fundResolutions[mapped.fund];
        if (decision?.action === "use_existing" && decision.fundId) {
          fundId = decision.fundId;
        } else if (decision?.action === "create" && canCreateFund) {
          const existing = fundByLowerName.get(mapped.fund.toLowerCase());
          if (existing) {
            fundId = existing.id;
          } else {
            const maxOrder = await prisma.fund.aggregate({ where: { churchId: auth.churchId }, _max: { displayOrder: true } });
            const created = await prisma.fund.create({
              data: { churchId: auth.churchId, name: mapped.fund, isActive: true, displayOrder: (maxOrder._max.displayOrder ?? 0) + 1 },
            });
            fundByLowerName.set(mapped.fund.toLowerCase(), created);
            fundId = created.id;
          }
        } else if (decision?.action === "none") {
          fundName = null;
        } else {
          const existing = fundByLowerName.get(mapped.fund.toLowerCase());
          if (existing) fundId = existing.id;
        }
      }

      // Donor resolution — identical rule to manual entry: never merge on
      // name alone, email/phone only, anonymous rows never touch a donor.
      let donorId: string | null = null;
      let donorMatchStatus: "MATCHED" | "ANONYMOUS" | "UNMATCHED" = "UNMATCHED";
      let isAnonymous = false;
      let donorWasCreated = false;
      if (validation.isAnonymous) {
        isAnonymous = true;
        donorMatchStatus = "ANONYMOUS";
      } else if (validation.donorName || mapped.donorEmail || mapped.donorPhone) {
        const resolved = await resolveOrCreateDonor({
          churchId: auth.churchId,
          name: validation.donorName,
          email: mapped.donorEmail,
          phone: mapped.donorPhone,
        });
        donorId = resolved.id;
        donorMatchStatus = "MATCHED";
        donorWasCreated = resolved.created;
        if (resolved.created) newDonorsCreated++;
        else donorsMatched++;

        if (mapped.donorAddress) {
          const { cleanAddressInput, hasAnyAddressField, applyDonorAddressUpdate } = await import("@/lib/donors/donorAddress");
          const cleaned = cleanAddressInput({ addressLine1: mapped.donorAddress });
          if (hasAnyAddressField(cleaned)) {
            await applyDonorAddressUpdate({
              donorId,
              churchId: auth.churchId,
              newAddress: cleaned,
              source: "CSV_IMPORT",
              enteredByDonor: false,
              actorUserId: auth.userId,
              actorEmail: auth.email,
              actorRole: auth.role,
              req,
            });
          }
        }
      }

      const source = classifySource(validation.paymentMethod!);
      const duplicate = await prisma.externalDonation.findFirst({
        where: {
          churchId: auth.churchId,
          status: { not: "VOIDED" },
          OR: [
            ...(donorId ? [{ donorId, donationAmountCents: validation.amountCents!, donationDate: validation.donationDate! }] : []),
            ...(mapped.referenceNumber ? [{ externalTransactionId: mapped.referenceNumber }, { confirmationNumber: mapped.referenceNumber }, { checkNumber: mapped.referenceNumber }] : []),
          ],
        },
        select: { id: true },
      });

      const shouldQueueReceipt =
        !isAnonymous &&
        donorId &&
        ((receiptOption === "AFTER_IMPORT") || (receiptOption === "ONLY_FLAGGED" && validation.sendReceipt));

      const created = await prisma.externalDonation.create({
        data: {
          churchId: auth.churchId,
          donorId,
          donorMatchStatus,
          isAnonymous,
          donationAmountCents: validation.amountCents!,
          donationDate: validation.donationDate!,
          paymentMethod: validation.paymentMethod!,
          otherPaymentMethodName: validation.otherPaymentMethodName,
          source,
          fundId,
          fundName,
          campaign: mapped.campaign,
          externalTransactionId: mapped.referenceNumber,
          confirmationNumber: mapped.referenceNumber,
          internalNote: mapped.notes,
          includeInAnnualStatement: true,
          isTaxDeductible: validation.isTaxDeductible,
          deductibleAmountCents: validation.deductibleAmountCents,
          goodsOrServicesProvided: validation.goodsOrServicesProvided,
          goodsOrServicesDescription: null,
          goodsOrServicesValueCents: validation.goodsOrServicesValueCents,
          receiptStatus: shouldQueueReceipt ? "QUEUED" : null,
          status: "RECEIVED",
          processedByWgc: false,
          processingFeeCents: 0,
          supplementalFeeCents: 0,
          possibleDuplicate: Boolean(duplicate),
          duplicateOfExternalDonationId: duplicate?.id ?? null,
          createdByUserId: auth.userId,
          importBatchId: batch.id,
          importRowNumber: rowNumber,
          importFingerprint: fingerprint,
        },
      });

      const rowDonorResolutionValue = rowDonorResolution(donorMatchStatus, donorId, donorWasCreated);

      await prisma.externalDonationAuditLog.create({
        data: { externalDonationId: created.id, action: "IMPORTED", toValue: rowDonorResolutionValue, performedByUserId: auth.userId },
      });

      await prisma.externalDonationImportRow.update({
        where: { importBatchId_rowNumber: { importBatchId: batch.id, rowNumber } },
        data: { status: "IMPORTED", externalDonationId: created.id, donorResolution: rowDonorResolutionValue },
      }).catch(() =>
        // Row record may not exist yet if this is the first write for this row — create it.
        prisma.externalDonationImportRow.create({
          data: {
            importBatchId: batch.id,
            rowNumber,
            rawDataJson: mapped as unknown as Prisma.InputJsonValue,
            fingerprint,
            status: "IMPORTED",
            externalDonationId: created.id,
            donorResolution: rowDonorResolutionValue,
          },
        })
      );

      successRows++;
      totalAmountCents += validation.amountCents!;
      if (shouldQueueReceipt) receiptsQueued++;
    } catch (err) {
      failedRows++;
      const message = err instanceof Error ? err.message : "Import failed";
      await prisma.externalDonationImportRow.upsert({
        where: { importBatchId_rowNumber: { importBatchId: batch.id, rowNumber } },
        create: { importBatchId: batch.id, rowNumber, rawDataJson: mapped as unknown as Prisma.InputJsonValue, fingerprint, status: "FAILED", errorsJson: [message] },
        update: { status: "FAILED", errorsJson: [message] },
      });
    }
  }

  const finalStatus = failedRows === 0 ? "COMPLETED" : successRows > 0 ? "COMPLETED_WITH_ERRORS" : "FAILED";

  const updatedBatch = await prisma.externalDonationImportBatch.update({
    where: { id: batch.id },
    data: {
      status: finalStatus,
      successRows,
      failedRows,
      skippedRows,
      totalAmountCents,
      receiptsQueued,
      completedAt: new Date(),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: finalStatus === "FAILED" ? "external_donation_import.failed" : "external_donation_import.completed",
    entityType: "ExternalDonationImportBatch",
    entityId: batch.id,
    metadata: { successRows, failedRows, skippedRows, totalAmountCents, newDonorsCreated, donorsMatched, receiptsQueued },
    req,
  });

  return NextResponse.json({ batch: updatedBatch, successRows, failedRows, skippedRows, totalAmountCents, newDonorsCreated, donorsMatched, receiptsQueued });
}

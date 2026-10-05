import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/donors/donorContact";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { resolveOrCreateDonorWithMatchReview } from "@/lib/donors/resolveOrCreateDonorWithMatchReview";
import { classifySource } from "@/lib/donations/externalDonationTypes";
import {
  parseCsv,
  suggestColumnMapping as suggestDonationColumnMapping,
  mapRow as mapDonationRow,
  validateMappedRow as validateDonationRow,
  computeRowFingerprint,
  IMPORT_FIELD_LABELS as DONATION_FIELD_LABELS,
  REQUIRED_IMPORT_FIELDS as DONATION_REQUIRED_FIELDS,
  type ColumnMapping as DonationColumnMapping,
  type MappedImportRow as MappedDonationRow,
} from "@/lib/donations/externalDonationImport";
import { suggestDonorColumnMapping, mapDonorRow, validateImportRowInput, type DonorColumnMapping } from "@/lib/migrations/donorImportMapping";
import { suggestFundColumnMapping, mapFundRow, validateFundRow, FUND_REQUIRED_FIELDS, FUND_IMPORT_FIELD_LABELS, type FundColumnMapping } from "@/lib/migrations/fundImport";
import { computeMigrationFingerprint } from "@/lib/migrations/migrationFingerprint";
import { MIGRATION_ROW_CAP, MIGRATION_JOB_CHUNK_SIZE, type MigrationEntityType, type StagedMigrationRow, type MigrationJobView } from "@/lib/migrations/types";

export interface MigrationPreviewRow {
  rowNumber: number;
  fields: Record<string, string | null>;
  label: string;
  status: "valid" | "warning" | "invalid" | "duplicate";
  errors: string[];
  warnings: string[];
  possibleDuplicate: boolean;
  duplicateReason: string | null;
}

export interface MigrationPreviewResult {
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  mapping: Record<string, string | null>;
  missingRequiredFields: string[];
  rows: MigrationPreviewRow[];
  summary: { totalRows: number; validRows: number; warningRows: number; invalidRows: number; possibleDuplicates: number };
  cappedAt: number | null;
}

function toView(job: {
  id: string;
  sourceSystem: string;
  status: string;
  entityTypesJson: unknown;
  fileName: string | null;
  totalRecords: number;
  processedRecords: number;
  succeededRecords: number;
  failedRecords: number;
  skippedRecords: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): MigrationJobView {
  return {
    id: job.id,
    sourceSystem: job.sourceSystem,
    status: job.status as MigrationJobView["status"],
    entityTypes: (job.entityTypesJson as MigrationEntityType[]) ?? [],
    fileName: job.fileName,
    totalRecords: job.totalRecords,
    processedRecords: job.processedRecords,
    succeededRecords: job.succeededRecords,
    failedRecords: job.failedRecords,
    skippedRecords: job.skippedRecords,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

/** Read-only preview — re-run at commit time server-side, never trusted
 * verbatim, matching the existing donation/donor import preview routes. */
export async function previewMigrationSource(
  churchId: string,
  entityType: MigrationEntityType,
  csvText: string,
  requestedMapping?: Record<string, string | null>
): Promise<MigrationPreviewResult> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error("The file appears to be empty");
  const [headerRow, ...dataRows] = rows;
  const capped = dataRows.slice(0, MIGRATION_ROW_CAP);

  if (entityType === "DONATION_HISTORY") {
    const mapping: DonationColumnMapping = (requestedMapping as DonationColumnMapping) || suggestDonationColumnMapping(headerRow);
    const missingRequired = DONATION_REQUIRED_FIELDS.filter((f) => !Object.values(mapping).includes(f));

    const [existingDonations] = await Promise.all([
      prisma.externalDonation.findMany({
        where: { churchId, status: { not: "VOIDED" } },
        select: { donationAmountCents: true, donationDate: true, externalTransactionId: true, confirmationNumber: true, checkNumber: true, importFingerprint: true },
        take: 5000,
      }),
    ]);
    const existingFingerprints = new Set(existingDonations.map((d) => d.importFingerprint).filter(Boolean));
    const seenInFile = new Set<string>();

    const previewRows: MigrationPreviewRow[] = capped.map((row, idx) => {
      const rowNumber = idx + 1;
      const mapped = mapDonationRow(headerRow, row, mapping);
      const validation = validateDonationRow(mapped);
      const fingerprint = computeRowFingerprint(churchId, {
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
        duplicateReason = "Matches a donation already recorded";
      } else if (seenInFile.has(fingerprint)) {
        possibleDuplicate = true;
        duplicateReason = "Duplicate of another row in this file";
      }
      seenInFile.add(fingerprint);

      const status: MigrationPreviewRow["status"] =
        validation.errors.length > 0 ? "invalid" : possibleDuplicate ? "duplicate" : validation.warnings.length > 0 ? "warning" : "valid";

      return {
        rowNumber,
        fields: mapped as unknown as Record<string, string | null>,
        label: [mapped.donorFirstName, mapped.donorLastName].filter(Boolean).join(" ") || mapped.donorEmail || "Unnamed donor",
        status,
        errors: validation.errors,
        warnings: validation.warnings,
        possibleDuplicate,
        duplicateReason,
      };
    });

    return buildResult(headerRow, suggestDonationColumnMapping(headerRow), mapping, missingRequired.map((f) => DONATION_FIELD_LABELS[f]), previewRows, dataRows.length);
  }

  if (entityType === "DONOR") {
    const mapping: DonorColumnMapping = (requestedMapping as DonorColumnMapping) || suggestDonorColumnMapping(headerRow);
    const existingDonors = await prisma.donor.findMany({ where: { churchId, archivedAt: null, normalizedEmail: { not: null } }, select: { normalizedEmail: true } });
    const existingEmails = new Set(existingDonors.map((d) => d.normalizedEmail!));
    const seenInFile = new Set<string>();

    const previewRows: MigrationPreviewRow[] = capped.map((row, idx) => {
      const rowNumber = idx + 1;
      const mapped = mapDonorRow(headerRow, row, mapping);
      const errors = validateImportRowInput(mapped);
      const normalizedEmail = normalizeEmail(mapped.email);

      let possibleDuplicate = false;
      let duplicateReason: string | null = null;
      if (normalizedEmail && existingEmails.has(normalizedEmail)) {
        possibleDuplicate = true;
        duplicateReason = "Matches an existing donor — will update, not duplicate";
      } else if (normalizedEmail && seenInFile.has(normalizedEmail)) {
        possibleDuplicate = true;
        duplicateReason = "Duplicate of another row in this file";
      }
      if (normalizedEmail) seenInFile.add(normalizedEmail);

      const status: MigrationPreviewRow["status"] = errors.length > 0 ? "invalid" : possibleDuplicate ? "duplicate" : "valid";

      return {
        rowNumber,
        fields: mapped as unknown as Record<string, string | null>,
        label: mapped.name || mapped.email || mapped.companyName || "Unnamed donor",
        status,
        errors,
        warnings: [],
        possibleDuplicate,
        duplicateReason,
      };
    });

    return buildResult(headerRow, suggestDonorColumnMapping(headerRow), mapping, [], previewRows, dataRows.length);
  }

  // FUND
  const mapping: FundColumnMapping = (requestedMapping as FundColumnMapping) || suggestFundColumnMapping(headerRow);
  const missingRequired = FUND_REQUIRED_FIELDS.filter((f) => !Object.values(mapping).includes(f));
  const existingFunds = await prisma.fund.findMany({ where: { churchId }, select: { name: true } });
  const existingFundNames = new Set(existingFunds.map((f) => f.name.toLowerCase()));
  const seenInFile = new Set<string>();

  const previewRows: MigrationPreviewRow[] = capped.map((row, idx) => {
    const rowNumber = idx + 1;
    const mapped = mapFundRow(headerRow, row, mapping);
    const validation = validateFundRow(mapped);
    const nameLower = validation.name?.toLowerCase() ?? null;

    let possibleDuplicate = false;
    let duplicateReason: string | null = null;
    if (nameLower && existingFundNames.has(nameLower)) {
      possibleDuplicate = true;
      duplicateReason = "A fund with this name already exists — will update, not duplicate";
    } else if (nameLower && seenInFile.has(nameLower)) {
      possibleDuplicate = true;
      duplicateReason = "Duplicate of another row in this file";
    }
    if (nameLower) seenInFile.add(nameLower);

    const status: MigrationPreviewRow["status"] = validation.errors.length > 0 ? "invalid" : possibleDuplicate ? "duplicate" : "valid";

    return {
      rowNumber,
      fields: mapped as unknown as Record<string, string | null>,
      label: validation.name || "Unnamed fund",
      status,
      errors: validation.errors,
      warnings: validation.warnings,
      possibleDuplicate,
      duplicateReason,
    };
  });

  return buildResult(headerRow, suggestFundColumnMapping(headerRow), mapping, missingRequired.map((f) => FUND_IMPORT_FIELD_LABELS[f]), previewRows, dataRows.length);
}

function buildResult(
  headers: string[],
  suggestedMapping: Record<string, string | null>,
  mapping: Record<string, string | null>,
  missingRequiredFields: string[],
  rows: MigrationPreviewRow[],
  totalDataRows: number
): MigrationPreviewResult {
  return {
    headers,
    suggestedMapping,
    mapping,
    missingRequiredFields,
    rows,
    summary: {
      totalRows: rows.length,
      validRows: rows.filter((r) => r.status === "valid").length,
      warningRows: rows.filter((r) => r.status === "warning").length,
      invalidRows: rows.filter((r) => r.status === "invalid").length,
      possibleDuplicates: rows.filter((r) => r.possibleDuplicate).length,
    },
    cappedAt: totalDataRows > MIGRATION_ROW_CAP ? MIGRATION_ROW_CAP : null,
  };
}

export async function createMigrationJob(churchId: string, createdByUserId: string | null, sourceSystem: string): Promise<MigrationJobView> {
  const job = await prisma.migrationJob.create({
    data: { churchId, sourceSystem, status: "DRAFT", entityTypesJson: [], createdByUserId },
  });
  return toView(job);
}

/**
 * Re-validates the CSV server-side (never trusts the client's preview
 * response, same rule as every other import route in this codebase),
 * persists a MigrationRecord per row for full auditability, and stages
 * importable rows into the job's sourceDataJson queue for chunked
 * processing. Skipped/invalid rows are recorded but never staged.
 */
export async function commitMigrationEntitySource(params: {
  jobId: string;
  churchId: string;
  entityType: MigrationEntityType;
  csvText: string;
  fileName: string;
  mapping: Record<string, string | null>;
  skipRowNumbers: number[];
}): Promise<MigrationJobView> {
  const { jobId, churchId, entityType, csvText, mapping, skipRowNumbers } = params;
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId } });
  if (!job) throw new Error("Migration job not found");

  const preview = await previewMigrationSource(churchId, entityType, csvText, mapping);
  const skipSet = new Set(skipRowNumbers);
  const staged: StagedMigrationRow[] = [];

  const recordCreates: Prisma.MigrationRecordCreateManyInput[] = preview.rows.map((row) => {
    const willImport = !skipSet.has(row.rowNumber) && row.status !== "invalid";
    if (willImport) staged.push({ entityType, rowNumber: row.rowNumber, fields: row.fields });

    const fingerprint =
      entityType === "DONATION_HISTORY"
        ? computeRowFingerprint(churchId, {
            donorEmail: row.fields.donorEmail ?? null,
            donorFirstName: row.fields.donorFirstName ?? null,
            donorLastName: row.fields.donorLastName ?? null,
            amountCents: null,
            donationDate: row.fields.donationDate ?? null,
            referenceNumber: row.fields.referenceNumber ?? null,
          })
        : computeMigrationFingerprint(churchId, entityType, Object.values(row.fields));

    return {
      migrationJobId: jobId,
      churchId,
      entityType,
      rowNumber: row.rowNumber,
      rawDataJson: row.fields as Prisma.InputJsonValue,
      fingerprint,
      status: skipSet.has(row.rowNumber) ? "SKIPPED" : row.status === "invalid" ? "INVALID" : row.status === "duplicate" ? "DUPLICATE" : "VALID",
    };
  });

  await prisma.$transaction([
    prisma.migrationRecord.createMany({ data: recordCreates }),
    ...(preview.rows
      .filter((r) => r.errors.length > 0)
      .map((r) => prisma.migrationError.create({ data: { migrationJobId: jobId, churchId, entityType, rowNumber: r.rowNumber, message: r.errors.join("; ") } }))),
    prisma.migrationMapping.upsert({
      where: { migrationJobId_entityType: { migrationJobId: jobId, entityType } },
      create: { migrationJobId: jobId, entityType, columnMappingJson: mapping as Prisma.InputJsonValue },
      update: { columnMappingJson: mapping as Prisma.InputJsonValue },
    }),
  ]);

  const existingStaged = ((job.sourceDataJson as StagedMigrationRow[] | null) ?? []).filter((r) => r.entityType !== entityType);
  const existingEntityTypes = new Set((job.entityTypesJson as MigrationEntityType[]) ?? []);
  existingEntityTypes.add(entityType);
  const combined = [...existingStaged, ...staged];

  const updated = await prisma.migrationJob.update({
    where: { id: jobId },
    data: {
      status: "READY",
      fileName: params.fileName,
      entityTypesJson: [...existingEntityTypes] as unknown as Prisma.InputJsonValue,
      sourceDataJson: combined as unknown as Prisma.InputJsonValue,
      totalRecords: combined.length,
    },
  });

  return toView(updated);
}

/**
 * Advances a job by one chunk. Idempotent past COMPLETED/FAILED — same
 * contract as processBulkReceiptJobChunk. Processes FUND rows first (so
 * DONATION_HISTORY rows referencing a fund by name can resolve it), then
 * DONOR, then DONATION_HISTORY — ordering only matters for that fund
 * lookup; each row is otherwise independent.
 */
export async function processMigrationJobChunk(jobId: string, churchId: string, actorUserId: string | null): Promise<MigrationJobView> {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId } });
  if (!job) throw new Error("Migration job not found");
  if (job.status === "COMPLETED" || job.status === "COMPLETED_WITH_ERRORS" || job.status === "FAILED" || job.status === "CANCELLED") return toView(job);

  const entityOrder: Record<MigrationEntityType, number> = { FUND: 0, DONOR: 1, DONATION_HISTORY: 2 };
  const allRows = ((job.sourceDataJson as StagedMigrationRow[] | null) ?? []).slice().sort((a, b) => entityOrder[a.entityType] - entityOrder[b.entityType]);
  const chunk = allRows.slice(job.processedRecords, job.processedRecords + MIGRATION_JOB_CHUNK_SIZE);

  let succeededDelta = 0;
  let failedDelta = 0;

  for (const row of chunk) {
    try {
      const resultEntityId = await importOneRow(churchId, row, actorUserId);
      succeededDelta++;
      await prisma.migrationRecord.updateMany({
        where: { migrationJobId: jobId, entityType: row.entityType, rowNumber: row.rowNumber },
        data: { status: "IMPORTED", resultEntityId },
      });
    } catch (err) {
      failedDelta++;
      const message = err instanceof Error ? err.message : "Import failed";
      await prisma.$transaction([
        prisma.migrationRecord.updateMany({ where: { migrationJobId: jobId, entityType: row.entityType, rowNumber: row.rowNumber }, data: { status: "FAILED" } }),
        prisma.migrationError.create({ data: { migrationJobId: jobId, churchId, entityType: row.entityType, rowNumber: row.rowNumber, message } }),
      ]);
    }
  }

  const newProcessedCount = job.processedRecords + chunk.length;
  const isDone = newProcessedCount >= allRows.length;
  const newSucceeded = job.succeededRecords + succeededDelta;
  const newFailed = job.failedRecords + failedDelta;

  const updated = await prisma.migrationJob.update({
    where: { id: jobId },
    data: {
      processedRecords: newProcessedCount,
      succeededRecords: newSucceeded,
      failedRecords: newFailed,
      status: isDone ? (newFailed > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED") : "IMPORTING",
      startedAt: job.startedAt ?? new Date(),
      completedAt: isDone ? new Date() : null,
    },
  });

  return toView(updated);
}

async function importOneRow(churchId: string, row: StagedMigrationRow, actorUserId: string | null): Promise<string> {
  if (row.entityType === "FUND") {
    const validation = validateFundRow(row.fields as unknown as Parameters<typeof validateFundRow>[0]);
    if (validation.errors.length > 0 || !validation.name) throw new Error(validation.errors.join("; ") || "Invalid fund row");

    const existing = await prisma.fund.findFirst({ where: { churchId, name: { equals: validation.name, mode: "insensitive" } } });
    if (existing) {
      const updated = await prisma.fund.update({ where: { id: existing.id }, data: { description: validation.description ?? existing.description, isActive: validation.isActive } });
      return updated.id;
    }
    const maxOrder = await prisma.fund.aggregate({ where: { churchId }, _max: { displayOrder: true } });
    const created = await prisma.fund.create({
      data: { churchId, name: validation.name, description: validation.description, isActive: validation.isActive, displayOrder: (maxOrder._max.displayOrder ?? 0) + 1 },
    });
    return created.id;
  }

  if (row.entityType === "DONOR") {
    const input = row.fields as unknown as Parameters<typeof validateImportRowInput>[0];
    const errors = validateImportRowInput(input);
    if (errors.length > 0) throw new Error(errors.join("; "));
    const result = await resolveOrCreateDonor({
      churchId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
      companyName: input.companyName,
      addressSource: input.addressSource || (input.addressLine1 ? "CRM_IMPORT" : null),
      addressConfirmedDate: input.addressConfirmedDate,
    });
    return result.id;
  }

  // DONATION_HISTORY
  const mapped = row.fields as unknown as MappedDonationRow;
  const validation = validateDonationRow(mapped);
  if (validation.errors.length > 0) throw new Error(validation.errors.join("; "));

  let donorId: string | null = null;
  let donorMatchStatus: "MATCHED" | "ANONYMOUS" | "UNMATCHED" = "UNMATCHED";
  let isAnonymous = false;
  if (validation.isAnonymous) {
    isAnonymous = true;
    donorMatchStatus = "ANONYMOUS";
  } else if (validation.donorName || mapped.donorEmail || mapped.donorPhone) {
    const resolved = await resolveOrCreateDonorWithMatchReview({
      churchId,
      name: validation.donorName,
      email: mapped.donorEmail as string | null,
      phone: mapped.donorPhone as string | null,
      sourceType: "MIGRATION_IMPORT",
      donationAmountCents: validation.amountCents ?? undefined,
      donationDate: validation.donationDate ?? undefined,
      actorUserId,
      req: undefined,
    });
    donorId = resolved.id;
    donorMatchStatus = "MATCHED";
  }

  let fundId: string | null = null;
  const fundName = mapped.fund as string | null;
  if (fundName) {
    const existingFund = await prisma.fund.findFirst({ where: { churchId, name: { equals: fundName, mode: "insensitive" } } });
    fundId = existingFund?.id ?? null;
  }

  const source = classifySource(validation.paymentMethod!);
  const fingerprint = computeRowFingerprint(churchId, {
    donorEmail: mapped.donorEmail as string | null,
    donorFirstName: mapped.donorFirstName as string | null,
    donorLastName: mapped.donorLastName as string | null,
    amountCents: validation.amountCents,
    donationDate: mapped.donationDate as string | null,
    referenceNumber: mapped.referenceNumber as string | null,
  });

  const created = await prisma.externalDonation.create({
    data: {
      churchId,
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
      campaign: mapped.campaign as string | null,
      externalTransactionId: mapped.referenceNumber as string | null,
      confirmationNumber: mapped.referenceNumber as string | null,
      internalNote: mapped.notes as string | null,
      includeInAnnualStatement: true,
      isTaxDeductible: validation.isTaxDeductible,
      deductibleAmountCents: validation.deductibleAmountCents,
      goodsOrServicesProvided: validation.goodsOrServicesProvided,
      goodsOrServicesValueCents: validation.goodsOrServicesValueCents,
      status: "RECEIVED",
      processedByWgc: false,
      processingFeeCents: 0,
      supplementalFeeCents: 0,
      importFingerprint: fingerprint,
    },
  });
  return created.id;
}

export async function getMigrationJob(jobId: string, churchId: string): Promise<MigrationJobView | null> {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId } });
  return job ? toView(job) : null;
}

export async function listMigrationJobs(churchId: string): Promise<MigrationJobView[]> {
  const jobs = await prisma.migrationJob.findMany({ where: { churchId }, orderBy: { createdAt: "desc" }, take: 50 });
  return jobs.map(toView);
}

export interface MigrationReconciliation {
  job: MigrationJobView;
  errorsByEntityType: Record<string, { rowNumber: number; message: string }[]>;
}

export async function getMigrationReconciliation(jobId: string, churchId: string): Promise<MigrationReconciliation | null> {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, churchId } });
  if (!job) return null;
  const errors = await prisma.migrationError.findMany({ where: { migrationJobId: jobId, churchId }, orderBy: { rowNumber: "asc" }, take: 500 });
  const errorsByEntityType: MigrationReconciliation["errorsByEntityType"] = {};
  for (const e of errors) {
    (errorsByEntityType[e.entityType] ??= []).push({ rowNumber: e.rowNumber, message: e.message });
  }
  return { job: toView(job), errorsByEntityType };
}

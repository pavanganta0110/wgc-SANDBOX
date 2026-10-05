/**
 * WGC Migration Center — shared types.
 *
 * v1 only implements sourceSystem "CSV_GENERIC" — every other source needs
 * that vendor's OAuth app registered before a connector can be built, which
 * is an external decision, not a technical one. They're listed here so the
 * "Select Source" step can show them as Coming Soon rather than omit them.
 */
export const MIGRATION_SOURCE_SYSTEMS = [
  "CSV_GENERIC",
  "STRIPE",
  "AUTHORIZE_NET",
  "PLANNING_CENTER",
  "GIVEBUTTER",
  "PUSHPAY",
  "SUBSPLASH",
  "PAYPAL",
] as const;
export type MigrationSourceSystem = (typeof MIGRATION_SOURCE_SYSTEMS)[number];

export const IMPLEMENTED_SOURCE_SYSTEMS: readonly MigrationSourceSystem[] = ["CSV_GENERIC"];

export const MIGRATION_SOURCE_LABELS: Record<MigrationSourceSystem, string> = {
  CSV_GENERIC: "CSV File",
  STRIPE: "Stripe",
  AUTHORIZE_NET: "Authorize.Net",
  PLANNING_CENTER: "Planning Center",
  GIVEBUTTER: "Givebutter",
  PUSHPAY: "Pushpay",
  SUBSPLASH: "Subsplash",
  PAYPAL: "PayPal",
};

export const MIGRATION_ENTITY_TYPES = ["DONOR", "DONATION_HISTORY", "FUND"] as const;
export type MigrationEntityType = (typeof MIGRATION_ENTITY_TYPES)[number];

export const MIGRATION_ENTITY_LABELS: Record<MigrationEntityType, string> = {
  DONOR: "Donors",
  DONATION_HISTORY: "Donation History",
  FUND: "Funds & Designations",
};

export type MigrationJobStatus = "DRAFT" | "MAPPING" | "VALIDATING" | "READY" | "IMPORTING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED" | "CANCELLED";

export type MigrationRecordStatus = "PENDING" | "VALID" | "WARNING" | "INVALID" | "DUPLICATE" | "IMPORTED" | "SKIPPED" | "FAILED";

export const MIGRATION_ROW_CAP = 5000;
export const MIGRATION_JOB_CHUNK_SIZE = 25;

export interface MigrationJobView {
  id: string;
  sourceSystem: string;
  status: MigrationJobStatus;
  entityTypes: MigrationEntityType[];
  fileName: string | null;
  totalRecords: number;
  processedRecords: number;
  succeededRecords: number;
  failedRecords: number;
  skippedRecords: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** One row as staged for processing — the raw mapped fields plus which
 * entity type it belongs to, persisted on the job at commit time. */
export interface StagedMigrationRow {
  entityType: MigrationEntityType;
  rowNumber: number;
  fields: Record<string, string | null>;
}

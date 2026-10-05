/** Field mapping/validation for the FUND entity type — new for Migration
 * Center; no fund CSV import existed before this. Deliberately minimal,
 * mirroring the shape Fund actually has (name, description, isActive). */

export const FUND_IMPORT_FIELD_KEYS = ["name", "description", "isActive"] as const;
export type FundImportFieldKey = (typeof FUND_IMPORT_FIELD_KEYS)[number];

export const FUND_IMPORT_FIELD_LABELS: Record<FundImportFieldKey, string> = {
  name: "Fund Name",
  description: "Description",
  isActive: "Active",
};

export const FUND_REQUIRED_FIELDS: readonly FundImportFieldKey[] = ["name"];

export const FUND_HEADER_ALIASES: Record<string, FundImportFieldKey> = {
  name: "name",
  "fund name": "name",
  "fund": "name",
  designation: "name",
  fund_name: "name",
  description: "description",
  notes: "description",
  active: "isActive",
  is_active: "isActive",
  status: "isActive",
};

export type FundColumnMapping = Record<string, FundImportFieldKey | null>;

export function suggestFundColumnMapping(headers: string[]): FundColumnMapping {
  const mapping: FundColumnMapping = {};
  for (const header of headers) {
    mapping[header] = FUND_HEADER_ALIASES[header.trim().toLowerCase()] ?? null;
  }
  return mapping;
}

export interface MappedFundRow {
  name: string | null;
  description: string | null;
  isActive: string | null;
}

function clean(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapFundRow(headers: string[], row: string[], mapping: FundColumnMapping): MappedFundRow {
  const result: MappedFundRow = { name: null, description: null, isActive: null };
  headers.forEach((header, i) => {
    const key = mapping[header];
    if (!key) return;
    result[key] = clean(row[i]);
  });
  return result;
}

export interface FundRowValidation {
  errors: string[];
  warnings: string[];
  name: string | null;
  description: string | null;
  isActive: boolean;
}

export function validateFundRow(row: MappedFundRow): FundRowValidation {
  const errors: string[] = [];
  if (!row.name) errors.push("Missing fund name");

  let isActive = true;
  if (row.isActive) {
    const v = row.isActive.trim().toLowerCase();
    if (["no", "false", "0", "inactive", "archived"].includes(v)) isActive = false;
    else if (!["yes", "true", "1", "active"].includes(v)) errors.push('Invalid value for "Active" — use yes or no');
  }

  return { errors, warnings: [], name: row.name, description: row.description, isActive };
}

/** Customizable column-mapping variant of the DONOR entity type for
 * Migration Center. The existing donor CSV importer (src/lib/donors/
 * csvImport.ts) auto-maps headers with no user override step; Migration
 * Center's wizard needs an adjustable mapping (per the "Field Mapping"
 * step), so this wraps the same alias table and validation rather than
 * duplicating them. */
import { HEADER_ALIASES, type ImportRowInput, validateImportRowInput } from "@/lib/donors/csvImport";

export type { ImportRowInput };
export { validateImportRowInput };

export const DONOR_IMPORT_FIELD_KEYS = ["name", "email", "phone", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "companyName"] as const;
export type DonorImportFieldKey = (typeof DONOR_IMPORT_FIELD_KEYS)[number];

export const DONOR_IMPORT_FIELD_LABELS: Record<DonorImportFieldKey, string> = {
  name: "Full Name",
  email: "Email",
  phone: "Phone",
  addressLine1: "Address Line 1",
  addressLine2: "Address Line 2",
  city: "City",
  state: "State",
  postalCode: "Postal Code",
  country: "Country",
  companyName: "Company Name",
};

export type DonorColumnMapping = Record<string, DonorImportFieldKey | null>;

export function suggestDonorColumnMapping(headers: string[]): DonorColumnMapping {
  const mapping: DonorColumnMapping = {};
  for (const header of headers) {
    const key = HEADER_ALIASES[header.trim().toLowerCase()];
    mapping[header] = key && (DONOR_IMPORT_FIELD_KEYS as readonly string[]).includes(key) ? (key as DonorImportFieldKey) : null;
  }
  return mapping;
}

function clean(value: string | undefined, maxLength = 200): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

export function mapDonorRow(headers: string[], row: string[], mapping: DonorColumnMapping): ImportRowInput {
  const result: ImportRowInput = {
    name: null,
    email: null,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    companyName: null,
    addressSource: null,
    addressConfirmedDate: null,
  };
  headers.forEach((header, i) => {
    const key = mapping[header];
    if (!key) return;
    result[key] = clean(row[i], key === "email" ? 320 : key === "phone" ? 30 : 200);
  });
  return result;
}

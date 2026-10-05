import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

export const IMPORT_ROW_CAP = 2000;

export const HEADER_ALIASES: Record<string, keyof ImportRowInput> = {
  name: "name",
  "donor name": "name",
  "full name": "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  "address line 1": "addressLine1",
  address: "addressLine1",
  "address 1": "addressLine1",
  street: "addressLine1",
  "street address": "addressLine1",
  "address line 2": "addressLine2",
  "address 2": "addressLine2",
  apt: "addressLine2",
  suite: "addressLine2",
  city: "city",
  state: "state",
  "postal code": "postalCode",
  postal: "postalCode",
  zipcode: "postalCode",
  zip: "postalCode",
  "zip code": "postalCode",
  country: "country",
  company: "companyName",
  "company name": "companyName",
  organization: "companyName",
  "address source": "addressSource",
  "address confirmed date": "addressConfirmedDate",
  "address confirmed": "addressConfirmedDate",
};

/**
 * Contact-style spreadsheets split the name across two columns. These feed
 * `name` (joined) rather than being fields of their own, so every consumer
 * of ImportRowInput — including Migration Center's remappable importer —
 * keeps working unchanged.
 */
const FIRST_NAME_HEADERS = new Set(["first name", "firstname", "first_name", "given name", "first"]);
const LAST_NAME_HEADERS = new Set(["last name", "lastname", "last_name", "surname", "family name", "last"]);
/** Free-text "where did this contact come from / anything to remember" column. */
const NOTE_HEADERS = new Set(["notes", "note", "source", "comments", "comment", "contact source", "source/notes", "source / notes"]);

export interface ImportRowInput {
  name: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  companyName: string | null;
  addressSource: string | null;
  addressConfirmedDate: string | null;
  /** Optional free text from a Source/Notes column; saved as a donor note on newly created contacts only. */
  notes?: string | null;
}

export interface ImportRowResult {
  rowNumber: number; // 1-indexed, excludes header row
  input: ImportRowInput;
  status: "valid" | "error" | "duplicate_in_file" | "duplicate_in_org";
  errors: string[];
  normalizedEmail: string | null;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes (""), commas/newlines inside quotes, and CRLF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function clean(value: string | undefined, maxLength = 200): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

export function mapCsvRow(headers: string[], row: string[]): ImportRowInput {
  const input: ImportRowInput = {
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
  let firstName: string | null = null;
  let lastName: string | null = null;
  const notes: string[] = [];
  headers.forEach((rawHeader, i) => {
    const header = rawHeader.trim().toLowerCase();
    if (FIRST_NAME_HEADERS.has(header)) firstName = clean(row[i], 100);
    else if (LAST_NAME_HEADERS.has(header)) lastName = clean(row[i], 100);
    else if (NOTE_HEADERS.has(header)) {
      const note = clean(row[i], 500);
      if (note) notes.push(note);
    }
    const key = HEADER_ALIASES[header];
    if (!key) return;
    input[key] = clean(row[i], key === "email" ? 320 : key === "phone" ? 30 : 200);
  });
  // An explicit full-name column always wins over First/Last.
  if (!input.name && (firstName || lastName)) {
    input.name = [firstName, lastName].filter(Boolean).join(" ").slice(0, 200);
  }
  if (notes.length > 0) input.notes = notes.join(" — ").slice(0, 1000);
  return input;
}

const VALID_IMPORT_ADDRESS_SOURCES = new Set(["CRM_IMPORT", "CSV_IMPORT", "EXISTING_ORGANIZATION_RECORD", "OTHER"]);

export function validateImportRowInput(input: ImportRowInput): string[] {
  const errors: string[] = [];
  // An email is enough to identify a contact (a mailing-list or guest-list
  // export often has no name column filled in). Without an email, a phone
  // number alone is not enough — a nameless phone row can't be told apart.
  if (!input.name && !input.companyName && !input.email) errors.push("Missing donor name");
  if (input.email && !isValidEmail(input.email)) errors.push("Invalid email");
  if (input.phone && !isValidPhone(input.phone)) errors.push("Invalid phone number");
  if (!input.email && !input.phone) errors.push("At least one of email or phone is required");
  if (input.addressSource && !VALID_IMPORT_ADDRESS_SOURCES.has(input.addressSource.toUpperCase())) {
    errors.push("Invalid address source (use CSV_IMPORT, CRM_IMPORT, EXISTING_ORGANIZATION_RECORD, or OTHER)");
  }
  if (input.addressConfirmedDate && Number.isNaN(Date.parse(input.addressConfirmedDate))) {
    errors.push("Invalid address confirmed date");
  }
  return errors;
}

/**
 * Parses and validates a whole CSV against the org's existing donor
 * normalized emails (no DB writes here — this is the read-only preview
 * step). A row is duplicate_in_file if an earlier row in the same file
 * already claims the same normalized email; duplicate_in_org if it matches
 * a donor already in the database.
 */
export function buildImportPreview(csvText: string, existingNormalizedEmails: Set<string>): ImportRowResult[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];

  const [headerRow, ...dataRows] = rows;
  const capped = dataRows.slice(0, IMPORT_ROW_CAP);
  const seenInFile = new Set<string>();

  return capped.map((row, idx) => {
    const input = mapCsvRow(headerRow, row);
    const normalizedEmail = normalizeEmail(input.email);
    const errors = validateImportRowInput(input);

    let status: ImportRowResult["status"] = errors.length > 0 ? "error" : "valid";
    if (status === "valid" && normalizedEmail) {
      if (seenInFile.has(normalizedEmail)) status = "duplicate_in_file";
      else if (existingNormalizedEmails.has(normalizedEmail)) status = "duplicate_in_org";
    }
    if (normalizedEmail && status === "valid") seenInFile.add(normalizedEmail);

    return { rowNumber: idx + 1, input, status, errors, normalizedEmail };
  });
}

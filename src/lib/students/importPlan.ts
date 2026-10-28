import { parseCsv } from "@/lib/donors/csvImport";
import { normalizeTermLabel } from "./constants";

export interface StudentImportRow {
  /** 1-indexed, excluding the header row. */
  rowNumber: number;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** Null when the row carries no charge. */
  termLabel: string | null;
  chargeCents: number | null;
  errors: string[];
}

export interface StudentImportParse {
  rows: StudentImportRow[];
  /** Set when the file can't be read at all (missing required columns). */
  fatalError?: string;
}

export const MAX_STUDENT_IMPORT_ROWS = 5000;

const HEADER_ALIASES: Record<string, string[]> = {
  studentNumber: ["student id", "studentid", "student number", "student no", "student #", "id", "student_id", "studentnumber"],
  firstName: ["first name", "firstname", "first", "given name", "first_name"],
  lastName: ["last name", "lastname", "last", "surname", "family name", "last_name"],
  fullName: ["name", "student name", "full name", "fullname"],
  email: ["email", "email address", "e-mail"],
  term: ["term", "semester", "term label"],
  charge: ["charge", "amount", "amount due", "tuition", "balance due", "total charge", "cost"],
};

function normHeader(h: string): string {
  return h.replace(/^﻿/, "").trim().toLowerCase();
}

function findColumn(headers: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key];
  return headers.findIndex((h) => aliases.includes(h));
}

/** "$4,200.50" | "4200" | "4,200.5" -> cents; null when not a valid amount. */
export function parseDollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (trimmed.includes(",")) {
    const [last, ...rest] = trimmed.split(",");
    return { firstName: rest.join(",").trim(), lastName: last.trim() };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * Parses a roster (and optionally charges) CSV into validated rows. Pure —
 * no database access — so every error is decided before anything is saved.
 * `defaultTermLabel` applies to rows that have a charge but no Term cell.
 */
export function parseStudentImport(csvText: string, defaultTermLabel?: string | null): StudentImportParse {
  const table = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return { rows: [], fatalError: "The file is empty." };

  const headers = table[0].map(normHeader);
  const idCol = findColumn(headers, "studentNumber");
  const firstCol = findColumn(headers, "firstName");
  const lastCol = findColumn(headers, "lastName");
  const fullCol = findColumn(headers, "fullName");
  const emailCol = findColumn(headers, "email");
  const termCol = findColumn(headers, "term");
  const chargeCol = findColumn(headers, "charge");

  if (idCol < 0) return { rows: [], fatalError: 'Missing a "Student ID" column.' };
  if (fullCol < 0 && (firstCol < 0 || lastCol < 0)) {
    return { rows: [], fatalError: 'Missing name columns — include "First Name" and "Last Name" (or a single "Name").' };
  }
  const dataRows = table.slice(1);
  if (dataRows.length > MAX_STUDENT_IMPORT_ROWS) {
    return { rows: [], fatalError: `Too many rows (${dataRows.length}); the limit is ${MAX_STUDENT_IMPORT_ROWS} per file.` };
  }

  const fallbackTerm = normalizeTermLabel(defaultTermLabel ?? null);
  const seen = new Set<string>();
  const rows: StudentImportRow[] = dataRows.map((cells, i) => {
    const cell = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
    const errors: string[] = [];

    const studentNumber = cell(idCol);
    if (!studentNumber) errors.push("Missing Student ID");

    let firstName = cell(firstCol);
    let lastName = cell(lastCol);
    if (fullCol >= 0 && !firstName && !lastName) {
      ({ firstName, lastName } = splitFullName(cell(fullCol)));
    }
    if (!firstName && !lastName) errors.push("Missing name");

    const email = cell(emailCol) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email");

    let chargeCents: number | null = null;
    let termLabel: string | null = null;
    const chargeRaw = cell(chargeCol);
    if (chargeRaw) {
      chargeCents = parseDollarsToCents(chargeRaw);
      if (chargeCents == null) errors.push(`Invalid charge "${chargeRaw}"`);
      termLabel = normalizeTermLabel(cell(termCol)) ?? fallbackTerm;
      if (!termLabel) errors.push("Charge has no term (add a Term column or choose a term)");
    }

    const key = `${studentNumber.toLowerCase()}|${termLabel ?? ""}`;
    if (studentNumber && chargeCents != null) {
      if (seen.has(key)) errors.push("Duplicate Student ID + term in this file");
      seen.add(key);
    }

    return { rowNumber: i + 1, studentNumber, firstName, lastName, email, termLabel, chargeCents, errors };
  });

  return { rows };
}

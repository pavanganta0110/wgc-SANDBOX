/**
 * Neutralizes spreadsheet-formula injection: a CSV cell starting with
 * =, +, -, or @ is interpreted as a formula by Excel/Google Sheets/etc.
 * when the file is opened, which can execute attacker-controlled content
 * (e.g. a donor name of `=HYPERLINK(...)` from an imported CSV row).
 * Prefixing with a leading apostrophe forces spreadsheet apps to treat the
 * cell as plain text while leaving the value visually unchanged for anyone
 * reading the raw CSV or re-importing it as data (the apostrophe is a
 * formatting hint, not a literal character, once opened as a spreadsheet).
 *
 * Purely additive — existing callers of buildCsvExport are unaffected
 * unless they opt in by calling this from their own column `value`
 * functions, same as the external-donations export does.
 */
export function sanitizeCsvFormulaValue(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string;
  // Column is only included when the exporting session's mask level allows it —
  // wired up per-export by the caller once role-based PII masking lands.
  requiresUnmasked?: boolean;
};

export function buildCsvExport<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  options: { maskLevel?: "none" | "partial" | "full" } = {}
): string {
  const visibleColumns =
    options.maskLevel === "full" ? columns.filter((c) => !c.requiresUnmasked) : columns;

  const lines = [visibleColumns.map((c) => csvEscape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(visibleColumns.map((c) => csvEscape(c.value(row))).join(","));
  }
  return lines.join("\n");
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

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

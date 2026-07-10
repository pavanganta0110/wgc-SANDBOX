/**
 * Formats a date/time fixed to America/Chicago (CDT/CST), independent of
 * the server or browser's local timezone — used on tables where the column
 * header itself states "(CDT)" so every row needs to actually be in that
 * zone, not whatever machine happens to render it.
 */
export function formatDateTimeCDT(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

export function formatDateCDT(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

export function formatTimeCDT(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

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

const CENTRAL_TIME_ZONE = "America/Chicago";

// Converts a wall-clock reading in America/Chicago into the correct UTC instant,
// accounting for DST (the offset depends on the date itself, not just the zone).
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const chicagoWallString = new Date(utcGuess).toLocaleString("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const [datePart, timePart] = chicagoWallString.split(", ");
  const [mo, da, yr] = datePart.split("/").map(Number);
  const [hh, mi, ss] = timePart.replace("24:", "00:").split(":").map(Number);
  const chicagoAsUtc = Date.UTC(yr, mo - 1, da, hh, mi, ss);
  const offset = utcGuess - chicagoAsUtc;
  return new Date(utcGuess + offset);
}

function centralDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Start/end of the calendar day (00:00:00 / 23:59:59) as observed in
 * America/Chicago, returned as UTC Dates. Used for date-range filter
 * boundaries ("Today", "This Month", etc.) so a transaction bucketed by
 * calendar day matches what a Central-time user actually expects,
 * regardless of the server's own timezone.
 */
export function startOfDayCentral(date: Date): Date {
  const { year, month, day } = centralDateParts(date);
  return zonedWallTimeToUtc(year, month, day, 0, 0, 0);
}

export function endOfDayCentral(date: Date): Date {
  const { year, month, day } = centralDateParts(date);
  return zonedWallTimeToUtc(year, month, day, 23, 59, 59);
}

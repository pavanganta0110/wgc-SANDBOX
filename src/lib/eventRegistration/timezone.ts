/**
 * Event dates are entered by a merchant as a wall-clock time in a chosen IANA
 * zone ("May 2, 6:00 PM Central") and stored as an absolute UTC instant —
 * the browser's own timezone must never decide when an event starts. No
 * date library is in this project, so the conversion uses Intl only.
 */

export const EVENT_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** How far `timeZone` is ahead of UTC at `date`, in ms (negative for the Americas). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/** "2026-05-02T18:00" interpreted in `timeZone` -> the matching UTC Date. Null if unparseable. */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = LOCAL_PATTERN.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00"] = m;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
  if (Number.isNaN(guess)) return null;
  const firstOffset = zoneOffsetMs(new Date(guess), timeZone);
  let result = guess - firstOffset;
  // A second pass settles instants that straddle a DST change.
  const secondOffset = zoneOffsetMs(new Date(result), timeZone);
  if (secondOffset !== firstOffset) result = guess - secondOffset;
  const date = new Date(result);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Inverse of zonedLocalToUtc — the "YYYY-MM-DDTHH:mm" string for a datetime-local input. */
export function utcToZonedLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatEventDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);
}

export function formatEventTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

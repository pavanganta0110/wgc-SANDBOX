export function titleCaseFromSnake(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  return value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function instrumentStateLabel(state: string | null | undefined): string {
  const s = (state || "").toUpperCase();
  if (s === "ENABLED") return "Enabled";
  if (s === "DISABLED") return "Disabled";
  if (s === "DELETED") return "Deleted";
  return "—";
}

export function settlementStateLabel(state: string | null | undefined): string {
  const s = (state || "").toUpperCase();
  if (s === "ACCRUING") return "Accruing";
  if (s === "PENDING") return "Pending";
  if (s === "SETTLED") return "Settled";
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : "";
}

// "finix_dashboard" means the transfer was entered directly through the processor's
// own merchant console (e.g. by WGC support) rather than a donor using the giving
// page — labeled without naming the processor, per the no-vendor-name UI rule.
export function sourceLabel(source: string | null | undefined): string {
  if (source === "wgc_giving_page") return "WGC Giving Page";
  if (source === "wgc_giving_link") return "Giving Link";
  if (source === "wgc_admin_payment") return "Take a Payment";
  if (source === "finix_dashboard") return "Manual Entry";
  return "Unknown";
}

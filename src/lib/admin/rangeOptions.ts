/** Client-safe: the admin dashboard period choices (no server imports). */
export const ADMIN_RANGES = ["30d", "90d", "ytd", "12m", "all"] as const;
export type AdminRange = (typeof ADMIN_RANGES)[number];

export const ADMIN_RANGE_LABEL: Record<AdminRange, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  "12m": "Last 12 months",
  all: "All time",
};

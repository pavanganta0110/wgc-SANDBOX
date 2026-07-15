import { startOfDayCentral, endOfDayCentral, formatDateCDT } from "@/lib/formatDateTimeCDT";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

// Boundaries are computed in America/Chicago, not server-local time, so
// "Today"/"This Month"/etc. bucket transactions the way the business
// actually experiences the day, regardless of where the server (or a
// visitor's browser) happens to be.
const startOfDay = startOfDayCentral;
const endOfDay = endOfDayCentral;

export const RANGE_PRESETS: { key: string; label: string; compute: () => DateRange }[] = [
  {
    key: "today",
    label: "Today",
    compute: () => {
      const now = new Date();
      return { from: startOfDay(now), to: endOfDay(now) };
    },
  },
  {
    key: "yesterday",
    label: "Yesterday",
    compute: () => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    },
  },
  {
    key: "7d",
    label: "Last 7 Days",
    compute: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 7);
      return { from: startOfDay(from), to: endOfDay(to) };
    },
  },
  {
    key: "30d",
    label: "Last 30 Days",
    compute: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return { from: startOfDay(from), to: endOfDay(to) };
    },
  },
  {
    key: "3m",
    label: "Last 3 Months",
    compute: () => {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 3);
      return { from: startOfDay(from), to: endOfDay(to) };
    },
  },
  {
    key: "6m",
    label: "Last 6 Months",
    compute: () => {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      return { from: startOfDay(from), to: endOfDay(to) };
    },
  },
  {
    key: "mtd",
    label: "Month to date",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(from), to: endOfDay(now) };
    },
  },
  {
    key: "qtd",
    label: "Quarter to date",
    compute: () => {
      const now = new Date();
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const from = new Date(now.getFullYear(), quarterStartMonth, 1);
      return { from: startOfDay(from), to: endOfDay(now) };
    },
  },
  {
    key: "ytd",
    label: "Year to date",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: startOfDay(from), to: endOfDay(now) };
    },
  },
  {
    key: "prev_month",
    label: "Previous Month",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(from), to: endOfDay(to) };
    },
  },
  {
    key: "all",
    label: "All Time",
    compute: () => ({ from: null, to: null }),
  },
];

export const DEFAULT_RANGE_KEY = "6m";

export function resolveDateRange(rangeKey: string | undefined, from?: string, to?: string): DateRange {
  if (rangeKey === "custom" && from && to) {
    return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
  }

  const preset = RANGE_PRESETS.find((p) => p.key === rangeKey) ?? RANGE_PRESETS.find((p) => p.key === DEFAULT_RANGE_KEY)!;
  return preset.compute();
}

export function rangeLabel(rangeKey: string | undefined, from?: string, to?: string): string {
  if (rangeKey === "custom" && from && to) {
    return `${formatDateCDT(new Date(from))} - ${formatDateCDT(new Date(to))}`;
  }
  const preset = RANGE_PRESETS.find((p) => p.key === rangeKey);
  return preset?.label ?? RANGE_PRESETS.find((p) => p.key === DEFAULT_RANGE_KEY)!.label;
}

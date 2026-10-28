import type { StudentLedgerRow } from "./ledger";

export type StudentFilterKey = "all" | "full" | "partial" | "none" | "sponsored" | "self";

export const STUDENT_FILTERS: { key: StudentFilterKey; label: string; test: (r: StudentLedgerRow) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "full", label: "Fully paid", test: (r) => r.status === "FULLY_CREDITED" || r.status === "OVER_FUNDED" },
  { key: "partial", label: "Partially paid", test: (r) => r.status === "PARTIAL" },
  { key: "none", label: "Didn't pay", test: (r) => r.status === "UNFUNDED" },
  { key: "sponsored", label: "Got sponsor gifts", test: (r) => r.sponsorCents > 0 },
  { key: "self", label: "Self-funded", test: (r) => r.selfCents > 0 },
];

/** Resolves a query-string filter; "due" is the older link name for partially paid. */
export function resolveStudentFilter(raw: string | null | undefined) {
  const key = raw === "due" ? "partial" : raw;
  return STUDENT_FILTERS.find((f) => f.key === key) ?? STUDENT_FILTERS[0];
}

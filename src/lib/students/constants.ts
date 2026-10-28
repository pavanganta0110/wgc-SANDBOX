/** How a gift relates to the student it is credited toward. */
export const STUDENT_GIVEN_FOR = ["SPONSOR", "SELF", "GENERAL"] as const;
export type StudentGivenFor = (typeof STUDENT_GIVEN_FOR)[number];

export const STUDENT_GIVEN_FOR_LABEL: Record<StudentGivenFor, string> = {
  SPONSOR: "Sponsor",
  SELF: "Self-paid",
  GENERAL: "General scholarship",
};

export function isStudentGivenFor(value: unknown): value is StudentGivenFor {
  return typeof value === "string" && (STUDENT_GIVEN_FOR as readonly string[]).includes(value);
}

/** Free-text term, e.g. "Fall 2026" — trimmed, whitespace collapsed, capped. */
export function normalizeTermLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 40) : null;
}

export type StudentCreditStatus = "FULLY_CREDITED" | "PARTIAL" | "UNFUNDED" | "OVER_FUNDED" | "NO_CHARGE";

export const STUDENT_STATUS_LABEL: Record<StudentCreditStatus, string> = {
  FULLY_CREDITED: "Fully credited",
  PARTIAL: "Partially credited",
  UNFUNDED: "Unfunded",
  OVER_FUNDED: "Over-funded",
  NO_CHARGE: "No charge set",
};

/** Credited vs charge. Pending money is deliberately never counted here. */
export function computeStudentStatus(chargeCents: number | null, creditedCents: number): StudentCreditStatus {
  if (chargeCents == null) return "NO_CHARGE";
  if (creditedCents > chargeCents) return "OVER_FUNDED";
  if (creditedCents === chargeCents && chargeCents > 0) return "FULLY_CREDITED";
  if (chargeCents === 0) return "FULLY_CREDITED";
  if (creditedCents <= 0) return "UNFUNDED";
  return "PARTIAL";
}

export function studentDisplayName(s: { firstName: string; lastName: string }): string {
  return `${s.firstName} ${s.lastName}`.trim();
}

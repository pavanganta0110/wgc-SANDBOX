import { createHash } from "crypto";
import type { MigrationEntityType } from "@/lib/migrations/types";

/** Deterministic per-entity-type fingerprint, same role as
 * externalDonationImport.ts's computeRowFingerprint: a signal surfaced to
 * the user for duplicate review, never a hard uniqueness constraint. */
export function computeMigrationFingerprint(churchId: string, entityType: MigrationEntityType, parts: (string | number | null | undefined)[]): string {
  const normalized = parts.map((p) => (p == null ? "" : String(p)).trim().toLowerCase());
  return createHash("sha256").update([churchId, entityType, ...normalized].join("|")).digest("hex");
}
